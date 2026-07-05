import { getSupabaseAdmin } from "../../../../lib/supabase/server";
import { userService } from "../../../../lib/supabase/database";
import {
  writeAuditLogFromRequest,
  AUDIT_CATEGORIES,
  AUDIT_ACTIONS,
  AUDIT_STATUS,
  AUDIT_SOURCE,
} from "../../../../lib/services/auditLog";

/**
 * Map Optional column from FSM User ID & Password.xlsx to role.
 * "FW & Admin" or "Admin" -> ADMIN
 * "FW" or "Field Worker" -> TECHNICIAN
 */
function mapRole(value) {
  const v = (value || "").toString().trim().toLowerCase();
  if (!v) return "TECHNICIAN";
  if (v.includes("admin") || v === "fw & admin") return "ADMIN";
  if (v === "fw" || v.includes("field") || v.includes("worker")) return "TECHNICIAN";
  return "TECHNICIAN";
}

/**
 * Create a single user from migration row.
 * ADMIN: auth.users + users table only
 * TECHNICIAN: auth.users + users table + technicians table
 */
async function createUserFromRow(row, supabaseAdmin, options) {
  const email = (row["Login"] || "").toString().trim();
  const password = (row["Password"] || "").toString().trim();
  const fullName = (row["User Name"] || "").toString().trim();
  const optional = (row["Optional"] || "").toString().trim();
  const primaryPhone = (row["Primary Phone Number"] || "").toString().trim() || null;
  const secondaryPhone = (row["Secondary Phone Number"] || "").toString().trim() || null;

  if (!email) {
    throw new Error("Missing required column: Login (email)");
  }
  if (!password) {
    throw new Error("Missing required column: Password");
  }

  const role = mapRole(optional);
  const status = "ACTIVE";

  // Check if user already exists in Supabase Auth
  const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingAuthUser = existingAuthUsers?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (existingAuthUser) {
    if (options.skipExisting) {
      return { status: "SKIPPED", reason: "User already exists in Auth", email };
    }
    throw new Error(`User already exists in Auth: ${email}`);
  }

  // Check custom users table
  const { data: existingUser } = await supabaseAdmin
    .from("users")
    .select("id, username")
    .eq("username", email)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingUser) {
    if (options.skipExisting) {
      return { status: "SKIPPED", reason: "User already exists in users table", email };
    }
    throw new Error(`User already exists: ${email}`);
  }

  // Create user in Supabase Auth
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, full_name: fullName || email },
  });

  if (authError) {
    throw new Error(`Auth failed: ${authError.message}`);
  }

  let user;
  try {
    user = await userService.create(
      {
        id: authUser.user.id,
        username: email,
        role,
        status,
      },
      supabaseAdmin
    );
  } catch (userErr) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    } catch (_) {}
    throw new Error(`User table failed: ${userErr?.message}`);
  }

  if (role === "TECHNICIAN") {
    const { error: techError } = await supabaseAdmin
      .from("technicians")
      .insert({
        user_id: user.id,
        email,
        full_name: fullName || email,
        phone_number: primaryPhone,
        primary_phone: primaryPhone,
        secondary_phone: secondaryPhone,
        status,
      })
      .select("id")
      .single();

    if (techError) {
      try {
        await userService.delete(user.id, supabaseAdmin);
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      } catch (_) {}
      throw new Error(`Technician table failed: ${techError?.message}`);
    }
  }

  return {
    status: "CREATED",
    email,
    role,
    userId: user.id,
  };
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
      dryRun = false,
      skipExisting = true,
    } = req.body || {};

    if (!uploadId) {
      return res.status(400).json({ error: "Missing uploadId" });
    }

    const { data: upload, error: fetchErr } = await supabase
      .from("user_migration_upload")
      .select("id, filename, status, rows")
      .eq("id", uploadId)
      .single();

    if (fetchErr) {
      return res.status(404).json({ error: fetchErr.message });
    }

    let rows = Array.isArray(upload.rows) ? upload.rows : [];
    const rowsToApply = limit ? rows.slice(0, Number(limit)) : rows;

    const results = [];
    let createdCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < rowsToApply.length; i++) {
      const row = rowsToApply[i] || {};
      const email = (row["Login"] || "").toString().trim();
      const rowId = (row["SN"] || `row-${i + 1}`).toString();

      if (!email) {
        failedCount++;
        results.push({
          rowIndex: i,
          rowId,
          status: "FAILED",
          error: "Missing Login (email)",
        });
        continue;
      }

      if (dryRun) {
        const role = mapRole(row["Optional"]);
        results.push({
          rowIndex: i,
          rowId,
          status: "DRY_RUN",
          email,
          role,
          fullName: (row["User Name"] || "").toString().trim(),
        });
        skippedCount++;
        continue;
      }

      try {
        const result = await createUserFromRow(row, supabase, { skipExisting });
        if (result.status === "SKIPPED") {
          skippedCount++;
          results.push({
            rowIndex: i,
            rowId,
            status: "SKIPPED",
            email: result.email,
            reason: result.reason,
          });
        } else {
          createdCount++;
          results.push({
            rowIndex: i,
            rowId,
            status: "CREATED",
            email: result.email,
            role: result.role,
            userId: result.userId,
          });
        }
      } catch (err) {
        failedCount++;
        results.push({
          rowIndex: i,
          rowId,
          status: "FAILED",
          email,
          error: err?.message || String(err),
        });
      }
    }

    const newStatus = failedCount > 0 && createdCount > 0 ? "PARTIAL" : failedCount > 0 ? "FAILED" : "APPLIED";
    await supabase
      .from("user_migration_upload")
      .update({
        status: newStatus,
        applied_at: dryRun ? null : new Date().toISOString(),
        error_message: failedCount ? `Failed rows: ${failedCount}` : null,
      })
      .eq("id", uploadId);

    if (!dryRun) {
      await writeAuditLogFromRequest(req, {
        action: AUDIT_ACTIONS.MIGRATION_USERS,
        category: AUDIT_CATEGORIES.MIGRATION,
        entityType: 'user_migration_upload',
        entityId: uploadId,
        entityLabel: upload.filename,
        description: `Users migration applied: ${createdCount} created, ${skippedCount} skipped, ${failedCount} failed`,
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
      results: results.slice(0, 200),
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Apply failed" });
  }
}
