import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { withSession } from '../../../../lib/api/withSession';
import {
  JOB_MESSAGE_LIST_SELECT,
  fetchAdminNamesForMessageList,
  fetchJobsForMessageList,
  fetchLatestMessageRowsGroupedByJob,
  fetchTechnicianNamesForMessageList,
  formatJobMessageListRow,
  collapseToLatestConversationPerJob,
  resolveJobIdsForMessageSearch,
} from '../../../../lib/jobs/jobMessagesListSummary';
import {
  JOB_MESSAGE_READS_CACHE_PREFIX,
  countUnreadJobMessages,
  fetchReadReceiptsByMessageId,
  isJobMessageUnreadForUser,
  listUnreadJobMessageIds,
} from '../../../../lib/jobs/jobMessageReads';
import {
  applyMultiTokenIlikeFilters,
  getListCache,
  logResponseSize,
  paginatedSelect,
  parseSearchTokens,
  setListCache,
} from '../../../../lib/supabase/listQueryHelpers';

const CACHE_TTL_MS = 15000;
const MESSAGE_SEARCH_FIELDS = ['message'];

async function enrichMessageRows(supabase, rows, userId) {
  const jobIds = rows.map((r) => r.job_id).filter(Boolean);
  const adminIds = rows
    .filter((r) => r.sender_type === 'ADMIN' && r.admin_id)
    .map((r) => r.admin_id);
  const technicianJobIds = rows
    .filter((r) => r.sender_type === 'TECHNICIAN' && r.technician_job_id)
    .map((r) => r.technician_job_id);

  const [jobsById, adminNamesById, technicianNamesByTjId, readReceipts] = await Promise.all([
    fetchJobsForMessageList(supabase, jobIds),
    fetchAdminNamesForMessageList(supabase, adminIds),
    fetchTechnicianNamesForMessageList(supabase, technicianJobIds),
    fetchReadReceiptsByMessageId(
      supabase,
      userId,
      rows.map((r) => r.id)
    ),
  ]);

  const readSet = new Set(readReceipts.keys());

  return rows
    .map((row) =>
      formatJobMessageListRow(row, {
        jobsById,
        adminNamesById,
        technicianNamesByTjId,
        isUnread: isJobMessageUnreadForUser(row, userId, readSet),
        readAt: readReceipts.get(String(row.id)) || null,
        currentUserId: userId,
      })
    )
    .filter(Boolean);
}

function buildMessageFilters({ jobIdFilter, senderType, tokens, matchedByJobNumber }) {
  return (query) => {
    let q = query;
    if (jobIdFilter) {
      q = q.in('job_id', jobIdFilter);
    }
    if (senderType === 'ADMIN' || senderType === 'TECHNICIAN') {
      q = q.eq('sender_type', senderType);
    }
    if (tokens.length > 0 && !matchedByJobNumber) {
      q = applyMultiTokenIlikeFilters(q, tokens, MESSAGE_SEARCH_FIELDS);
    }
    return q;
  };
}

