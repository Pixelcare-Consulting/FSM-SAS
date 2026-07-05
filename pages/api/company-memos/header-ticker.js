import {
  getCachedTickerJson,
  setCachedTickerJson,
} from '../../../lib/redis/companyMemoCache';
import { companyMemoService } from '../../../lib/supabase/database';
import { getSupabaseAdmin } from '../../../lib/supabase/server';

/**
 * GET memo list shown in dashboard header ticker.
 * With REDIS_URL set, payloads are cached (TTL via COMPANY_MEMO_TICKER_CACHE_TTL_SEC or 120s)
 * so each dashboard user/session does not re-hit Supabase for every ticker poll.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const uid = req.cookies?.uid;
  if (!uid) {
    return res.status(401).json({ message: 'Not authenticated', memos: [] });
  }

  const cachedRaw = await getCachedTickerJson();
  if (cachedRaw) {
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(cachedRaw);
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return res.status(500).json({ message: 'Server configuration error', memos: [] });
  }

  try {
    const memos = await companyMemoService.listForHeaderTicker(admin);
    const body = JSON.stringify({ memos });
    if (process.env.REDIS_URL) {
      await setCachedTickerJson(body);
    }
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(body);
  } catch (e) {
    console.error('[company-memos/header-ticker]', e?.message || e);
    return res.status(500).json({ message: 'Failed to load memos', memos: [] });
  }
}
