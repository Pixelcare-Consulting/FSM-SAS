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
    message: row.message || '',
    imageUrl: row.image_url || null,
    createdAt: row.created_at || null,
  };
}
