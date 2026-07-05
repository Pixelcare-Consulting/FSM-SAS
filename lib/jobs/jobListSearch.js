import {
  applyMultiTokenIlikeFilters,
  parseSearchTokens,
  runWithConcurrency,
} from '../supabase/listQueryHelpers.js';

const SUB_QUERY_LIMIT = 200;

const JOB_DIRECT_SEARCH_FIELDS = [
  'job_number',
  'title',
  'status',
  'description',
  'priority',
];

/**
 * Resolve job IDs matching a global search across jobs, customers, locations,
 * schedule addresses, and technicians. Returns null when search is empty,
 * [] when nothing matches, or a deduplicated string[] of job IDs.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} searchQuery
 * @returns {Promise<null | string[]>}
 */
export async function resolveJobIdsForGlobalSearch(supabase, searchQuery) {
  const tokens = parseSearchTokens(searchQuery);
  if (tokens.length === 0) return null;

  const lookups = [
    () => resolveJobIdsFromJobsDirect(supabase, tokens),
    () => resolveJobIdsFromCustomer(supabase, tokens),
    () => resolveJobIdsFromLocation(supabase, tokens),
    () => resolveJobIdsFromScheduleAddress(supabase, tokens),
    () => resolveJobIdsFromTechnician(supabase, tokens),
  ];

  const results = await runWithConcurrency(lookups, 6);
  const idSet = new Set();
  for (const ids of results) {
    for (const id of ids) {
      if (id) idSet.add(id);
    }
  }

  if (idSet.size === 0) return [];
  return [...idSet];
}

async function resolveJobIdsFromJobsDirect(supabase, tokens) {
  let query = supabase.from('jobs').select('id').is('deleted_at', null);
  query = applyMultiTokenIlikeFilters(query, tokens, JOB_DIRECT_SEARCH_FIELDS);
  const { data, error } = await query.limit(SUB_QUERY_LIMIT);
  if (error) throw error;
  return (data || []).map((row) => row.id).filter(Boolean);
}

async function resolveJobIdsFromCustomer(supabase, tokens) {
  let customerQuery = supabase
    .from('customer')
    .select('id')
    .is('deleted_at', null);
  customerQuery = applyMultiTokenIlikeFilters(customerQuery, tokens, [
    'customer_name',
    'customer_code',
  ]);

  const { data: customers, error } = await customerQuery.limit(SUB_QUERY_LIMIT);
  if (error) throw error;

  const customerIds = (customers || []).map((c) => c.id).filter(Boolean);
  if (customerIds.length === 0) return [];

  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id')
    .is('deleted_at', null)
    .in('customer_id', customerIds)
    .limit(SUB_QUERY_LIMIT);

  if (jobsError) throw jobsError;
  return (jobs || []).map((row) => row.id).filter(Boolean);
}

async function resolveJobIdsFromLocation(supabase, tokens) {
  let locationQuery = supabase.from('locations').select('id');
  locationQuery = applyMultiTokenIlikeFilters(locationQuery, tokens, ['location_name']);

  const { data: locations, error } = await locationQuery.limit(SUB_QUERY_LIMIT);
  if (error) throw error;

  const locationIds = (locations || []).map((loc) => loc.id).filter(Boolean);
  if (locationIds.length === 0) return [];

  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id')
    .is('deleted_at', null)
    .in('location_id', locationIds)
    .limit(SUB_QUERY_LIMIT);

  if (jobsError) throw jobsError;
  return (jobs || []).map((row) => row.id).filter(Boolean);
}

async function resolveJobIdsFromScheduleAddress(supabase, tokens) {
  let scheduleQuery = supabase.from('job_schedule').select('job_id');
  scheduleQuery = applyMultiTokenIlikeFilters(scheduleQuery, tokens, ['address']);

  const { data: schedules, error } = await scheduleQuery.limit(SUB_QUERY_LIMIT);
  if (error) throw error;
  return (schedules || []).map((row) => row.job_id).filter(Boolean);
}

async function resolveJobIdsFromTechnician(supabase, tokens) {
  let technicianQuery = supabase.from('technicians').select('id');
  technicianQuery = applyMultiTokenIlikeFilters(technicianQuery, tokens, ['full_name']);

  const { data: technicians, error } = await technicianQuery.limit(SUB_QUERY_LIMIT);
  if (error) throw error;

  const technicianIds = (technicians || []).map((t) => t.id).filter(Boolean);
  if (technicianIds.length === 0) return [];

  const { data: technicianJobs, error: tjError } = await supabase
    .from('technician_jobs')
    .select('job_id')
    .in('technician_id', technicianIds)
    .is('deleted_at', null)
    .limit(SUB_QUERY_LIMIT);

  if (tjError) throw tjError;
  return (technicianJobs || []).map((row) => row.job_id).filter(Boolean);
}
