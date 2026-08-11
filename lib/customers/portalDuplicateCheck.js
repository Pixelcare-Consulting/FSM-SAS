/**
 * Portal duplicate detection by normalized email / phone (last 8 digits).
 */

export function normalizeContactEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Escape LIKE/ILIKE wildcards for exact case-insensitive email match. */
function escapeIlikeExact(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

export function normalizeContactPhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function phonesMatchLast8(a, b) {
  const da = normalizeContactPhoneDigits(a);
  const db = normalizeContactPhoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 8 && db.length >= 8) {
    return da.slice(-8) === db.slice(-8);
  }
  return false;
}

function rowMatchesContact(row, emailNorm, phoneDigits) {
  const rowEmail = normalizeContactEmail(row?.email);
  if (emailNorm && rowEmail && rowEmail === emailNorm) return true;
  const rowPhone = normalizeContactPhoneDigits(row?.phone_number || row?.handphone);
  if (phoneDigits && rowPhone && phonesMatchLast8(phoneDigits, rowPhone)) return true;
  return false;
}

const CONTACT_PAGE_SIZE = 1000;

/**
 * Load slim customer + lead contact rows once for batch duplicate checks (sync preview).
 */
export async function loadPortalContactIndex(supabase) {
  const customers = [];
  const leads = [];

  for (let offset = 0; ; offset += CONTACT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('customer')
      .select('id, customer_code, email, phone_number')
      .is('deleted_at', null)
      .range(offset, offset + CONTACT_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    customers.push(...batch);
    if (batch.length < CONTACT_PAGE_SIZE) break;
  }

  for (let offset = 0; ; offset += CONTACT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, email, handphone, customer_id, customer:customer_id(customer_code)')
      .is('deleted_at', null)
      .range(offset, offset + CONTACT_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    leads.push(...batch);
    if (batch.length < CONTACT_PAGE_SIZE) break;
  }

  return { customers, leads };
}

/**
 * In-memory duplicate lookup against a preloaded contact index (no DB round-trip).
 */
export function findDuplicateInContactIndex(index, { email, phone, excludeCustomerId } = {}) {
  const emailNorm = normalizeContactEmail(email);
  const phoneDigits = normalizeContactPhoneDigits(phone);
  if (!emailNorm && !phoneDigits) return null;

  for (const row of index?.customers || []) {
    if (excludeCustomerId && row.id === excludeCustomerId) continue;
    if (rowMatchesContact(row, emailNorm, phoneDigits)) {
      return {
        existingCode: row.customer_code,
        existingType: 'customer',
        suggestion: 'view',
        existingId: row.id,
      };
    }
  }

  for (const lead of index?.leads || []) {
    if (rowMatchesContact(lead, emailNorm, phoneDigits)) {
      const code = lead.customer?.customer_code || null;
      if (code) {
        return {
          existingCode: code,
          existingType: 'lead',
          suggestion: 'view',
          existingId: lead.id,
        };
      }
    }
  }

  return null;
}

/**
 * @returns {Promise<{ existingCode: string, existingType: 'customer'|'lead', suggestion: 'view'|'link', existingId?: string } | null>}
 */
export async function findPortalDuplicate(supabase, { email, phone, excludeCustomerId } = {}) {
  const emailNorm = normalizeContactEmail(email);
  const phoneDigits = normalizeContactPhoneDigits(phone);
  if (!emailNorm && !phoneDigits) return null;

  // Prefer indexed email lookups over full-table scans (egress + latency).
  if (emailNorm) {
    const emailPattern = escapeIlikeExact(emailNorm);
    let customerQuery = supabase
      .from('customer')
      .select('id, customer_code, email, phone_number')
      .is('deleted_at', null)
      .ilike('email', emailPattern)
      .limit(20);
    if (excludeCustomerId) {
      customerQuery = customerQuery.neq('id', excludeCustomerId);
    }
    const { data: customersByEmail, error: cEmailErr } = await customerQuery;
    if (cEmailErr) throw cEmailErr;

    for (const row of customersByEmail || []) {
      if (rowMatchesContact(row, emailNorm, phoneDigits)) {
        return {
          existingCode: row.customer_code,
          existingType: 'customer',
          suggestion: 'view',
          existingId: row.id,
        };
      }
    }

    const { data: leadsByEmail, error: lEmailErr } = await supabase
      .from('leads')
      .select('id, email, handphone, customer_id, customer:customer_id(customer_code)')
      .is('deleted_at', null)
      .ilike('email', emailPattern)
      .limit(20);
    if (lEmailErr) throw lEmailErr;

    for (const lead of leadsByEmail || []) {
      if (rowMatchesContact(lead, emailNorm, phoneDigits)) {
        const code = lead.customer?.customer_code || null;
        if (code) {
          return {
            existingCode: code,
            existingType: 'lead',
            suggestion: 'view',
            existingId: lead.id,
          };
        }
      }
    }

    // Email present but no match — still check phone against a contact index once
    // when phone digits exist (last-8 match cannot be expressed as a simple filter).
    if (!phoneDigits) return null;
  }

  // Phone-only (or email miss + phone): one slim index load, then in-memory match.
  const index = await loadPortalContactIndex(supabase);
  return findDuplicateInContactIndex(index, { email, phone, excludeCustomerId });
}

/**
 * Sibling CP rows (same email/phone, different customer_code).
 * @returns {Promise<Array<{ customer_code: string, customer_name: string, email: string|null, phone_number: string|null, lead_id: string|null }>>}
 */
export async function findSiblingPortalCustomers(
  supabase,
  { email, phone, excludeCustomerId, excludeCustomerCode } = {}
) {
  const emailNorm = normalizeContactEmail(email);
  const phoneDigits = normalizeContactPhoneDigits(phone);
  if (!emailNorm && !phoneDigits) return [];

  let query = supabase
    .from('customer')
    .select('id, customer_code, customer_name, email, phone_number, lead_id')
    .is('deleted_at', null);
  if (excludeCustomerId) {
    query = query.neq('id', excludeCustomerId);
  }
  // Narrow by email when possible to avoid full customer table egress.
  if (emailNorm) {
    query = query.ilike('email', escapeIlikeExact(emailNorm));
  }
  const { data: rows, error } = await query;
  if (error) throw error;

  const excludeCode = String(excludeCustomerCode || '').trim().toUpperCase();
  let matched = (rows || []).filter((row) => {
    if (excludeCode && String(row.customer_code || '').toUpperCase() === excludeCode) {
      return false;
    }
    return rowMatchesContact(row, emailNorm, phoneDigits);
  });

  // Phone-only sibling search still needs a broader scan.
  if (!emailNorm && phoneDigits && matched.length === 0) {
    let phoneQuery = supabase
      .from('customer')
      .select('id, customer_code, customer_name, email, phone_number, lead_id')
      .is('deleted_at', null);
    if (excludeCustomerId) {
      phoneQuery = phoneQuery.neq('id', excludeCustomerId);
    }
    const { data: allRows, error: phoneErr } = await phoneQuery;
    if (phoneErr) throw phoneErr;
    matched = (allRows || []).filter((row) => {
      if (excludeCode && String(row.customer_code || '').toUpperCase() === excludeCode) {
        return false;
      }
      return rowMatchesContact(row, emailNorm, phoneDigits);
    });
  }

  return matched;
}
