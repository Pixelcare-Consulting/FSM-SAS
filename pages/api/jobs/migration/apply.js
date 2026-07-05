import { getSupabaseAdmin } from "../../../../lib/supabase/server";
import { customerService, jobService, userService } from "../../../../lib/supabase/database";
import { refreshTechnicianHoursForJobId } from "../../../../lib/supabase/technicianHours";
import sapService from "../../../../lib/services/sapService";
import { parseAifmAssignedTeches } from "../../../../lib/utils/aifmAssignedTechs";
import { matchTechnicianToAifmName } from "../../../../lib/utils/aifmTechnicianResolve";
import {
  writeAuditLogFromRequest,
  AUDIT_CATEGORIES,
  AUDIT_ACTIONS,
  AUDIT_STATUS,
  AUDIT_SOURCE,
} from "../../../../lib/services/auditLog";
import { getNextJobNumber } from "../../../../lib/jobs/getNextJobNumber";

function parseExcelDateTimeToIso(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;

  // Common format from the sample files: "YYYY-MM-DD HH:MM"
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s.replace(/\s+/, "T") + ":00Z");
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function mapPriority(value) {
  const v = (value || "").toString().trim().toLowerCase();
  if (!v) return "MEDIUM";
  if (v === "low") return "LOW";
  if (v === "high") return "HIGH";
  if (v === "urgent") return "URGENT";
  if (v === "normal" || v === "medium") return "MEDIUM";
  return "MEDIUM";
}

// Persist SAP numeric U_JobStatusID (e.g. 554, 555, -5) as-is; otherwise normalize legacy strings.
function mapStatus(value) {
  const v = (value || "").toString().trim();
  if (!v) return "554";
  if (/^-?\d+$/.test(v)) return v;
  const normalized = v.toUpperCase().replace(/\s+/g, "_");
  const allowed = new Set([
    "PENDING",
    "IN_PROGRESS",
    "UPCOMING",
    "OVERDUE",
    "WAITING",
    "COMPLETED",
    "CANCELLED",
    "CREATED",
  ]);
  return allowed.has(normalized) ? normalized : "554";
}

async function resolveOrCreateCustomerFromRow(row, supabase, options) {
  const sapId = (row["SAP ID"] || "").toString().trim();
  const firstName = (row["Customer FirstName"] || "").toString().trim();
  const lastName = (row["Customer LastName"] || "").toString().trim();
  const customerName = `${firstName} ${lastName}`.trim() || sapId || "Migrated Customer";

  if (!sapId) {
    throw new Error('Missing required column "SAP ID" (customer_code)');
  }

  // Reject portal-generated CP codes — these are not real SAP customers.
  // They were auto-created by old AIFM imports and must not be recreated.
  if (/^CP\d+$/i.test(sapId)) {
    throw new Error(`SAP ID "${sapId}" is a portal-generated code (CP…), not a real SAP CardCode. Skipping.`);
  }

  const existing = await customerService.findByCode(sapId, supabase);
  if (existing) return existing;

  if (!options.createMissingCustomers) {
    throw new Error(`Customer not found for SAP ID "${sapId}". Sync this customer from SAP first.`);
  }

  const customerPhone = (row["Customer Phone Number"] || "").toString().trim() || null;
  const customerEmail = (row["Customer Email"] || "").toString().trim() || null;

  const created = await customerService.create(
    {
      customer_code: sapId,
      customer_name: customerName,
      phone_number: customerPhone,
      email: customerEmail,
    },
    supabase
  );
  return created;
}

/**
 * Format address exactly like ServiceLocationTab (customers view).
 * Uses Street, BuildingFloorRoom, Country, ZipCode - same fields as customer detail page.
 */
function formatAddressLikeServiceLocationTab(addr) {
  const country = addr?.Country === "SG" ? "Singapore" : (addr?.Country || addr?.CountryName || "");
  const parts = [addr?.Street, addr?.BuildingFloorRoom || addr?.Building, addr?.Block, addr?.City, country, addr?.ZipCode].filter(Boolean);
  return parts.join(", ") || addr?.AddressName || null;
}

