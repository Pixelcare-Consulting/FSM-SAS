/**
 * Server helpers for Job Message per-user read receipts.
 */

export const JOB_MESSAGE_READS_CACHE_PREFIX = 'job-messages-unread';

/**
 * @param {object} row
 * @param {string|null} userId
 * @param {Set<string>} readMessageIds
 */
export function isJobMessageUnreadForUser(row, userId, readMessageIds) {
  if (!row?.id) return false;
  if (
    row.sender_type === 'ADMIN' &&
    userId &&
    row.admin_id &&
    String(row.admin_id) === String(userId)
  ) {
    return false;
  }
  if (readMessageIds?.has(String(row.id))) return false;
  return true;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string[]} messageIds
 * @returns {Promise<Set<string>>}
 */
export async function fetchReadMessageIdSet(supabase, userId, messageIds) {
  const map = await fetchReadReceiptsByMessageId(supabase, userId, messageIds);
  return new Set(map.keys());
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string[]} messageIds
 * @returns {Promise<Map<string, string|null>>} messageId → read_at ISO (or null)
 */
export async function fetchReadReceiptsByMessageId(supabase, userId, messageIds) {
  const map = new Map();
  const unique = [...new Set((messageIds || []).filter(Boolean).map(String))];
  if (!supabase || !userId || unique.length === 0) return map;

  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const batch = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('job_message_reads')
      .select('message_id, read_at')
      .eq('user_id', userId)
      .in('message_id', batch);

    if (error) {
      console.warn('job_message_reads lookup:', error.message);
      continue;
    }
    for (const row of data || []) {
      if (row?.message_id) map.set(String(row.message_id), row.read_at || null);
    }
  }
  return map;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ senderType?: string, jobId?: string }} [opts]
 * @returns {Promise<number>}
 */
export async function countUnreadJobMessages(supabase, userId, opts = {}) {
  if (!supabase || !userId) return 0;

  const senderType =
    opts.senderType && opts.senderType !== 'all'
      ? String(opts.senderType).toUpperCase()
      : null;
  const jobId = opts.jobId || null;

  const { data, error } = await supabase.rpc('count_unread_job_messages', {
    p_user_id: userId,
    p_sender_type: senderType,
    p_job_id: jobId,
  });

  if (error) {
    console.warn('count_unread_job_messages rpc:', error.message);
    return countUnreadJobMessagesFallback(supabase, userId, opts);
  }
  return Number(data) || 0;
}

/**
 * Fallback when RPC is not applied yet: sample recent TECHNICIAN (and other-admin)
 * messages and subtract reads. Caps work for egress safety.
 */
async function countUnreadJobMessagesFallback(supabase, userId, opts = {}) {
  const senderType =
    opts.senderType && opts.senderType !== 'all'
      ? String(opts.senderType).toUpperCase()
      : null;

  let query = supabase
    .from('job_technician_admin_messages')
    .select('id, sender_type, admin_id')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);

  if (opts.jobId) query = query.eq('job_id', opts.jobId);
  if (senderType === 'ADMIN' || senderType === 'TECHNICIAN') {
    query = query.eq('sender_type', senderType);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('unread fallback list:', error.message);
    return 0;
  }

  const candidates = (data || []).filter((row) => {
    if (
      row.sender_type === 'ADMIN' &&
      row.admin_id &&
      String(row.admin_id) === String(userId)
    ) {
      return false;
    }
    return true;
  });
  if (!candidates.length) return 0;

  const readSet = await fetchReadMessageIdSet(
    supabase,
    userId,
    candidates.map((r) => r.id)
  );
  return candidates.filter((r) => !readSet.has(String(r.id))).length;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ limit?: number, offset?: number, senderType?: string, jobId?: string }} opts
 * @returns {Promise<{ ids: string[], totalCount: number }>}
 */
export async function listUnreadJobMessageIds(supabase, userId, opts = {}) {
  const limit = Math.min(Math.max(1, Number(opts.limit) || 25), 200);
  const offset = Math.max(0, Number(opts.offset) || 0);
  const senderType =
    opts.senderType && opts.senderType !== 'all'
      ? String(opts.senderType).toUpperCase()
      : null;
  const jobId = opts.jobId || null;

  const totalCount = await countUnreadJobMessages(supabase, userId, {
    senderType,
    jobId,
  });

  const { data, error } = await supabase.rpc('list_unread_job_message_ids', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
    p_sender_type: senderType,
    p_job_id: jobId,
  });

  if (error) {
    console.warn('list_unread_job_message_ids rpc:', error.message);
    return listUnreadJobMessageIdsFallback(supabase, userId, {
      limit,
      offset,
      senderType,
      jobId,
      totalCount,
    });
  }

  const ids = (data || []).map((id) => String(id)).filter(Boolean);
  return { ids, totalCount };
}

async function listUnreadJobMessageIdsFallback(supabase, userId, opts) {
  const limit = opts.limit;
  const offset = opts.offset;
  let query = supabase
    .from('job_technician_admin_messages')
    .select('id, sender_type, admin_id')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(500, offset + limit + 50));

  if (opts.jobId) query = query.eq('job_id', opts.jobId);
  if (opts.senderType === 'ADMIN' || opts.senderType === 'TECHNICIAN') {
    query = query.eq('sender_type', opts.senderType);
  }

  const { data, error } = await query;
  if (error) {
    return { ids: [], totalCount: opts.totalCount || 0 };
  }

  const candidates = (data || []).filter((row) => {
    if (
      row.sender_type === 'ADMIN' &&
      row.admin_id &&
      String(row.admin_id) === String(userId)
    ) {
      return false;
    }
    return true;
  });
  const readSet = await fetchReadMessageIdSet(
    supabase,
    userId,
    candidates.map((r) => r.id)
  );
  const unreadIds = candidates
    .filter((r) => !readSet.has(String(r.id)))
    .map((r) => String(r.id));
  return {
    ids: unreadIds.slice(offset, offset + limit),
    totalCount: opts.totalCount ?? unreadIds.length,
  };
}

/**
 * Upsert read receipts for the given message ids.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string[]} messageIds
 */
export async function markJobMessagesRead(supabase, userId, messageIds) {
  const unique = [...new Set((messageIds || []).filter(Boolean).map(String))];
  if (!supabase || !userId || unique.length === 0) {
    return { marked: 0 };
  }

  const now = new Date().toISOString();
  const chunkSize = 100;
  let marked = 0;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const batch = unique.slice(i, i + chunkSize).map((message_id) => ({
      message_id,
      user_id: userId,
      read_at: now,
    }));
    const { error } = await supabase
      .from('job_message_reads')
      .upsert(batch, { onConflict: 'message_id,user_id' });
    if (error) {
      throw error;
    }
    marked += batch.length;
  }

  return { marked };
}

/**
 * Mark all (non-deleted) messages for a job as read for the user.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} jobId
 */
export async function markJobThreadRead(supabase, userId, jobId) {
  if (!supabase || !userId || !jobId) return { marked: 0 };

  const ids = [];
  const pageSize = 200;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('job_technician_admin_messages')
      .select('id')
      .eq('job_id', jobId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = data || [];
    for (const row of rows) {
      if (row?.id) ids.push(String(row.id));
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return markJobMessagesRead(supabase, userId, ids);
}
