import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { withSession } from '../../../../lib/api/withSession';
import {
  JOB_MESSAGE_LIST_SELECT,
  fetchAdminNamesForMessageList,
  fetchJobsForMessageList,
  fetchTechnicianNamesForMessageList,
  formatJobMessageListRow,
  resolveJobIdsForMessageSearch,
} from '../../../../lib/jobs/jobMessagesListSummary';
import {
  applyMultiTokenIlikeFilters,
  getListCache,
  logResponseSize,
  paginatedSelect,
  parseSearchTokens,
  setListCache,
} from '../../../../lib/supabase/listQueryHelpers';

const CACHE_TTL_MS = 30000;
const MESSAGE_SEARCH_FIELDS = ['message'];

export default withSession(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, max-age=30');

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 25), 200);
  const search = String(req.query.search || '').trim();
  const senderType = String(req.query.senderType || '').trim().toUpperCase();
  const jobId = String(req.query.jobId || '').trim();

  const cacheKey = `job-messages-summary:${page}:${limit}:${search}:${senderType}:${jobId}`;
  const cached = getListCache(cacheKey, CACHE_TTL_MS);
  if (cached) {
    logResponseSize('jobs/messages/list-summary (cached)', cached);
    return res.status(200).json(cached);
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const tokens = parseSearchTokens(search);
    let jobIdFilter = null;
    let matchedByJobNumber = false;
    if (jobId) {
      jobIdFilter = [jobId];
    } else if (search) {
      const byJobNumber = await resolveJobIdsForMessageSearch(supabase, search, 200);
      if (Array.isArray(byJobNumber) && byJobNumber.length > 0) {
        jobIdFilter = byJobNumber;
        matchedByJobNumber = true;
      }
    }

    if (Array.isArray(jobIdFilter) && jobIdFilter.length === 0) {
      const emptyPayload = {
        messages: [],
        totalCount: 0,
        page,
        limit,
        fetchedAt: new Date().toISOString(),
      };
      setListCache(cacheKey, emptyPayload, CACHE_TTL_MS);
      logResponseSize('jobs/messages/list-summary (empty)', emptyPayload);
      return res.status(200).json(emptyPayload);
    }

    const { data: dbRows, totalCount } = await paginatedSelect(
      supabase,
      'job_technician_admin_messages',
      JOB_MESSAGE_LIST_SELECT,
      {
        page,
        limit,
        order: { column: 'created_at', ascending: false },
        filters: (query) => {
          let q = query.is('deleted_at', null);
          if (jobIdFilter) {
            q = q.in('job_id', jobIdFilter);
          }
          if (senderType === 'ADMIN' || senderType === 'TECHNICIAN') {
            q = q.eq('sender_type', senderType);
          }
          // Job-number hits already scoped rows; only message-body search otherwise.
          if (tokens.length > 0 && !matchedByJobNumber) {
            q = applyMultiTokenIlikeFilters(q, tokens, MESSAGE_SEARCH_FIELDS);
          }
          return q;
        },
      }
    );

    const rows = dbRows || [];
    const jobIds = rows.map((r) => r.job_id).filter(Boolean);
    const adminIds = rows
      .filter((r) => r.sender_type === 'ADMIN' && r.admin_id)
      .map((r) => r.admin_id);
    const technicianJobIds = rows
      .filter((r) => r.sender_type === 'TECHNICIAN' && r.technician_job_id)
      .map((r) => r.technician_job_id);

    const [jobsById, adminNamesById, technicianNamesByTjId] = await Promise.all([
      fetchJobsForMessageList(supabase, jobIds),
      fetchAdminNamesForMessageList(supabase, adminIds),
      fetchTechnicianNamesForMessageList(supabase, technicianJobIds),
    ]);

    const messages = rows
      .map((row) =>
        formatJobMessageListRow(row, {
          jobsById,
          adminNamesById,
          technicianNamesByTjId,
        })
      )
      .filter(Boolean);

    const payload = {
      messages,
      totalCount: totalCount ?? messages.length,
      page,
      limit,
      fetchedAt: new Date().toISOString(),
    };

    setListCache(cacheKey, payload, CACHE_TTL_MS);
    logResponseSize('jobs/messages/list-summary', payload);
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Job messages list-summary API error:', error);
    return res.status(500).json({
      error: error.message || 'Unable to load job messages.',
    });
  }
});
