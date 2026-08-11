/**
 * Server-side helpers for Google Form → leads sync (slim selects, watermarks, CP reservation).
 */

/** Flat columns only — used to match Google responses without nested customer joins. */
export const SYNC_EXISTING_LEAD_SELECT = [
  'id',
  'email',
  'submitted_at',
  'google_form_response_id',
  'customer_id',
  'first_name',
  'last_name',
  'full_name',
  'salutation',
  'handphone',
  'block',
  'unit',
  'building',
  'street',
  'postcode',
  'country',
  'address',
  'first_service_date',
  'second_service_date',
  'third_service_date',
  'fourth_service_date',
  'time_slot',
  'agreed_to_terms',
  'personal_info_consent',
].join(', ');

const LEAD_PAGE_SIZE = 1000;

/**
 * Load active leads for sync matching (paginated slim select — no nested joins).
 */
export async function loadExistingLeadsForSync(supabase) {
  const rows = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('leads')
      .select(SYNC_EXISTING_LEAD_SELECT)
      .is('deleted_at', null)
      .order('submitted_at', { ascending: false })
      .range(offset, offset + LEAD_PAGE_SIZE - 1);

    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < LEAD_PAGE_SIZE) break;
    offset += LEAD_PAGE_SIZE;
  }

  return rows;
}

export function buildExistingLeadMaps(existingLeads) {
  const existingByResponseId = new Map();
  const existingByFallbackKey = new Map();

  for (const lead of existingLeads || []) {
    if (lead.google_form_response_id) {
      existingByResponseId.set(lead.google_form_response_id, lead);
    }
    if (lead.submitted_at) {
      const key = `${lead.email}_${lead.submitted_at}`;
      if (!existingByFallbackKey.has(key)) {
        existingByFallbackKey.set(key, lead);
      }
    }
  }

  return { existingByResponseId, existingByFallbackKey };
}

/**
 * Load only leads that could match the fetched Google responses (by response id or email).
 * Falls back to full slim load when the batch is large or ids are missing.
 */
export async function loadExistingLeadsForResponseBatch(supabase, googleResponses) {
  const responses = googleResponses || [];
  if (responses.length === 0) return [];

  const responseIds = [
    ...new Set(
      responses
        .map((r) => r.id || r.responseId || r.google_form_response_id)
        .filter(Boolean)
        .map(String)
    ),
  ];
  const emailByNorm = new Map();
  for (const r of responses) {
    const raw = String(r.email || '').trim();
    if (raw) emailByNorm.set(raw.toLowerCase(), raw);
  }
  const emails = [...emailByNorm.values()];

  // Large batches: one paginated slim scan is simpler than huge IN lists
  if (responseIds.length > 200 || (responseIds.length === 0 && emails.length === 0)) {
    return loadExistingLeadsForSync(supabase);
  }

  const byId = new Map();
  const CHUNK = 100;

  for (let i = 0; i < responseIds.length; i += CHUNK) {
    const chunk = responseIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('leads')
      .select(SYNC_EXISTING_LEAD_SELECT)
      .is('deleted_at', null)
      .in('google_form_response_id', chunk);
    if (error) throw error;
    for (const row of data || []) byId.set(row.id, row);
  }

  for (let i = 0; i < emails.length; i += CHUNK) {
    const chunk = emails.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('leads')
      .select(SYNC_EXISTING_LEAD_SELECT)
      .is('deleted_at', null)
      .in('email', chunk);
    if (error) throw error;
    for (const row of data || []) byId.set(row.id, row);
  }

  return [...byId.values()];
}

/**
 * Latest Google Form lead submission time (for incremental Forms API filter).
 * Returns null when no watermark exists (full fetch).
 */
export async function getGoogleFormSyncWatermark(supabase) {
  const { data, error } = await supabase
    .from('leads')
    .select('submitted_at')
    .eq('source', 'GOOGLE_FORM')
    .not('google_form_response_id', 'is', null)
    .is('deleted_at', null)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.submitted_at || null;
}

/** Count active portal leads that already came from Google Forms. */
export async function countSyncedGoogleFormLeads(supabase) {
  const { count, error } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'GOOGLE_FORM')
    .not('google_form_response_id', 'is', null)
    .is('deleted_at', null);

  if (error) throw error;
  return count || 0;
}

/**
 * Subtract lookback ms from an ISO timestamp (overlap so edge submissions are not missed).
 */
export function subtractLookbackIso(isoTimestamp, lookbackMs = 6 * 60 * 60 * 1000) {
  if (!isoTimestamp) return null;
  const ms = Date.parse(isoTimestamp);
  if (Number.isNaN(ms)) return null;
  return new Date(Math.max(0, ms - lookbackMs)).toISOString();
}

/**
 * Batch-load customer_code for many customer ids (chunks of 100).
 * @returns {Map<string, string>}
 */
export async function loadCustomerCodesByIds(supabase, customerIds) {
  const map = new Map();
  const ids = [...new Set((customerIds || []).filter(Boolean))];
  const CHUNK = 100;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('customer')
      .select('id, customer_code')
      .in('id', chunk)
      .is('deleted_at', null);

    if (error) throw error;
    for (const row of data || []) {
      map.set(row.id, row.customer_code || null);
    }
  }

  return map;
}

/**
 * Reserve the next N portal CP codes without per-row max queries.
 * Codes are unique among the reserved set; create still retries on rare races.
 */
export async function reservePortalCustomerCodes(supabase, count) {
  if (!count || count <= 0) return [];

  const cpMatch = /^CP(\d+)$/i;
  const { data: maxRow, error } = await supabase
    .from('customer')
    .select('customer_code')
    .gte('customer_code', 'CP00000')
    .lte('customer_code', 'CP99999')
    .order('customer_code', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  let nextNum = 1;
  if (maxRow?.customer_code) {
    const m = String(maxRow.customer_code).match(cpMatch);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }

  const codes = [];
  for (let i = 0; i < count; i += 1) {
    codes.push('CP' + String(nextNum + i).padStart(5, '0'));
  }
  return codes;
}
