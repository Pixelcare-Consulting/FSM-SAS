import { customerLookupKeyFromAifmJob } from '../utils/aifmJobCustomerName.js';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeNameForMatch(value) {
  return clean(value)
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function wordOrderPermutations(parts) {
  const words = parts.filter(Boolean);
  if (words.length <= 1) return [words.join(' ')];
  if (words.length > 4) return [];
  const results = [];
  function permute(rest, prefix = []) {
    if (rest.length === 0) {
      results.push(prefix.join(' '));
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...prefix, rest[i]]);
    }
  }
  permute(words);
  return results;
}

export function customerNameSearchVariants(name) {
  const normalized = clean(name);
  if (!normalized) return [];

  const parts = normalized.split(' ').filter(Boolean);
  const out = new Set([normalized]);
  if (parts.length >= 2) {
    out.add(parts.slice().reverse().join(' '));
    out.add(parts.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join(' '));
  }
  if (parts.length >= 2 && parts.length <= 4) {
    for (const permutation of wordOrderPermutations(parts)) out.add(permutation);
  }
  return [...out];
}

function masterlistRows(rows, { codeKey = 'customer_code', nameKey = 'customer_name' } = {}) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      row,
      code: clean(row?.[codeKey]),
      name: clean(row?.[nameKey]),
    }))
    .filter((item) => item.code && item.name);
}

function sapLeadRowsToMasterlistCandidates(leadRows) {
  return masterlistRows(leadRows, { codeKey: 'lead_code', nameKey: 'lead_name' });
}

/**
 * Reject partial matches like "TAN SOCK TING" → masterlist row named only "TAN" (L003894).
 */
function isValidPartialMasterlistMatch(variant, candidateName) {
  const v = normalizeNameForMatch(variant);
  const c = normalizeNameForMatch(candidateName);
  if (!v || !c) return false;
  if (v === c) return true;
  const vParts = v.split(/\s+/).filter(Boolean);
  const cParts = c.split(/\s+/).filter(Boolean);
  if (vParts.length >= 2 && cParts.length === 1) {
    if (v.includes(c) && c.length < 10) return false;
  }
  if (cParts.length >= 2 && vParts.length === 1) {
    if (c.includes(v) && v.length < 10) return false;
  }
  return c.includes(v) || v.includes(c);
}

function findMasterlistCustomer(job, candidates) {
  const lookupName = customerLookupKeyFromAifmJob(job);
  const variants = customerNameSearchVariants(lookupName);
  if (!variants.length) return null;

  const normalizedVariants = variants.map(normalizeNameForMatch).filter(Boolean);

  for (const variant of normalizedVariants) {
    const exact = candidates.find((item) => normalizeNameForMatch(item.name) === variant);
    if (exact) return { ...exact, match: 'supabase_masterlist_exact' };
  }

  for (const variant of normalizedVariants) {
    if (variant.length < 3) continue;
    const partials = candidates
      .filter((item) => isValidPartialMasterlistMatch(variant, item.name))
      .sort((a, b) => a.name.length - b.name.length);
    if (partials[0]) return { ...partials[0], match: 'supabase_masterlist_partial' };
  }

  const tokens = normalizeNameForMatch(lookupName).split(/\s+/).filter((token) => token.length >= 2);
  if (tokens.length >= 2) {
    const overlaps = candidates
      .filter((item) => {
        const customerName = normalizeNameForMatch(item.name);
        return tokens.every((token) => customerName.includes(token));
      })
      .sort((a, b) => a.name.length - b.name.length);
    if (overlaps[0]) return { ...overlaps[0], match: 'supabase_masterlist_token_overlap' };
  }

  return null;
}

function applyMasterlistHit(job, hit) {
  const row = hit.row;
  const isLead = Boolean(row.lead_code);
  return {
    ...job,
    customer_name: hit.name || job.customer_name || null,
    customer_phone: clean(row.phone_number) || job.customer_phone || null,
    customer_email: clean(row.email) || job.customer_email || null,
    sap_card_code: hit.code,
    sap_bp_card_name: hit.name,
    sap_card_match: isLead ? hit.match.replace('masterlist', 'masterlist_lead') : hit.match,
    supabase_masterlist_customer_id: isLead ? null : row.id ?? null,
    supabase_masterlist_customer: isLead ? null : row,
    supabase_masterlist_lead_id: isLead ? row.id ?? null : null,
    supabase_masterlist_lead: isLead ? row : null,
  };
}

/**
 * Match jobs to Supabase masterlist: SAP customers first, then SAP leads (L* codes).
 *
 * @param {Array} jobs
 * @param {Array} customerRows — public.customer (source sap)
 * @param {Array} [leadRows] — public.sap_lead (optional)
 */
export function enrichAifmJobsWithSupabaseMasterlist(jobs, customerRows, leadRows = []) {
  const customerCandidates = masterlistRows(customerRows);
  const leadCandidates = sapLeadRowsToMasterlistCandidates(leadRows);
  let matched = 0;
  let matchedLeads = 0;

  const enrichedJobs = (Array.isArray(jobs) ? jobs : []).map((job) => {
    let hit = findMasterlistCustomer(job, customerCandidates);
    if (!hit && leadCandidates.length) {
      hit = findMasterlistCustomer(job, leadCandidates);
      if (hit) matchedLeads++;
    }
    if (!hit) return job;

    matched++;
    return applyMasterlistHit(job, hit);
  });

  return {
    jobs: enrichedJobs,
    matched,
    matchedLeads,
    totalCustomers: customerCandidates.length,
    totalLeads: leadCandidates.length,
  };
}
