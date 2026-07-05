import { getSupabaseAdmin } from '../../../lib/supabase/server';
import {
  buildOverviewAggregates,
  fetchFollowUpStatusCounts,
  fetchJobStatusCountsGrouped,
  fetchSlimJobsForOverview,
} from '../../../lib/dashboard/overviewAggregates';
import { getListCache, logResponseSize, setListCache } from '../../../lib/supabase/listQueryHelpers';

const CACHE_TTL_MS = 180000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, max-age=120');

  const cacheKey = 'dashboard-overview-stats-v2';
  const cached = getListCache(cacheKey, CACHE_TTL_MS);
  if (cached) {
    logResponseSize('dashboard/overview-stats (cached)', cached);
    return res.status(200).json(cached);
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const [slimJobs, followUpCounts, statusGrouped] = await Promise.all([
      fetchSlimJobsForOverview(supabase),
      fetchFollowUpStatusCounts(supabase),
      fetchJobStatusCountsGrouped(supabase),
    ]);

    const aggregates = await buildOverviewAggregates(supabase, slimJobs, statusGrouped);

    const payload = {
      jobCount: aggregates.jobCount,
      statusCounts: aggregates.statusCounts,
      periods: aggregates.periods,
      followUpCounts,
      fetchedAt: new Date().toISOString(),
    };

    setListCache(cacheKey, payload, CACHE_TTL_MS);
    logResponseSize('dashboard/overview-stats', payload);

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Dashboard overview-stats API error:', error);
    return res.status(500).json({
      error: error.message || 'Unable to load dashboard stats.',
    });
  }
}
