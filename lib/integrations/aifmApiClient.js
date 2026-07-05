/**
 * Server-side AIFM Open API (authorize + job list scan).
 * Used to resolve service_location for portal jobs that have [AIFM:<id>] in description.
 *
 * Env: AIFM_API_TOKEN, optional AIFM_BASE_URL
 */

const DEFAULT_BASE = 'https://apacapiopen.aifieldmanagement.com';
const AUTH_TIMEOUT_MS = 15_000;
const JOBS_TIMEOUT_MS = 35_000;
/** Same endpoint as pages/api/integrations/aifm/jobs.js (resolve_service_locations). */
const SERVICE_LOCATIONS_TIMEOUT_MS = 25_000;
/**
 * POST /api/v1/customers returns the full customer directory for this tenant (large payload).
 * One call per jobs fetch / import batch; lookup `id` in memory — avoids N× repeated downloads.
 */
const CUSTOMERS_DIRECTORY_TIMEOUT_MS = 90_000;
const PAGE_SIZE = 50;
const MAX_PAGES_PER_SCAN = 40;

function normalizeBase(url) {
  const u = (url || DEFAULT_BASE).trim().replace(/\/+$/, '');
  return u || DEFAULT_BASE;
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function dateFmt(d) {
  return d.toISOString().slice(0, 10);
}

/** ~2 years back, ~1 year forward — covers most scheduled AIFM jobs. */
export function aifmWideDateRange() {
  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);
  const start = new Date();
  start.setFullYear(start.getFullYear() - 2);
  return { start_date: dateFmt(start), end_date: dateFmt(end) };
}

/** ±14 days around a portal scheduled time (ISO) as a second scan window. */
export function aifmTightRangeAroundScheduled(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const start = new Date(d);
  start.setDate(start.getDate() - 21);
  const end = new Date(d);
  end.setDate(end.getDate() + 21);
  return { start_date: dateFmt(start), end_date: dateFmt(end) };
}

export async function authorizeAifmBearer(baseUrl, apiToken) {
  const base = normalizeBase(baseUrl);
  const secret = String(apiToken || '').trim().replace(/^["']|["']$/g, '');
  if (!secret) return null;

  let authJson;
  for (const bodyObj of [{ secret }, { api_token: secret }]) {
    let authRes;
    try {
      authRes = await fetchWithTimeout(
        `${base}/api/v1/authorize`,
        {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObj),
        },
        AUTH_TIMEOUT_MS
      );
    } catch {
      continue;
    }
    authJson = await authRes.json().catch(() => ({}));
    if (Number(authJson.code) === 200 && authJson.data?.token) {
      return { bearer: authJson.data.token, base };
    }
  }
  return null;
}

async function fetchJobsPageJson(base, bearer, start_date, end_date, page) {
  const bodyVariants = [
    { api_token: bearer, start_date, end_date, page, per_page: PAGE_SIZE },
    { api_token: bearer, start_date, end_date, page, limit: PAGE_SIZE },
    { api_token: bearer, start_date, end_date },
  ];

  for (const jobBody of bodyVariants) {
    let jobsRes;
    try {
      jobsRes = await fetchWithTimeout(
        `${base}/api/v1/jobs`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bearer}`,
          },
          body: JSON.stringify(jobBody),
        },
        JOBS_TIMEOUT_MS
      );
    } catch {
      continue;
    }
    const json = await jobsRes.json().catch(() => ({}));
    if (Number(json.code) === 200) return json;
  }
  return null;
}

/**
 * Raw POST /api/v1/jobs response for one page (debug / test scripts).
 * Same request shape as the internal job scan.
 *
 * @returns {Promise<object|null>} Full JSON envelope (code, data, …) or null on failure
 */
export async function fetchAifmJobsListPageRaw(base, bearer, start_date, end_date, page) {
  return fetchJobsPageJson(base, bearer, start_date, end_date, page);
}

/**
 * Download full `data` array from POST /api/v1/customers (AIFM Open API).
 * Response is typically all customers; filter by `id` locally.
 *
 * @returns {Promise<object[]|null>}
 */
export async function fetchAifmCustomersDirectory(base, bearer) {
  if (!bearer) return null;
  const bodyVariants = [{ api_token: bearer }];

  for (const bodyObj of bodyVariants) {
    let res;
    try {
      res = await fetchWithTimeout(
        `${base}/api/v1/customers`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bearer}`,
          },
          body: JSON.stringify(bodyObj),
        },
        CUSTOMERS_DIRECTORY_TIMEOUT_MS
      );
    } catch {
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (Number(json.code) === 200 && Array.isArray(json.data)) {
      return json.data;
    }
  }
  return null;
}

