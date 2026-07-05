/**
 * Pure helpers for AIFM job customer display / lookup keys (safe for client or server).
 */

/** Tokens treated as “no name” for AIFM first/last parts and combined keys. */
const TOKEN_SKIP = new Set([
  '',
  '—',
  '..',
  '.',
  '-',
  '--',
  'n/a',
  'na',
  'null',
  'undefined',
  'none',
]);

/**
 * AIFM sends `customer_firstName` + `customer_lastName`.
 * - Single-token family name in lastName + given name(s) in firstName → **TAN SOCK TING** (`${last} ${first}`).
 * - Single-token each (Western) → **YEO MELIANA** (`${last} ${first}`).
 * - Company / multi-word business in lastName (e.g. PTE LTD) → **GATHERFOOD PTE LTD** (`${first} ${last}`).
 */
export function formatAifmPersonNameLastFirst(firstName, lastName, skipToken = TOKEN_SKIP) {
  const clean = (p) => {
    const t = (p ?? '').toString().trim();
    if (!t || skipToken.has(t.toLowerCase())) return '';
    return t;
  };
  const f = clean(firstName);
  const l = clean(lastName);
  if (l && f) {
    // Family name only in lastName; given name(s) in firstName (common SG residential AIFM rows).
    if (!l.includes(' ') && f.includes(' ')) {
      return `${l} ${f}`.replace(/\s+/g, ' ').trim();
    }
    const companyStyle = f.includes(' ') || l.includes(' ');
    const ordered = companyStyle ? `${f} ${l}` : `${l} ${f}`;
    return ordered.replace(/\s+/g, ' ').trim();
  }
  if (l) return l;
  if (f) return f;
  return '';
}

/** True when AIFM `customer_name` is only a surname token but first/last form the full contact name. */
export function preferComposedNameOverShortCustomerName(customerName, composed) {
  const cn = String(customerName || '').trim();
  const comp = String(composed || '').trim();
  if (!comp) return false;
  if (!cn) return true;
  const cnParts = cn.split(/\s+/).filter(Boolean);
  const compParts = comp.split(/\s+/).filter(Boolean);
  if (compParts.length >= 2 && cnParts.length === 1) {
    return comp.toLowerCase().includes(cn.toLowerCase());
  }
  return false;
}

function composedContactNameFromRow(row, skipToken = TOKEN_SKIP) {
  return formatAifmPersonNameLastFirst(row?.customer_firstName, row?.customer_lastName, skipToken);
}

function firstMeaningfulName(candidates, skipToken = TOKEN_SKIP) {
  for (const candidate of candidates) {
    const t = String(candidate ?? '').trim();
    if (t && !skipToken.has(t.toLowerCase())) return t;
  }
  return '';
}

/** Normalized key: used for SAP CardName lookup dedupe and map join. */
export function customerLookupKeyFromAifmJob(row) {
  const composed = composedContactNameFromRow(row, TOKEN_SKIP);
  const shortCustomerName = firstMeaningfulName(
    [row?.customer_name, row?.customerName, row?.CustomerName],
    TOKEN_SKIP
  );

  const preferredName = firstMeaningfulName(
    [
      row?.aifm_customer_account_name,
      preferComposedNameOverShortCustomerName(shortCustomerName, composed) ? composed : null,
      shortCustomerName,
      row?.company_name,
      row?.companyName,
      row?.customer_company,
    ],
    TOKEN_SKIP
  );
  if (preferredName) return preferredName;

  if (!composed) return '';
  if (TOKEN_SKIP.has(composed.toLowerCase())) return '';
  return composed;
}

export function displayNameFromAifmJob(row) {
  const k = customerLookupKeyFromAifmJob(row);
  return k || '';
}

/** Alias for import path (same token set). */
const IMPORT_SKIP_PARTS = TOKEN_SKIP;

/**
 * Best display name for persisting an AIFM job to `customer.customer_name` when SAP CardCode
 * is missing. Prefer the explicit company/customer name, then SAP CardName, then fall back to
 * AIFM contact first/last, service location nick name, and finally synthetic AIFM labels.
 */
export function aifmCustomerNameForImport(job) {
  if (!job || typeof job !== 'object') return null;

  const composed = composedContactNameFromRow(job, IMPORT_SKIP_PARTS);
  const shortCustomerName = firstMeaningfulName(
    [job.customer_name, job.customerName, job.CustomerName],
    IMPORT_SKIP_PARTS
  );

  const preferredName = firstMeaningfulName(
    [
      job.sap_bp_card_name,
      job.aifm_customer_account_name,
      preferComposedNameOverShortCustomerName(shortCustomerName, composed) ? composed : null,
      shortCustomerName,
      job.company_name,
      job.companyName,
      job.customer_company,
    ],
    IMPORT_SKIP_PARTS
  );
  if (preferredName) return preferredName;

  const rawKey = customerLookupKeyFromAifmJob(job);
  if (rawKey) return rawKey;

  const loc = job.service_location;
  if (loc && typeof loc === 'object') {
    const nick = loc.nick_name || loc.customer_name;
    if (nick) {
      const t = String(nick).trim();
      if (t && !IMPORT_SKIP_PARTS.has(t.toLowerCase())) return t;
    }
  }

  const idCust =
    job.id_customer ??
    job.customer_id ??
    job.idCustomer ??
    job.customerId;
  if (idCust != null) {
    const s = String(idCust).trim();
    if (s && !IMPORT_SKIP_PARTS.has(s.toLowerCase())) {
      return `AIFM customer ${s}`;
    }
  }

  const jobId = job.id ?? job.job_id ?? job.aifm_job_id;
  if (jobId != null) {
    const s = String(jobId).trim();
    if (s && !IMPORT_SKIP_PARTS.has(s.toLowerCase())) {
      return `AIFM job ${s}`;
    }
  }
  return null;
}
