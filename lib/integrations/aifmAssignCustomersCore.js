/**
 * Shared logic for linking AIFM-imported jobs (customer_id null + [CUSTOMER:…] tag) to local customers.
 * When no SAP customer/local match: resolves SAP Leads (sap_lead masterlist / CardType L) before
 * creating a portal CP##### placeholder (Tier 3 — only when neither customer nor lead matches).
 * Address sync from [ADDRESS:…] lives in aifmAddressSyncPass.js (small module for API bundlers).
 * When tags/schedule/locations have no address, optional AIFM Open API (AIFM_API_TOKEN) can supply
 * service_location via [AIFM:<id>] (see aifmJobLocationFromApi.js).
 * Jobs with customer but no location: aifmLinkedLocationEnrichment.js.
 * Used by POST /api/integrations/aifm/assign-customers (interactive SSE) and cron.
 */

import sapService from '../services/sapService';
import {
  lookupCardCodeByCustomerName,
  lookupCardCodeByLeadName,
} from '../utils/sapCustomerCardCodeLookup';
import { getServiceAddressFromAifmJobDescription } from './aifmJobLocationFromApi';
import { resolveOrCreatePlaceholderCustomer } from '../utils/aifmPortalPlaceholderCustomer';

/** Strip punctuation that often differs between AIFM and SAP (commas, extra spaces). */
export function normalizeNameForMatch(s) {
  return String(s || '')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escape % and _ for use inside PostgREST ilike patterns. */
function escapeIlikeLiteral(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Two-tier name lookup: exact ilike → partial ilike (single variant). */
async function findCustomerByNameVariant(name, supabase) {
  if (!name) return null;

  const { data: exact } = await supabase
    .from('customer')
    .select('id, customer_code, customer_name')
    .ilike('customer_name', name)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (exact) return exact;

  const { data: partial } = await supabase
    .from('customer')
    .select('id, customer_code, customer_name')
    .ilike('customer_name', `%${name}%`)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  return partial ?? null;
}

/**
 * All word orderings for short names (≤4 words). AIFM vs SAP often permutes tokens:
 * e.g. tag "KWONG LEONG THAM" vs CardName "THAM KWONG LEONG" — simple reverse is "THAM LEONG KWONG", wrong.
 */
function wordOrderPermutations(parts) {
  const words = parts.filter(Boolean);
  if (words.length <= 1) return [words.join(' ')];
  if (words.length > 4) return [];
  const results = [];
  function permute(arr, prefix = []) {
    if (arr.length === 0) {
      results.push(prefix.join(' '));
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      permute(rest, [...prefix, arr[i]]);
    }
  }
  permute(words);
  return results;
}

/**
 * AIFM tag order (e.g. "MELIANA YEO") often differs from SAP CardName ("YEO MELIANA").
 * For 2–4 words, includes **all permutations** so "THAM KWONG LEONG" is tried for "KWONG LEONG THAM".
 */
export function customerNameSearchVariants(name) {
  const n = normalizeNameForMatch(name);
  if (!n) return [];
  const parts = n.split(' ').filter(Boolean);
  const out = new Set();
  out.add(n);
  if (parts.length >= 2) {
    out.add(parts.slice().reverse().join(' '));
    const sorted = parts
      .slice()
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .join(' ');
    out.add(sorted);
  }
  if (parts.length >= 2 && parts.length <= 4) {
    for (const p of wordOrderPermutations(parts)) {
      out.add(p);
    }
  }
  return [...out];
}

export async function findCustomerByName(name, supabase) {
  for (const variant of customerNameSearchVariants(name)) {
    const hit = await findCustomerByNameVariant(variant, supabase);
    if (hit) return hit;
  }
  return null;
}

/**
 * When exact/partial ilike misses (extra suffix on CardName, odd spacing), find rows where
 * every significant word from the tag appears as a substring of customer_name.
 * Narrows candidates using the longest token, then scores shortest name to reduce false positives.
 */
export async function findCustomerByTokenOverlap(name, supabase) {
  const raw = normalizeNameForMatch(name);
  const parts = raw.split(/\s+/).filter((w) => w.length >= 2);
  if (parts.length < 2) return null;

  const lowerParts = parts.map((p) => p.toLowerCase());

  /** Rows whose name contains every token (order-free). Prefer OR on each token so we don't miss BP rows when one token is common. */
  const orFilter = parts
    .map((w) => `customer_name.ilike.%${escapeIlikeLiteral(w)}%`)
    .join(',');
  const { data: rows } = await supabase
    .from('customer')
    .select('id, customer_code, customer_name')
    .or(orFilter)
    .is('deleted_at', null)
    .limit(200);

  if (!rows?.length) return null;

  const matches = [];
  for (const row of rows) {
    const cn = normalizeNameForMatch(row.customer_name).toLowerCase();
    if (lowerParts.every((p) => cn.includes(p))) matches.push(row);
  }
  if (!matches.length) return null;

  matches.sort((a, b) => {
    const la = normalizeNameForMatch(a.customer_name).length;
    const lb = normalizeNameForMatch(b.customer_name).length;
    return la - lb;
  });
  return matches[0];
}

export async function findCustomerByCode(cardCode, supabase) {
  if (!cardCode) return null;
  const { data } = await supabase
    .from('customer')
    .select('id, customer_code, customer_name')
    .eq('customer_code', cardCode)
    .is('deleted_at', null)
    .maybeSingle();
  return data ?? null;
}

async function findSapLeadByNameVariant(name, supabase) {
  if (!name) return null;

  const { data: exact } = await supabase
    .from('sap_lead')
    .select('id, lead_code, lead_name, phone_number, email')
    .ilike('lead_name', name)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (exact) return exact;

  const { data: partial } = await supabase
    .from('sap_lead')
    .select('id, lead_code, lead_name, phone_number, email')
    .ilike('lead_name', `%${name}%`)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  return partial ?? null;
}

export async function findSapLeadByName(name, supabase) {
  for (const variant of customerNameSearchVariants(name)) {
    const hit = await findSapLeadByNameVariant(variant, supabase);
    if (hit) return hit;
  }
  return null;
}

export async function findSapLeadByTokenOverlap(name, supabase) {
  const raw = normalizeNameForMatch(name);
  const parts = raw.split(/\s+/).filter((w) => w.length >= 2);
  if (parts.length < 2) return null;

  const lowerParts = parts.map((p) => p.toLowerCase());
  const orFilter = parts
    .map((w) => `lead_name.ilike.%${escapeIlikeLiteral(w)}%`)
    .join(',');
  const { data: rows } = await supabase
    .from('sap_lead')
    .select('id, lead_code, lead_name, phone_number, email')
    .or(orFilter)
    .is('deleted_at', null)
    .limit(200);

  if (!rows?.length) return null;

  const matches = [];
  for (const row of rows) {
    const ln = normalizeNameForMatch(row.lead_name).toLowerCase();
    if (lowerParts.every((p) => ln.includes(p))) matches.push(row);
  }
  if (!matches.length) return null;

  matches.sort((a, b) => {
    const la = normalizeNameForMatch(a.lead_name).length;
    const lb = normalizeNameForMatch(b.lead_name).length;
    return la - lb;
  });
  return matches[0];
}

/**
 * Match AIFM display name to sap_lead masterlist, then ensure a portal `customer` row with L* CardCode.
 */
export async function resolveCustomerFromSapLeadMasterlist(displayName, supabase) {
  const tag = String(displayName || '').trim();
  if (!tag) return null;

  let lead = await findSapLeadByName(tag, supabase);
  if (!lead) {
    lead = await findSapLeadByTokenOverlap(tag, supabase);
  }
  if (!lead?.lead_code) return null;

  const leadName = String(lead.lead_name || tag).replace(/\s+/g, ' ').trim();
  const customer = await ensureLocalCustomerFromSapHit(
    { cardCode: lead.lead_code, cardName: leadName },
    tag,
    supabase
  );
  if (customer) {
    console.log(
      `[aifmAssignCustomersCore] SAP Lead→local: "${leadName}" (${lead.lead_code})`
    );
  }
  return customer;
}

/**
 * SAP OData returned a CardCode but the portal has no `customer` row yet.
 * Insert a minimal row (same as AIFM import-jobs Tier1b) — one row per CardCode, not a duplicate BP.
 */
export async function ensureLocalCustomerFromSapHit(sapHit, fallbackDisplayName, supabase) {
  const cardCode = (sapHit?.cardCode || '').toString().trim();
  if (!cardCode) return null;

  const sapName = String(sapHit.cardName || fallbackDisplayName || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!sapName) return null;

  const existing = await findCustomerByCode(cardCode, supabase);
  if (existing) {
    if (normalizeNameForMatch(existing.customer_name) !== normalizeNameForMatch(sapName)) {
      const { data: updated, error: updErr } = await supabase
        .from('customer')
        .update({ customer_name: sapName, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('id, customer_code, customer_name')
        .single();
      if (!updErr && updated) {
        console.log(
          `[aifmAssignCustomersCore] SAP CardName→local: "${existing.customer_name}" → "${sapName}" (${cardCode})`
        );
        return updated;
      }
    }
    return existing;
  }

  const { data: created, error: createErr } = await supabase
    .from('customer')
    .insert({ customer_code: cardCode, customer_name: sapName })
    .select('id, customer_code, customer_name')
    .single();

  if (!createErr && created) {
    console.log(`[aifmAssignCustomersCore] Tier SAP→local: created "${sapName}" (${cardCode})`);
    return created;
  }

  console.warn(`[aifmAssignCustomersCore] customer insert ${cardCode}: ${createErr?.message} — retrying select`);
  const { data: retried } = await supabase
    .from('customer')
    .select('id, customer_code, customer_name')
    .eq('customer_code', cardCode)
    .is('deleted_at', null)
    .maybeSingle();
  return retried ?? null;
}

/**
 * Find or create a locations row for a customer (same rules as assign-customers API).
 */
export async function resolveLocation(customerId, locationName, supabase) {
  if (!customerId || !locationName) return null;

  const { data: owned } = await supabase
    .from('locations')
    .select('id, location_name')
    .eq('customer_id', customerId)
    .eq('location_name', locationName)
    .is('deleted_at', null)
    .maybeSingle();
  if (owned) return owned;

  const { data: placeholder } = await supabase
    .from('locations')
    .select('id, location_name')
    .is('customer_id', null)
    .eq('location_name', locationName)
    .is('deleted_at', null)
    .maybeSingle();

  if (placeholder) {
    const { data: claimed } = await supabase
      .from('locations')
      .update({ customer_id: customerId })
      .eq('id', placeholder.id)
      .select('id, location_name')
      .single();
    return claimed || placeholder;
  }

  const { data: created, error } = await supabase
    .from('locations')
    .insert({ customer_id: customerId, location_name: locationName })
    .select('id, location_name')
    .single();

  if (error) {
    console.warn(`[aifmAssignCustomersCore] location insert failed: ${error.message}`);
    return null;
  }
  return created;
}

export { extractTag } from './aifmDescriptionTags.js';

/**
 * When SAP session is available, set portal customer_name to SAP CardName for the same CardCode.
 * AIFM / local DB often use a different word order than SAP (e.g. "KWONG LEONG THAM" vs "THAM KWONG LEONG").
 */
async function alignCustomerNameFromSapCard(customer, sapCookies, supabase) {
  const cardCode = (customer.customer_code || '').toString().trim();
  if (!cardCode || !sapCookies) return customer;

  try {
    const bp = await sapService.getBusinessPartner(cardCode, sapCookies);
    const sapName = String(bp?.CardName || '').replace(/\s+/g, ' ').trim();
    if (!sapName) return customer;
    if (normalizeNameForMatch(customer.customer_name) === normalizeNameForMatch(sapName)) {
      return customer;
    }
    const { data: updated, error } = await supabase
      .from('customer')
      .update({ customer_name: sapName, updated_at: new Date().toISOString() })
      .eq('id', customer.id)
      .select('id, customer_code, customer_name')
      .single();
    if (!error && updated) {
      console.log(
        `[aifmAssignCustomersCore] SAP CardName→local (by CardCode): "${customer.customer_name}" → "${sapName}" (${cardCode})`
      );
      return updated;
    }
  } catch (e) {
    console.warn(`[aifmAssignCustomersCore] getBusinessPartner(${cardCode}): ${e?.message || e}`);
  }
  return customer;
}

/**
 * Customer matched by name only (no CardCode). Resolve SAP by AIFM tag / stored name variants and save CardCode + CardName.
 */
async function enrichCustomerFromSapByNameLookup(customer, aifmTagName, sapCookies, supabase) {
  if (!sapCookies || !customer?.id) return customer;
  if ((customer.customer_code || '').trim()) return customer;

  const seeds = new Set([
    ...customerNameSearchVariants(aifmTagName),
    ...customerNameSearchVariants(customer.customer_name || ''),
  ]);

  for (const variant of seeds) {
    if (!variant) continue;
    let sapHit = await lookupCardCodeByCustomerName(variant, sapCookies);
    if (!sapHit?.cardCode) {
      sapHit = await lookupCardCodeByLeadName(variant, sapCookies);
    }
    if (!sapHit?.cardCode) continue;
    const sapName = String(sapHit.cardName || '').replace(/\s+/g, ' ').trim();
    if (!sapName) continue;

    const { data: updated, error } = await supabase
      .from('customer')
      .update({
        customer_code: String(sapHit.cardCode).trim(),
        customer_name: sapName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customer.id)
      .select('id, customer_code, customer_name')
      .single();
    if (!error && updated) {
      console.log(
        `[aifmAssignCustomersCore] SAP→local (name-only row): ${updated.customer_code} "${sapName}"`
      );
      return updated;
    }
    if (error) {
      console.warn(`[aifmAssignCustomersCore] enrich customer ${customer.id}: ${error?.message}`);
    }
  }
  return customer;
}

/**
 * Resolve customer for one job: local DB (with name variants), then SAP CardCode → local DB if sapCookies set.
 * If SAP returns a CardCode but no local row exists, creates one minimal customer (aligned with import-jobs Tier1b).
 * If still no match: creates or reuses a portal CP##### placeholder with `customer_name` from the tag (no SAP required).
 * With SAP session: aligns portal customer_name to SAP CardName when CardCode is known (fixes AIFM name order).
 */
export async function resolveCustomerForAifmTag(customerName, supabase, sapCookies) {
  const tag = String(customerName || '').trim();
  if (!tag) return null;

  let customer = await findCustomerByName(tag, supabase);
  if (!customer) {
    customer = await findCustomerByTokenOverlap(tag, supabase);
  }

  if (!customer && sapCookies) {
    for (const variant of customerNameSearchVariants(tag)) {
      let sapHit = await lookupCardCodeByCustomerName(variant, sapCookies);
      if (!sapHit?.cardCode) {
        sapHit = await lookupCardCodeByLeadName(variant, sapCookies);
      }
      if (sapHit?.cardCode) {
        customer = await ensureLocalCustomerFromSapHit(sapHit, tag, supabase);
        if (customer) break;
      }
    }
  }

  if (!customer) {
    customer = await resolveCustomerFromSapLeadMasterlist(tag, supabase);
  }

  if (!customer) {
    customer = await resolveOrCreatePlaceholderCustomer(tag, supabase);
    if (customer) {
      console.log(
        `[aifmAssignCustomersCore] CP placeholder for tag "${tag}": ${customer.customer_code} "${customer.customer_name}"`
      );
    }
  }

  if (customer && sapCookies) {
    if ((customer.customer_code || '').trim()) {
      customer = await alignCustomerNameFromSapCard(customer, sapCookies, supabase);
    } else {
      customer = await enrichCustomerFromSapByNameLookup(customer, tag, sapCookies, supabase);
    }
  }

  return customer;
}

/**
 * Fetch unassigned AIFM jobs (same filter as assign-customers API).
 *
 * PostgREST/Supabase typically caps a single response at **1000 rows**. Using `.limit(5000)`
 * alone still returns at most 1000 — jobs beyond that (often older imports) were never assigned.
 * We page with `.range()` until we have `maxTotal` rows or no more data.
 *
 * @param {number} [maxTotal] — max jobs to load (default 100000). Cron passes a smaller batch size.
 */
export async function fetchUnassignedAifmJobs(supabase, maxTotal = 100000) {
  const PAGE = 1000;
  const cap = Math.max(1, Math.min(Number(maxTotal) || 100000, 200000));
  const all = [];
  let from = 0;

  for (;;) {
    if (all.length >= cap) break;
    const need = Math.min(PAGE, cap - all.length);
    const to = from + need - 1;

    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_number, description, location_id, scheduled_start')
      .is('customer_id', null)
      .ilike('description', '%[AIFM:%')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (error) throw new Error(`Fetch failed: ${error.message}`);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < need) break;
    from += need;
  }

  return all;
}

/**
 * If job_schedule.address is empty but jobs.location_id points at a locations row, copy location_name
 * into job_schedule.address so scheduler buildLocation(schedule, job) shows the service address.
 */
async function backfillJobScheduleAddressFromJob(supabase, jobId) {
  const { data: sched } = await supabase
    .from('job_schedule')
    .select('id, address')
    .eq('job_id', jobId)
    .limit(1)
    .maybeSingle();
  if (!sched?.id) return;
  if ((sched.address || '').trim()) return;

  const { data: jobRow } = await supabase
    .from('jobs')
    .select('location_id')
    .eq('id', jobId)
    .maybeSingle();
  if (!jobRow?.location_id) return;

  const { data: loc } = await supabase
    .from('locations')
    .select('location_name')
    .eq('id', jobRow.location_id)
    .maybeSingle();
  const name = (loc?.location_name || '').trim();
  if (!name) return;

  await supabase.from('job_schedule').update({ address: name }).eq('id', sched.id);
}

/**
 * Run one assignment pass. Idempotent: only updates jobs with NULL customer_id.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ sapCookies: object | null, log?: function, maxJobs?: number, jobs?: object[] | null, onJob?: (index: number, total: number, job: object) => void, onMatch?: (p: { job: object, customer: object, location: object|null }) => void, onError?: (p: { job: object, error: string }) => void }} options
 * @returns {Promise<{ matched: number, updated: number, failed: number, skipped: number, total: number }>}
 */
export async function runAifmCustomerAssignmentPass(supabase, options = {}) {
  const sapCookies = options.sapCookies ?? null;
  const log = typeof options.log === 'function' ? options.log : () => {};
  const onMatch = typeof options.onMatch === 'function' ? options.onMatch : null;
  const onJob = typeof options.onJob === 'function' ? options.onJob : null;
  const onError = typeof options.onError === 'function' ? options.onError : null;
  /** Max jobs to process when not passing a pre-fetched `jobs` array (cron uses a small batch). */
  const maxJobs = Math.min(Math.max(Number(options.maxJobs) || 100000, 1), 200000);

  const unassigned =
    Array.isArray(options.jobs) && options.jobs.length >= 0
      ? options.jobs
      : await fetchUnassignedAifmJobs(supabase, maxJobs);
  const total = unassigned.length;

  let matched = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < unassigned.length; i++) {
    const job = unassigned[i];
    onJob?.(i, total, job);
    const rawCustomer = extractTag(job.description, 'CUSTOMER');
    const customerName = rawCustomer ? rawCustomer.replace(/\s+/g, ' ').trim() : '';

    if (!customerName) {
      skipped++;
      log(`↷ ${job.job_number} — no [CUSTOMER:] tag, skipping`);
      continue;
    }

    try {
      const customer = await resolveCustomerForAifmTag(customerName, supabase, sapCookies);

      if (!customer) {
        skipped++;
        log(`↺ ${job.job_number} — no match for "${customerName}"`);
        continue;
      }

      matched++;

      const { data: jobRow } = await supabase
        .from('jobs')
        .select('location_id')
        .eq('id', job.id)
        .maybeSingle();

      const { data: schedule } = await supabase
        .from('job_schedule')
        .select('id, address')
        .eq('job_id', job.id)
        .limit(1)
        .maybeSingle();

      const tagAddress = extractTag(job.description, 'ADDRESS');
      let addressStr = tagAddress ? tagAddress.replace(/\s+/g, ' ').trim() : '';
      addressStr = addressStr || (schedule?.address || '').trim() || null;
      if (!addressStr && jobRow?.location_id) {
        const { data: locExisting } = await supabase
          .from('locations')
          .select('location_name')
          .eq('id', jobRow.location_id)
          .maybeSingle();
        addressStr = (locExisting?.location_name || '').trim() || null;
      }

      if (!addressStr) {
        const fromApi = await getServiceAddressFromAifmJobDescription(job.description, job.scheduled_start);
        if (fromApi) {
          addressStr = fromApi;
          log(`↳ ${job.job_number} — service_location from AIFM API`);
        }
      }

      const location = addressStr
        ? await resolveLocation(customer.id, addressStr, supabase)
        : null;

      const update = {
        customer_id: customer.id,
        updated_at: new Date().toISOString(),
      };
      if (location) {
        update.location_id = location.id;
      } else if (jobRow?.location_id) {
        update.location_id = jobRow.location_id;
      }

      const { error: updateErr } = await supabase.from('jobs').update(update).eq('id', job.id);

      if (updateErr) throw new Error(updateErr.message);

      await backfillJobScheduleAddressFromJob(supabase, job.id);

      updated++;
      log(`✓ ${job.job_number} → "${customer.customer_name}" (${customer.customer_code})${location ? ' + location' : ''}`);
      onMatch?.({ job, customer, location });
    } catch (err) {
      failed++;
      log(`✗ ${job.job_number} error: ${err.message}`);
      onError?.({ job, error: err.message });
    }
  }

  return { matched, updated, failed, skipped, total };
}