export default withSession(async function handler(req, res, session) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, max-age=15');

  const userId = session?.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 25), 200);
  const search = String(req.query.search || '').trim();
  const senderType = String(req.query.senderType || '').trim().toUpperCase();
  const jobId = String(req.query.jobId || '').trim();
  const readStatus = String(req.query.readStatus || 'all').trim().toLowerCase();
  const groupByJob =
    String(req.query.groupBy || '').trim().toLowerCase() === 'job' && !jobId;

  const cacheKey = `${JOB_MESSAGE_READS_CACHE_PREFIX}:summary:${userId}:${page}:${limit}:${search}:${senderType}:${jobId}:${readStatus}:${groupByJob ? 'job' : 'msg'}`;
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

    const unreadCountPromise = countUnreadJobMessages(supabase, userId, {
      senderType: senderType === 'ADMIN' || senderType === 'TECHNICIAN' ? senderType : null,
      jobId: jobId || null,
    });

    // Unread folder: page via RPC / fallback, then hydrate LIST rows by id.
    if (readStatus === 'unread') {
      // Over-fetch message ids so we can collapse to unique jobs when grouping.
      const fetchLimit = groupByJob ? Math.min(500, Math.max(limit * 8, 100)) : limit;
      const fetchOffset = groupByJob ? 0 : (page - 1) * limit;
      const { ids, totalCount } = await listUnreadJobMessageIds(supabase, userId, {
        limit: fetchLimit,
        offset: fetchOffset,
        senderType: senderType === 'ADMIN' || senderType === 'TECHNICIAN' ? senderType : null,
        jobId: jobId || null,
      });

      if (!ids.length) {
        const unreadCount = await unreadCountPromise;
        const emptyPayload = {
          messages: [],
          totalCount: 0,
          unreadCount,
          page,
          limit,
          groupBy: groupByJob ? 'job' : null,
          fetchedAt: new Date().toISOString(),
        };
        setListCache(cacheKey, emptyPayload, CACHE_TTL_MS);
        return res.status(200).json(emptyPayload);
      }

      const { data: dbRows, error } = await supabase
        .from('job_technician_admin_messages')
        .select(JOB_MESSAGE_LIST_SELECT)
        .in('id', ids)
        .is('deleted_at', null);

      if (error) throw error;

      const byId = new Map((dbRows || []).map((r) => [String(r.id), r]));
      const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);
      let messages = await enrichMessageRows(supabase, ordered, userId);

      if (search) {
        const q = search.toLowerCase();
        messages = messages.filter(
          (m) =>
            (m.message || '').toLowerCase().includes(q) ||
            (m.jobNumber || '').toLowerCase().includes(q)
        );
      }

      if (groupByJob) {
        const conversations = collapseToLatestConversationPerJob(messages);
        const slice = conversations.slice((page - 1) * limit, page * limit);
        const unreadCount = await unreadCountPromise;
        const payload = {
          messages: slice,
          totalCount: conversations.length,
          unreadCount,
          page,
          limit,
          groupBy: 'job',
          fetchedAt: new Date().toISOString(),
        };
        setListCache(cacheKey, payload, CACHE_TTL_MS);
        logResponseSize('jobs/messages/list-summary', payload);
        return res.status(200).json(payload);
      }

      const unreadCount = await unreadCountPromise;
      const payload = {
        messages,
        totalCount: totalCount ?? messages.length,
        unreadCount,
        page,
        limit,
        fetchedAt: new Date().toISOString(),
      };
      setListCache(cacheKey, payload, CACHE_TTL_MS);
      logResponseSize('jobs/messages/list-summary', payload);
      return res.status(200).json(payload);
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
      const unreadCount = await unreadCountPromise;
      const emptyPayload = {
        messages: [],
        totalCount: 0,
        unreadCount,
        page,
        limit,
        groupBy: groupByJob ? 'job' : null,
        fetchedAt: new Date().toISOString(),
      };
      setListCache(cacheKey, emptyPayload, CACHE_TTL_MS);
      logResponseSize('jobs/messages/list-summary (empty)', emptyPayload);
      return res.status(200).json(emptyPayload);
    }

    const applyFilters = buildMessageFilters({
      jobIdFilter,
      senderType,
      tokens,
      matchedByJobNumber,
    });

    if (groupByJob) {
      const { rows: dbRows, totalCount } = await fetchLatestMessageRowsGroupedByJob(supabase, {
        page,
        limit,
        applyFilters,
      });
      const messages = await enrichMessageRows(supabase, dbRows, userId);
      const unreadCount = await unreadCountPromise;
      const payload = {
        messages,
        totalCount: totalCount ?? messages.length,
        unreadCount,
        page,
        limit,
        groupBy: 'job',
        fetchedAt: new Date().toISOString(),
      };
      setListCache(cacheKey, payload, CACHE_TTL_MS);
      logResponseSize('jobs/messages/list-summary', payload);
      return res.status(200).json(payload);
    }

    const { data: dbRows, totalCount } = await paginatedSelect(
      supabase,
      'job_technician_admin_messages',
      JOB_MESSAGE_LIST_SELECT,
      {
        page,
        limit,
        order: { column: 'created_at', ascending: false },
        filters: (query) => applyFilters(query),
      }
    );

    const rows = dbRows || [];
    const messages = await enrichMessageRows(supabase, rows, userId);
    const unreadCount = await unreadCountPromise;

    const payload = {
      messages,
      totalCount: totalCount ?? messages.length,
      unreadCount,
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