/**
 * Check if address is blank (same logic as ServiceLocationTab).
 */
function isAddressBlank(addr) {
  const hasValue = (v) => v && String(v).trim() && String(v).trim() !== "-" && String(v).toLowerCase() !== "n/a";
  return !hasValue(addr?.Street) && !hasValue(addr?.BuildingFloorRoom) && !hasValue(addr?.Building) && !hasValue(addr?.AddressName) && !hasValue(addr?.City) && !hasValue(addr?.ZipCode);
}

/**
 * Fetch BP addresses via getCustomerCode API (same as customers view page).
 */
async function fetchBpAddressesByCardCode(cardCode, req) {
  if (!cardCode) return { addresses: [], customerData: null };
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || "localhost:3000";
  const baseUrl = `${protocol}://${host}`;
  const cookieHeader = req.headers.cookie || "";
  try {
    const res = await fetch(`${baseUrl}/api/getCustomerCode?cardCode=${encodeURIComponent(cardCode)}`, {
      headers: { Cookie: cookieHeader },
    });
    if (!res.ok) return { addresses: [], customerData: null };
    const customerData = await res.json();
    const addresses = customerData?.BPAddresses || [];
    return { addresses: addresses.filter((a) => !isAddressBlank(a)), customerData };
  } catch (err) {
    console.warn(`[Migration] getCustomerCode failed for ${cardCode}:`, err?.message);
    return { addresses: [], customerData: null };
  }
}

/**
 * Fetch address-details for customer (status, notes per address - used to prefer user-saved addresses).
 */
async function fetchAddressDetailsByCardCode(cardCode, req) {
  if (!cardCode) return {};
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || "localhost:3000";
  const baseUrl = `${protocol}://${host}`;
  const cookieHeader = req.headers.cookie || "";
  try {
    const res = await fetch(`${baseUrl}/api/customers/address-details/${encodeURIComponent(cardCode)}`, {
      headers: { Cookie: cookieHeader },
    });
    if (!res.ok) return {};
    const result = await res.json();
    return result?.success && result?.data ? result.data : {};
  } catch (err) {
    console.warn(`[Migration] address-details failed for ${cardCode}:`, err?.message);
    return {};
  }
}

/**
 * Ensure customer_location row exists for the SAP address and links to locations.id (jobs reference).
 */
async function ensureCustomerLocationForMigration({ customerId, firstAddr, locationsRowId }, supabase) {
  if (!customerId || !locationsRowId || !firstAddr?.AddressName) return null;
  const siteId = firstAddr.AddressName;
  const { data: found } = await supabase
    .from("customer_location")
    .select("id")
    .eq("customer_id", customerId)
    .eq("site_id", siteId)
    .limit(1)
    .maybeSingle();

  const countryName =
    firstAddr.CountryName || (firstAddr.Country === "SG" ? "Singapore" : firstAddr.Country) || null;
  const commonFields = {
    building: firstAddr.Building || firstAddr.BuildingFloorRoom || null,
    street: firstAddr.Street || null,
    block: firstAddr.Block || null,
    city: firstAddr.City || null,
    country_name: countryName,
    zip_code: firstAddr.ZipCode || null,
    address_type: firstAddr.AddressType || null,
    address:
      [firstAddr.Street, firstAddr.Building, firstAddr.BuildingFloorRoom].filter(Boolean).join(", ") || null,
    location_id: locationsRowId,
  };

  if (found?.id) {
    const { error: updErr } = await supabase
      .from("customer_location")
      .update(commonFields)
      .eq("id", found.id);
    if (updErr) {
      console.warn(`[Migration] customer_location update:`, updErr.message);
    }
    return found.id;
  }

  const { data: ins, error: insErr } = await supabase
    .from("customer_location")
    .insert({
      customer_id: customerId,
      site_id: siteId,
      ...commonFields,
    })
    .select("id")
    .single();
  if (insErr) {
    console.warn(`[Migration] customer_location insert:`, insErr.message);
    return null;
  }
  return ins?.id ?? null;
}

