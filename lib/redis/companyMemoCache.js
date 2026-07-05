import { getRedis } from './client';

/** Namespaced keys (see Redis key-naming conventions) */
const TICKER_CACHE_KEY = 'fsm:v1:company_memos:header_ticker';

function tickerTtlSec() {
  const raw = process.env.COMPANY_MEMO_TICKER_CACHE_TTL_SEC;
  const n = raw != null && raw !== '' ? parseInt(String(raw), 10) : 120;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 900) : 120;
}

/**
 * Cached payload for dashboard header ticker; short TTL balances freshness vs Supabase load.
 * @returns {Promise<string | null>}
 */
export async function getCachedTickerJson() {
  const r = await getRedis();
  if (!r) return null;
  try {
    return await r.get(TICKER_CACHE_KEY);
  } catch {
    return null;
  }
}

/** @param {string} json */
export async function setCachedTickerJson(json) {
  const r = await getRedis();
  if (!r || !json) return;
  try {
    await r.set(TICKER_CACHE_KEY, json, { EX: tickerTtlSec() });
  } catch {
    /* cache is best-effort */
  }
}

export async function invalidateHeaderTickerMemoCache() {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.del(TICKER_CACHE_KEY);
  } catch {
    /* best-effort */
  }
}