/**
 * Build id → customer row map from AIFM /customers `data` array.
 *
 * @param {object[]|null|undefined} rows
 * @returns {Map<string, object>}
 */
export function buildAifmCustomerDirectoryMap(rows) {
  const map = new Map();
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (row?.id == null) continue;
    const key = String(row.id);
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

/**
 * POST /api/v1/customers/service_locations — all service locations for one customer.
 * Matches the request used when import preview resolves locations (see aifm/jobs.js).
 *
 * @param {string|number} idCustomer — AIFM job field `id_customer`
 * @returns {Promise<object[]|null>} `data` array or null on failure
 */
export async function fetchAifmCustomerServiceLocationsList(base, bearer, idCustomer) {
  if (idCustomer == null) return null;
  const body = JSON.stringify({ api_token: bearer, customer_id: idCustomer });
  let res;
  try {
    res = await fetchWithTimeout(
      `${base}/api/v1/customers/service_locations`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
        body,
      },
      SERVICE_LOCATIONS_TIMEOUT_MS
    );
  } catch {
    return null;
  }
  const json = await res.json().catch(() => ({}));
  if (Number(json.code) !== 200 || !Array.isArray(json.data)) return null;
  return json.data;
}

/**
 * One service location row by `customer_service_location_id` (AIFM job list often omits inline `service_location`).
 *
 * @param {string|number} idCustomer — `id_customer` from job payload
 * @param {string|number} customerServiceLocationId — `customer_service_location_id` from job payload
 * @returns {Promise<object|null>}
 */
export async function fetchAifmServiceLocationRow(base, bearer, idCustomer, customerServiceLocationId) {
  if (idCustomer == null || customerServiceLocationId == null) return null;
  const rows = await fetchAifmCustomerServiceLocationsList(base, bearer, idCustomer);
  if (!rows?.length) return null;
  const target = String(customerServiceLocationId);
  return rows.find((loc) => String(loc?.id) === target) ?? null;
}

const EQUIPMENTS_TIMEOUT_MS = 25_000;
let aifmAccountIndexCache = { expiresAt: 0, map: null };

/**
 * account_number (SAP CardCode) → AIFM id_customer
 * @param {object[]|null|undefined} rows
 * @returns {Map<string, string|number>}
 */
export function buildAifmCustomerAccountIndex(rows) {
  const map = new Map();
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    const acct = String(row?.account_number || '').trim().toUpperCase();
    if (acct && row?.id != null && !map.has(acct)) {
      map.set(acct, row.id);
    }
  }
  return map;
}

async function getAifmAccountIndex(base, bearer) {
  if (aifmAccountIndexCache.map && Date.now() < aifmAccountIndexCache.expiresAt) {
    return aifmAccountIndexCache.map;
  }
  const rows = await fetchAifmCustomersDirectory(base, bearer);
  if (!rows) return null;
  aifmAccountIndexCache = {
    expiresAt: Date.now() + 5 * 60 * 1000,
    map: buildAifmCustomerAccountIndex(rows),
  };
  return aifmAccountIndexCache.map;
}

/**
 * Resolve AIFM `id_customer` from SAP CardCode / account_number.
 * @returns {Promise<string|number|null>}
 */
export async function resolveAifmCustomerIdByAccountNumber(base, bearer, accountNumber) {
  const acct = String(accountNumber || '').trim().toUpperCase();
  if (!acct) return null;
  const index = await getAifmAccountIndex(base, bearer);
  if (!index) return null;
  return index.get(acct) ?? null;
}

/**
 * POST /api/v1/customers/equipments — equipment rows for one AIFM customer.
 * @returns {Promise<object[]|null>}
 */
export async function fetchAifmCustomerEquipmentsList(base, bearer, idCustomer) {
  if (idCustomer == null) return null;
  let res;
  try {
    res = await fetchWithTimeout(
      `${base}/api/v1/customers/equipments`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({ api_token: bearer, customer_id: idCustomer }),
      },
      EQUIPMENTS_TIMEOUT_MS
    );
  } catch {
    return null;
  }
  const json = await res.json().catch(() => ({}));
  if (Number(json.code) !== 200 || !Array.isArray(json.data)) return null;
  return json.data;
}

/**
 * Equipment for a portal masterlist CardCode via AIFM Open API.
 * @returns {Promise<object[]|null>} raw AIFM equipment rows or null
 */