/**
 * Save the address used during migration to customer_address_details (status/notes per address).
 * Optional customerLocationId populates the FK (preferred over string address_name only).
 */
async function saveAddressDetailsForMigration(cardCode, addr, supabase, { customerLocationId } = {}) {
  const addressName = addr?.AddressName;
  if (!cardCode || !addressName) return;
  try {
    const { data: existing } = await supabase
      .from("customer_address_details")
      .select("id")
      .eq("customer_code", cardCode)
      .eq("address_name", addressName)
      .is("deleted_at", null)
      .maybeSingle();

    const payload = {
      customer_code: cardCode,
      address_name: addressName,
      address_type: addr?.AddressType || null,
      status: "Active",
      updated_at: new Date().toISOString(),
    };
    if (customerLocationId) {
      payload.customer_location_id = customerLocationId;
    }

    if (existing) {
      await supabase.from("customer_address_details").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("customer_address_details").insert(payload);
    }
  } catch (err) {
    console.warn(`[Migration] Failed to save address-details for ${cardCode}/${addressName}:`, err?.message);
  }
}

async function resolveOrCreateLocationFromRow(row, customer, supabase, sessionCookies, options, req) {
  const customerId = customer.id;
  const cardCode = (customer.customer_code || "").toString().trim();

  // 1. Fetch addresses via getCustomerCode (BPAddresses - same as customers view)
  let addresses = [];
  let customerData = null;
  if (cardCode && req) {
    const { addresses: addrs, customerData: cust } = await fetchBpAddressesByCardCode(cardCode, req);
    addresses = addrs;
    customerData = cust;
  }

  // 2. Fetch address-details (user-saved status/notes per address - prefer addresses user has marked)
  let addressDetailsMap = {};
  if (cardCode && req) {
    addressDetailsMap = await fetchAddressDetailsByCardCode(cardCode, req);
  }

  // 3. Pick best address: Default (ShipToDefault/BilltoDefault) > address-details (user-saved) > ShipTo > BillTo
  const shipToDefault = customerData?.ShipToDefault || customerData?.ShiptoDefault;
  const billToDefault = customerData?.BilltoDefault || customerData?.BillToDefault;

  let firstAddr = addresses.find((a) => a.AddressName === shipToDefault || a.AddressName === billToDefault)
    || addresses.find((a) => addressDetailsMap[a.AddressName]?.status === "Active")
    || addresses.find((a) => addressDetailsMap[a.AddressName]) // any address user has saved
    || null;

  if (!firstAddr && addresses.length > 0) {
    const sorted = [...addresses].sort((a, b) => {
      const aShip = (a.AddressType || "").includes("ShipTo") ? 0 : 1;
      const bShip = (b.AddressType || "").includes("ShipTo") ? 0 : 1;
      return aShip - bShip;
    });
    firstAddr = sorted[0];
  }
  const locationName = firstAddr ? formatAddressLikeServiceLocationTab(firstAddr) : null;
  const addressForSchedule = locationName;

  // When no address from SAP, use minimal placeholder (no hardcoded "Address from SAP" etc.)
  const displayName = locationName || "—";

  const { data: existing } = await supabase
    .from("locations")
    .select("id, location_name")
    .eq("customer_id", customerId)
    .eq("location_name", displayName)
    .is("deleted_at", null)
    .maybeSingle();

  let locationRow;
  if (existing) {
    locationRow = { ...existing, address: addressForSchedule ?? existing.location_name };
  } else if (!options.createMissingLocations) {
    throw new Error(`Location not found for customer ${customerId} (${displayName})`);
  } else {
    const { data: created, error } = await supabase
      .from("locations")
      .insert({
        customer_id: customerId,
        location_name: displayName,
      })
      .select("id, location_name")
      .single();

    if (error) throw new Error(`Failed to create location: ${error.message}`);
    locationRow = { ...created, address: addressForSchedule ?? displayName };
  }

  let customerLocationId = null;
  if (firstAddr?.AddressName) {
    customerLocationId = await ensureCustomerLocationForMigration(
      { customerId, firstAddr, locationsRowId: locationRow.id },
      supabase
    );
  }
  if (firstAddr && cardCode) {
    await saveAddressDetailsForMigration(cardCode, firstAddr, supabase, { customerLocationId });
  }

  return locationRow;
}

