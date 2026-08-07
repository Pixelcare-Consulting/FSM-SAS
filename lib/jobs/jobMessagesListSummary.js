/**
 * Server helpers for paginated Job Messages history (egress-safe LIST selects).
 */

export const JOB_MESSAGE_LIST_SELECT = `
  id,
  job_id,
  technician_job_id,
  sender_type,
  message,
  image_url,
  admin_id,
  created_at
`;

/** Flat job columns for enriching a page of messages (no nested graphs). */
export const JOB_MESSAGE_JOB_LOOKUP_SELECT = `
  id,
  job_number,
  title,
  status,
  customer_id,
  customer:customer_id(customer_name, customer_code)
`;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} jobIds
 */
export async function fetchJobsForMessageList(supabase, jobIds) {
  const map = {};
  const unique = [...new Set((jobIds || []).filter(Boolean))];
  if (!unique.length || !supabase) return map;

  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const batch = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('jobs')
      .select(JOB_MESSAGE_JOB_LOOKUP_SELECT)
      .in('id', batch)
      .is('deleted_at', null);

    if (error) {
      console.warn('job messages job lookup:', error.message);
      continue;
    }
    for (const row of data || []) {
      if (row?.id) map[row.id] = row;
    }
  }
  return map;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} adminIds
 */
export async function fetchAdminNamesForMessageList(supabase, adminIds) {
  const map = {};
  const unique = [...new Set((adminIds || []).filter(Boolean))];
  if (!unique.length || !supabase) return map;

  const { data, error } = await supabase
    .from('users')
    .select('id, username')
    .in('id', unique)
    .is('deleted_at', null);

  if (error) {
    console.warn('job messages admin lookup:', error.message);
    return map;
  }
  for (const row of data || []) {
    if (row?.id) map[row.id] = row.username || 'Admin';
  }
  return map;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} technicianJobIds
 */
export async function fetchTechnicianNamesForMessageList(supabase, technicianJobIds) {
  const map = {};
  const unique = [...new Set((technicianJobIds || []).filter(Boolean))];
  if (!unique.length || !supabase) return map;

  const { data, error } = await supabase
    .from('technician_jobs')
    .select('id, technician:technician_id(id, full_name)')
    .in('id', unique)
    .is('deleted_at', null);

  if (error) {
    console.warn('job messages technician lookup:', error.message);
    return map;
  }
  for (const row of data || []) {
    if (row?.id) {
      map[row.id] = row.technician?.full_name || 'Technician';
    }
  }
  return map;
}

/**
 * Resolve job IDs whose job_number matches search tokens (capped).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} search
 * @param {number} [cap]
 */
export async function resolveJobIdsForMessageSearch(supabase, search, cap = 200) {
  const q = String(search || '').trim();
  if (!q || !supabase) return null;

  const { data, error } = await supabase
    .from('jobs')
    .select('id')
    .ilike('job_number', `%${q.replace(/[%_]/g, '\\$&')}%`)
    .is('deleted_at', null)
    .limit(cap);

  if (error) {
    console.warn('job messages job_number search:', error.message);
    return [];
  }
  return (data || []).map((r) => r.id).filter(Boolean);
}

/**
 * Collapse message rows (newest-first) into one conversation per job.
 * Keeps the latest message as the preview; ORs unread across the scanned set.
 * @param {object[]} messages - formatted or raw rows with jobId/job_id
 * @returns {object[]}
 */
export function collapseToLatestConversationPerJob(messages) {
  const byJob = new Map();
  for (const m of messages || []) {
    const jobId = m.jobId || m.job_id;
    if (!jobId) continue;
    const existing = byJob.get(jobId);
    if (!existing) {
      byJob.set(jobId, {
        ...m,
        jobId,
        messageCount: 1,
        isUnread: Boolean(m.isUnread),
      });
      continue;
    }
    existing.messageCount = (existing.messageCount || 1) + 1;
    if (m.isUnread) existing.isUnread = true;
  }
  return [...byJob.values()];
}

/**
 * Walk newest messages until we have enough unique jobs for the requested page.
 * @returns {Promise<{ rows: object[], totalCount: number }>}
 */
