import { getSupabaseAdmin } from '../../../lib/supabase/server';
import {
  SUPABASE_FOLLOWUP_LIST_SELECT,
  buildFollowUpCountHeadSelect,
  FOLLOWUP_OPEN_STATUS_OR,
  applyActiveFollowUpScope,
  applyFollowUpListFilters,
  fetchTechniciansByJobIds,
  formatFollowUpListRow,
} from '../../../lib/followUps/followUpListSummary';
import {
  getListCache,
  logResponseSize,
  setListCache,
} from '../../../lib/supabase/listQueryHelpers';

const CACHE_TTL_MS = 45000;
const DEFAULT_LIMIT = 10;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, max-age=30');

  const limit = Math.min(Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT), 10);
  const status = String(req.query.status || 'all').trim();
  const type = String(req.query.type || 'all').trim();
  const dateFrom = String(req.query.dateFrom || '').trim();
  const dateTo = String(req.query.dateTo || '').trim();

  const cacheKey = ['followups-quick', limit, status, type, dateFrom, dateTo].join(':');

  const cached = getListCache(cacheKey, CACHE_TTL_MS);
  if (cached) {
    logResponseSize('follow-ups/quick-summary (cached)', cached);
    return res.status(200).json(cached);
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const nowIso = new Date().toISOString();

    let openCountQuery = applyActiveFollowUpScope(
      supabase
        .from('followups')
        .select(buildFollowUpCountHeadSelect(), { count: 'exact', head: true })
        .or(FOLLOWUP_OPEN_STATUS_OR)
    );

    let overdueCountQuery = applyActiveFollowUpScope(
      supabase
        .from('followups')
        .select(buildFollowUpCountHeadSelect(), { count: 'exact', head: true })
        .or(FOLLOWUP_OPEN_STATUS_OR)
        .not('due_date', 'is', null)
        .lt('due_date', nowIso)
    );

    let listQuery = applyActiveFollowUpScope(
      supabase
        .from('followups')
        .select(SUPABASE_FOLLOWUP_LIST_SELECT)
        .or(FOLLOWUP_OPEN_STATUS_OR)
        .order('created_at', { ascending: false })
        .limit(limit)
    );

    if (status && status !== 'all') {
      openCountQuery = applyFollowUpListFilters(openCountQuery, { status });
      overdueCountQuery = applyFollowUpListFilters(overdueCountQuery, { status });
      listQuery = applyFollowUpListFilters(listQuery, { status });
    }

    if (type && type !== 'all') {
      openCountQuery = applyFollowUpListFilters(openCountQuery, { type });
      overdueCountQuery = applyFollowUpListFilters(overdueCountQuery, { type });
      listQuery = applyFollowUpListFilters(listQuery, { type });
    }

    if (dateFrom) {
      openCountQuery = openCountQuery.gte('created_at', `${dateFrom}T00:00:00`);
      overdueCountQuery = overdueCountQuery.gte('created_at', `${dateFrom}T00:00:00`);
      listQuery = listQuery.gte('created_at', `${dateFrom}T00:00:00`);
    }

    if (dateTo) {
      openCountQuery = openCountQuery.lte('created_at', `${dateTo}T23:59:59`);
      overdueCountQuery = overdueCountQuery.lte('created_at', `${dateTo}T23:59:59`);
      listQuery = listQuery.lte('created_at', `${dateTo}T23:59:59`);
    }

    const [openCountResult, overdueCountResult, listResult] = await Promise.all([
      openCountQuery,
      overdueCountQuery,
      listQuery,
    ]);

    if (openCountResult.error) throw openCountResult.error;
    if (overdueCountResult.error) throw overdueCountResult.error;
    if (listResult.error) throw listResult.error;

    const dbRows = listResult.data || [];
    const jobIds = dbRows.map((row) => row.job_id || row.job?.id).filter(Boolean);
    const technicianJobsByJobId = await fetchTechniciansByJobIds(supabase, jobIds);

    const items = dbRows.map((row) => formatFollowUpListRow(row, { technicianJobsByJobId }));

    const payload = {
      openCount: openCountResult.count ?? 0,
      overdueCount: overdueCountResult.count ?? 0,
      totalCount: openCountResult.count ?? items.length,
      items,
      recent: items,
      limit,
      fetchedAt: new Date().toISOString(),
    };

    setListCache(cacheKey, payload, CACHE_TTL_MS);
    logResponseSize('follow-ups/quick-summary', payload);

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Follow-ups quick-summary API error:', error);
    return res.status(500).json({
      error: error.message || 'Unable to load follow-ups quick summary.',
    });
  }
}