const MIGRATION_TECH_DEFAULT_PASSWORD = "sasme123";

async function resolveOrCreateTechnician(fullName, supabaseAdmin, options) {
  const needle = fullName.toString().trim();
  if (!needle) return null;

  const { data: existing } = await supabaseAdmin
    .from("technicians")
    .select("id, full_name")
    .ilike("full_name", `%${needle}%`)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  if (!options.createMissingTechnicians) return null;

  // Create technician: Auth user + users table + technicians table
  const slug = needle.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 30) || "tech";
  const email = `${slug}.${Date.now().toString(36)}@sasme.com`;

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: MIGRATION_TECH_DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "TECHNICIAN", full_name: needle },
  });

  if (authError) {
    console.warn(`[Migration] Failed to create auth user for ${needle}:`, authError.message);
    return null;
  }

  let user;
  try {
    user = await userService.create(
      {
        id: authUser.user.id,
        username: email,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
      supabaseAdmin
    );
  } catch (userErr) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    } catch (_) {}
    console.warn(`[Migration] Failed to create user for ${needle}:`, userErr?.message);
    return null;
  }

  const { data: technician, error: techError } = await supabaseAdmin
    .from("technicians")
    .insert({
      user_id: user.id,
      email,
      full_name: needle,
      status: "ACTIVE",
    })
    .select("id")
    .single();

  if (techError) {
    try {
      await userService.delete(user.id, supabaseAdmin);
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    } catch (_) {}
    console.warn(`[Migration] Failed to create technician for ${needle}:`, techError?.message);
    return null;
  }

  return technician?.id ?? null;
}

async function resolveTechnicianIdsFromRow(row, supabaseAdmin, options) {
  const teches = parseAifmAssignedTeches(row["Assigned Teches"]);
  if (teches.length === 0) return [];

  const { data: rows, error } = await supabaseAdmin
    .from("technicians")
    .select("id, full_name")
    .is("deleted_at", null);

  if (error) {
    console.warn("[Migration] technicians list failed:", error.message);
    return [];
  }

  const technicians = rows || [];
  const ids = [];

  for (const t of teches) {
    const primary = (t.name || "").toString().trim();
    const raw = (t.raw || "").toString().trim();
    let m = primary ? matchTechnicianToAifmName(primary, technicians) : null;
    if (!m && raw && raw !== primary) {
      m = matchTechnicianToAifmName(raw, technicians);
    }
    if (m?.id) {
      ids.push(m.id);
      continue;
    }
    if (!primary) continue;
    const techId = await resolveOrCreateTechnician(primary, supabaseAdmin, options);
    if (techId) ids.push(techId);
  }
  return Array.from(new Set(ids));
}

async function insertJobScheduleFromRow(jobId, row, supabase, address = null) {
  const startIso = parseExcelDateTimeToIso(row["Job Start DateTime"]);
  const endIso = parseExcelDateTimeToIso(row["Job End DateTime"]);

  const jsdate = startIso ? startIso.split("T")[0] : null;
  const jedate = endIso ? endIso.split("T")[0] : jsdate;

  const timeFromIso = (iso) => {
    if (!iso) return null;
    const t = iso.split("T")[1];
    if (!t) return null;
    // hh:mm:ss from ISO
    return t.split(".")[0] || null;
  };

  const durationHrs = parseInt(row["Estimated Duration Hrs"] || 0, 10) || 0;
  const durationMins = parseInt(row["Estimated Duration Minutes"] || 0, 10) || 0;
  const totalMinutes = durationHrs * 60 + durationMins;
  const durationHoursDecimal = (totalMinutes / 60).toFixed(2);

  const payload = {
    job_id: jobId,
    jsdate,
    jedate,
    jstime: timeFromIso(startIso),
    jetime: timeFromIso(endIso),
    dur_type: "hours",
    dur: durationHoursDecimal,
    address: address || null,
  };

  const { error } = await supabase.from("job_schedule").insert(payload);
  if (error) throw new Error(`Failed to create job_schedule: ${error.message}`);
}