export async function fetchLatestMessageRowsGroupedByJob(supabase, options = {}) {
  const {
    page = 1,
    limit = 25,
    applyFilters,
    batchSize = 100,
    maxBatches = 20,
  } = options;

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(Math.max(1, Number(limit) || 25), 200);
  const needUnique = safePage * safeLimit;
  const latestByJob = new Map();
  let offset = 0;
  let exhausted = false;
  let batches = 0;

  while (latestByJob.size < needUnique && !exhausted && batches < maxBatches) {
    batches += 1;
    let query = supabase
      .from('job_technician_admin_messages')
      .select(JOB_MESSAGE_LIST_SELECT)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (typeof applyFilters === 'function') {
      query = applyFilters(query);
    }

    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) {
      exhausted = true;
      break;
    }

    for (const row of rows) {
      const jid = row.job_id;
      if (!jid) continue;
      if (!latestByJob.has(jid)) {
        latestByJob.set(jid, { row, messageCount: 1 });
      } else {
        latestByJob.get(jid).messageCount += 1;
      }
    }

    if (rows.length < batchSize) {
      exhausted = true;
      break;
    }
    offset += batchSize;
  }

  // Continue scanning to improve total conversation count (unique jobs).
  while (!exhausted && batches < maxBatches) {
    batches += 1;
    let query = supabase
      .from('job_technician_admin_messages')
      .select('job_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (typeof applyFilters === 'function') {
      query = applyFilters(query);
    }

    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) {
      exhausted = true;
      break;
    }
    for (const row of rows) {
      const jid = row.job_id;
      if (!jid) continue;
      if (!latestByJob.has(jid)) {
        latestByJob.set(jid, { row: null, messageCount: 1 });
      } else {
        latestByJob.get(jid).messageCount += 1;
      }
    }
    if (rows.length < batchSize) {
      exhausted = true;
      break;
    }
    offset += batchSize;
  }

  const ordered = [...latestByJob.values()]
    .filter((entry) => entry.row)
    .map((entry) => ({ ...entry.row, _messageCount: entry.messageCount }));

  const pageRows = ordered.slice((safePage - 1) * safeLimit, safePage * safeLimit);
  return {
    rows: pageRows,
    totalCount: latestByJob.size,
  };
}

/**
 * @param {object} row
 * @param {object} ctx
 */
export function formatJobMessageListRow(row, ctx = {}) {
  if (!row?.id) return null;
  const job = ctx.jobsById?.[row.job_id] || null;
  const senderType = row.sender_type === 'TECHNICIAN' ? 'TECHNICIAN' : 'ADMIN';
  let senderName = senderType === 'ADMIN' ? 'Admin' : 'Technician';
  if (senderType === 'ADMIN' && row.admin_id && ctx.adminNamesById?.[row.admin_id]) {
    senderName = ctx.adminNamesById[row.admin_id];
  } else if (
    senderType === 'TECHNICIAN' &&
    row.technician_job_id &&
    ctx.technicianNamesByTjId?.[row.technician_job_id]
  ) {
    senderName = ctx.technicianNamesByTjId[row.technician_job_id];
  }

  const customer = job?.customer || null;
  const isUnread =
    typeof ctx.isUnread === 'boolean'
      ? ctx.isUnread
      : typeof row.is_unread === 'boolean'
        ? row.is_unread
        : false;

  const currentUserId = ctx.currentUserId || null;
  const isOwn =
    senderType === 'ADMIN' &&
    currentUserId &&
    row.admin_id &&
    String(row.admin_id) === String(currentUserId);

  return {
    id: row.id,
    jobId: row.job_id,
    jobNumber: job?.job_number || null,
    jobTitle: job?.title || null,
    jobStatus: job?.status || null,
    customerName: customer?.customer_name || null,
    customerCode: customer?.customer_code || null,
    senderType,
    senderName,
    adminId: row.admin_id || null,
    message: row.message || '',
    imageUrl: row.image_url || null,
    createdAt: row.created_at || null,
    isUnread,
    isOwn: Boolean(isOwn),
    readAt: ctx.readAt || null,
    messageCount: row._messageCount || null,
  };
}
