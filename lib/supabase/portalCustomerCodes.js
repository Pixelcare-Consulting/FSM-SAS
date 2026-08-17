/**
 * Portal CP customer-code allocation.
 * Sequence is numeric max of codes matching /^CP\d+$/ (including soft-deleted;
 * UNIQUE is not active-only). Prefers Postgres RPC; falls back to length-bucket queries.
 */

const PORTAL_CODE_RE = /^CP(\d+)$/;
const MIN_PAD = 5;
const MIN_DIGIT_LEN = 1;
const MAX_DIGIT_LEN = 12;
const SKIP_BUDGET_MIN = 10000;
const OCCUPIED_CHUNK = 50;
const RPC_NAME = 'next_portal_customer_codes';

export function formatPortalCustomerCode(num) {
  return 'CP' + String(num).padStart(MIN_PAD, '0');
}

export function parsePortalCustomerNumber(code) {
  const m = String(code || '').match(PORTAL_CODE_RE);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function skipBudgetFor(count) {
  return Math.max(SKIP_BUDGET_MIN, count * 50);
}

function isMissingRpc(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /could not find the function/i.test(msg)
  );
}

function normalizeRpcCodes(data) {
  if (!data) return [];
  const rows = Array.isArray(data) ? data : [data];
  return rows
    .map((row) => (typeof row === 'string' ? row : row?.customer_code))
    .filter((code) => typeof code === 'string' && code.length > 0);
}

async function allocateViaRpc(supabase, count) {
  const { data, error } = await supabase.rpc(RPC_NAME, { p_count: count });
  if (error) {
    if (isMissingRpc(error)) return null;
    console.error(`[portalCustomerCodes] RPC ${RPC_NAME} failed:`, error.message || error);
    throw error;
  }
  return normalizeRpcCodes(data);
}

async function fetchMaxForDigitLength(supabase, digitCount) {
  const likePat = 'CP' + '_'.repeat(digitCount);
  const lo = 'CP' + '0'.repeat(digitCount);
  const hi = 'CP' + '9'.repeat(digitCount);
  const { data, error } = await supabase
    .from('customer')
    .select('customer_code')
    .like('customer_code', likePat)
    .gte('customer_code', lo)
    .lte('customer_code', hi)
    .order('customer_code', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return parsePortalCustomerNumber(data?.customer_code);
}

async function getNumericMaxPortalCode(supabase) {
  const lengths = [];
  for (let n = MIN_DIGIT_LEN; n <= MAX_DIGIT_LEN; n += 1) lengths.push(n);
  const maxima = await Promise.all(lengths.map((n) => fetchMaxForDigitLength(supabase, n)));
  const nums = maxima.filter((n) => n != null);
  if (nums.length === 0) return 0;
  return Math.max(...nums);
}

async function fetchOccupiedCodes(supabase, candidates) {
  if (!candidates.length) return new Set();
  const { data, error } = await supabase
    .from('customer')
    .select('customer_code')
    .in('customer_code', candidates);

  if (error) throw error;
  return new Set((data || []).map((row) => row.customer_code).filter(Boolean));
}

function throwAllocateFailure(startCode, lastCandidate, count, got) {
  console.error('[portalCustomerCodes] Could not find an available portal customer code', {
    startCode,
    lastCandidate,
    requested: count,
    allocated: got,
  });
  throw new Error('Could not find an available portal customer code');
}

async function allocateViaLengthBuckets(supabase, count) {
  const maxNum = await getNumericMaxPortalCode(supabase);
  let nextNum = maxNum + 1;
  const startCode = formatPortalCustomerCode(nextNum);
  const budget = skipBudgetFor(count);
  const codes = [];
  let lastCandidate = startCode;
  let scanned = 0;

  while (codes.length < count && scanned < budget) {
    const remaining = count - codes.length;
    const chunkSize = Math.min(OCCUPIED_CHUNK, budget - scanned, Math.max(remaining * 4, remaining));
    const chunk = [];
    for (let i = 0; i < chunkSize; i += 1) {
      chunk.push(formatPortalCustomerCode(nextNum + i));
    }
    lastCandidate = chunk[chunk.length - 1];
    const occupied = await fetchOccupiedCodes(supabase, chunk);
    for (const candidate of chunk) {
      scanned += 1;
      if (!occupied.has(candidate)) {
        codes.push(candidate);
        if (codes.length === count) break;
      }
    }
    nextNum += chunkSize;
  }

  if (codes.length < count) {
    throwAllocateFailure(startCode, lastCandidate, count, codes.length);
  }
  return codes;
}

/**
 * Reserve the next `count` unused portal CP codes (active + soft-deleted occupy UNIQUE).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} count
 * @returns {Promise<string[]>}
 */
export async function allocateNextPortalCustomerCodes(supabase, count) {
  if (!count || count <= 0) return [];

  const rpcCodes = await allocateViaRpc(supabase, count);
  if (rpcCodes) {
    if (rpcCodes.length < count) {
      throwAllocateFailure(rpcCodes[0] || null, rpcCodes[rpcCodes.length - 1] || null, count, rpcCodes.length);
    }
    return rpcCodes.slice(0, count);
  }

  return allocateViaLengthBuckets(supabase, count);
}