async function insertJobCategoryFromRow(jobId, row, supabase) {
  const cat = (row["Job Category"] || "").toString().trim();
  if (!cat) return;
  // Best-effort; do not fail entire row.
  await supabase.from("job_category").insert({
    job_id: jobId,
    description: cat,
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();

  try {
    const {
      uploadId,
      limit = null,
      dateStart = null,
      dateEnd = null,
      dryRun = false,
      createMissingCustomers = true,
      createMissingLocations = true,
      createMissingTechnicians = true,
    } = req.body || {};

    if (!uploadId) {
      return res.status(400).json({ error: "Missing uploadId" });
    }

    const { data: upload, error: fetchErr } = await supabase
      .from("job_migration_upload")
      .select("id, filename, status, rows, column_mapping")
      .eq("id", uploadId)
      .single();

    if (fetchErr) {
      return res.status(404).json({ error: fetchErr.message });
    }

    let rows = Array.isArray(upload.rows) ? upload.rows : [];

    // Filter by date range (Job Start DateTime) if provided
    if (dateStart || dateEnd) {
      const startDate = dateStart ? new Date(dateStart) : null;
      const endDate = dateEnd ? new Date(dateEnd) : null;
      if (endDate) endDate.setHours(23, 59, 59, 999); // Include full end date
      if (startDate || endDate) {
        rows = rows.filter((row) => {
          const jobStartStr = (row["Job Start DateTime"] || "").toString().trim();
          if (!jobStartStr) return false;
          const jobStart = new Date(jobStartStr);
          if (isNaN(jobStart.getTime())) return false;
          if (startDate && jobStart < startDate) return false;
          if (endDate && jobStart > endDate) return false;
          return true;
        });
      }
    }

    let rowsToApply = limit ? rows.slice(0, Number(limit)) : rows;

    // Sequential job numbers must follow Job Start DateTime, not spreadsheet row order.
    rowsToApply = [...rowsToApply].sort((a, b) => {
      const parseStart = (row) => {
        const s = (row["Job Start DateTime"] || "").toString().trim();
        if (!s) return Number.MAX_SAFE_INTEGER;
        const t = new Date(s).getTime();
        return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
      };
      const diff = parseStart(a) - parseStart(b);
      if (diff !== 0) return diff;
      const idA = (a["ID"] || a["Personal Job ID"] || "").toString();
      const idB = (b["ID"] || b["Personal Job ID"] || "").toString();
      return idA.localeCompare(idB);
    });

    const results = [];
    let createdCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const sessionCookies = sapService.getSessionCookies(req) || {};

    // For dry run: preview with sequential numbers; for apply: fetch next available before each insert
    let dryRunNextJobNo = dryRun ? await getNextJobNumber(supabase) : null;

    for (let i = 0; i < rowsToApply.length; i++) {
      const row = rowsToApply[i] || {};

      const rowId = (row["ID"] || row["Personal Job ID"] || `row-${i + 1}`).toString();
      const jobNumber = dryRun
        ? dryRunNextJobNo
        : await getNextJobNumber(supabase);

      try {
        const customer = await resolveOrCreateCustomerFromRow(row, supabase, {
          createMissingCustomers,
        });
        const location = await resolveOrCreateLocationFromRow(row, customer, supabase, sessionCookies, {
          createMissingLocations,
        }, req);

        const scheduledStart = parseExcelDateTimeToIso(row["Job Start DateTime"]);
        const scheduledEnd = parseExcelDateTimeToIso(row["Job End DateTime"]);

        const description = (row["Job Description"] || "").toString();
        const title =
          (row["Personal Job ID"] && `Migrated Job ${row["Personal Job ID"]}`) ||
          (row["Job PO Number"] && `Migrated Job PO ${row["Job PO Number"]}`) ||
          `Migrated Job ${rowId}`;

        const jobData = {
          customer_id: customer.id,
          location_id: location.id,
          service_call_id: null,
          job_number: jobNumber,
          title,
          description,
          priority: mapPriority(row["Job Priority"]),
          status: mapStatus(row["Status"]),
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          created_by: null,
        };

        if (dryRun) {
          results.push({
            rowIndex: i,
            rowId,
            status: "DRY_RUN",
            jobData,
            sapId: customer.customer_code,
            address: location?.address ?? "—",
          });
          skippedCount++;
          // Increment for next dry-run row preview (YYYY-XXXXXX -> YYYY-XXXXX(X+1))
          const parts = dryRunNextJobNo.split("-");
          if (parts.length >= 2) {
            const num = parseInt(parts[1], 10) || 0;
            dryRunNextJobNo = `${parts[0]}-${String(num + 1).padStart(6, "0")}`;
          }
          continue;
        }

        const job = await jobService.create(jobData, supabase);

        // Related inserts (best-effort: schedule is important, others optional)
        await insertJobScheduleFromRow(job.id, row, supabase, location.address);
        await insertJobCategoryFromRow(job.id, row, supabase);

        const technicianIds = await resolveTechnicianIdsFromRow(row, supabase, {
          createMissingTechnicians,
        });
        if (technicianIds.length) {
          await supabase.from("technician_jobs").insert(
            technicianIds.map((technician_id) => ({
              technician_id,
              job_id: job.id,
              assignment_status: "ASSIGNED",
            }))
          );
        }

        try {
          const rh = await refreshTechnicianHoursForJobId(supabase, job.id);
          if (rh?.error) console.warn("refreshTechnicianHoursForJobId:", rh.error.message);
        } catch (e) {
          console.warn("refreshTechnicianHoursForJobId:", e?.message || e);
        }

        createdCount++;
        results.push({
          rowIndex: i,
          rowId,
          status: "CREATED",
          job: { id: job.id, job_number: job.job_number },
          assignedTechnicians: technicianIds.length,
        });
      } catch (err) {
        failedCount++;
        results.push({
          rowIndex: i,
          rowId,
          status: "FAILED",
          error: err?.message || String(err),
        });
      }
    }

    // Update upload status (non-blocking for the main apply result)
    const newStatus = failedCount > 0 && createdCount > 0 ? "PARTIAL" : failedCount > 0 ? "FAILED" : "APPLIED";
    await supabase
      .from("job_migration_upload")
      .update({
        status: newStatus,
        applied_at: dryRun ? null : new Date().toISOString(),
        error_message: failedCount ? `Failed rows: ${failedCount}` : null,
      })
      .eq("id", uploadId);

    if (!dryRun) {
      await writeAuditLogFromRequest(req, {
        action: AUDIT_ACTIONS.MIGRATION_JOBS,
        category: AUDIT_CATEGORIES.MIGRATION,
        entityType: 'job_migration_upload',
        entityId: uploadId,
        entityLabel: upload.filename,
        description: `Jobs migration applied: ${createdCount} created, ${skippedCount} skipped, ${failedCount} failed`,
        details: {
          uploadId,
          filename: upload.filename,
          status: newStatus,
          counts: { created: createdCount, skipped: skippedCount, failed: failedCount, total: rowsToApply.length },
        },
        status: failedCount > 0 ? (createdCount > 0 ? AUDIT_STATUS.WARNING : AUDIT_STATUS.FAILURE) : AUDIT_STATUS.SUCCESS,
        source: AUDIT_SOURCE.MIGRATION,
      });
    }

    return res.status(200).json({
      success: true,
      upload: { id: upload.id, filename: upload.filename, status: newStatus },
      counts: { created: createdCount, skipped: skippedCount, failed: failedCount, total: rowsToApply.length },
      results: results.slice(0, 200), // cap response
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Apply failed" });
  }
}