export async function fetchAifmEquipmentsByAccountNumber(accountNumber) {
  const apiToken = (process.env.AIFM_API_TOKEN || '').trim().replace(/^["']|["']$/g, '');
  if (!apiToken) return null;

  const auth = await authorizeAifmBearer(process.env.AIFM_BASE_URL, apiToken);
  if (!auth) return null;

  const idCustomer = await resolveAifmCustomerIdByAccountNumber(
    auth.base,
    auth.bearer,
    accountNumber
  );
  if (idCustomer == null) return null;

  return fetchAifmCustomerEquipmentsList(auth.base, auth.bearer, idCustomer);
}

/**
 * Scan paginated /api/v1/jobs until we find a row with matching id (string compare).
 * @param {string} aifmId
 * @param {{ start_date: string, end_date: string }} range
 * @returns {Promise<object|null>} raw AIFM job object or null
 */
/**
 * Fetch all AIFM jobs in a date range (paginated, deduped by job id).
 * @returns {Promise<{ jobs: object[], pagesFetched: number, totalHint: number|null, error?: string }>}
 */
export async function fetchAllAifmJobsInRange(base, bearer, start_date, end_date, options = {}) {
  const maxPages = options.maxPages ?? 100;
  const all = [];
  const seenIds = new Set();
  let pagesFetched = 0;
  let totalHint = null;
  let lastJson = null;

  for (let page = 1; page <= maxPages; page++) {
    const json = await fetchJobsPageJson(base, bearer, start_date, end_date, page);
    lastJson = json;
    if (!json || Number(json.code) !== 200) {
      if (page === 1) {
        return {
          jobs: [],
          pagesFetched: 0,
          totalHint: null,
          error: json?.msg || 'AIFM jobs request failed',
        };
      }
      break;
    }

    pagesFetched = page;
    totalHint =
      json.total ?? json.total_count ?? json.count ?? json.data_count ?? totalHint;

    const rows = Array.isArray(json.data) ? json.data : [];
    if (!rows.length) break;

    const newRows = rows.filter((j) => {
      const id = String(j?.id ?? '');
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
    all.push(...newRows);

    if (page > 1 && newRows.length === 0) break;
    if (totalHint != null && all.length >= Number(totalHint)) break;
    if (rows.length < PAGE_SIZE) break;
  }

  return {
    jobs: all,
    pagesFetched,
    totalHint,
    code: lastJson?.code ?? null,
    msg: lastJson?.msg ?? null,
  };
}

export async function scanAifmJobsForId(base, bearer, aifmId, range) {
  const target = String(aifmId).trim();
  if (!target) return null;

  for (let page = 1; page <= MAX_PAGES_PER_SCAN; page++) {
    const json = await fetchJobsPageJson(base, bearer, range.start_date, range.end_date, page);
    const rows = Array.isArray(json?.data) ? json.data : [];
    if (!rows.length) break;

    const hit = rows.find((j) => String(j.id) === target);
    if (hit) return hit;

    if (rows.length < PAGE_SIZE) break;
  }
  return null;
}

/** Successful AIFM job payloads only (do not cache misses — date window may need retry). */
const payloadCache = new Map();

/**
 * Fetch one AIFM job payload by id (embedded in portal description as [AIFM:<id>]).
 * Uses env AIFM_API_TOKEN. Caches successful hits by id.
 *
 * @param {string} aifmId
 * @param {{ scheduledIso?: string|null }} [hints] — optional portal job scheduled_start to try a tighter date window first
 * @returns {Promise<object|null>}
 */
export async function findAifmJobPayloadById(aifmId, hints = {}) {
  const id = String(aifmId || '').trim();
  if (!id) return null;

  if (payloadCache.has(id)) return payloadCache.get(id);

  const apiToken = (process.env.AIFM_API_TOKEN || '').trim().replace(/^["']|["']$/g, '');
  if (!apiToken) return null;

  const auth = await authorizeAifmBearer(process.env.AIFM_BASE_URL, apiToken);
  if (!auth) return null;

  const { base, bearer } = auth;
  const ranges = [];
  const tight = aifmTightRangeAroundScheduled(hints.scheduledIso);
  if (tight) ranges.push(tight);
  ranges.push(aifmWideDateRange());

  let found = null;
  for (const range of ranges) {
    found = await scanAifmJobsForId(base, bearer, id, range);
    if (found) break;
  }

  if (found) payloadCache.set(id, found);
  return found;
}
