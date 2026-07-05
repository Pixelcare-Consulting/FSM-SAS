import { buildLeadLocationName } from '../utils/leadLocationName.js';
import { toSingaporeYmd } from '../utils/singaporeDateTime.js';

function normalizeLeadServiceDateYmd(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const ymd = toSingaporeYmd(value);
  return ymd || null;
}

function getLeadServiceDates(lead) {
  return {
    first: normalizeLeadServiceDateYmd(lead?.first_service_date),
    second: normalizeLeadServiceDateYmd(lead?.second_service_date),
    third: normalizeLeadServiceDateYmd(lead?.third_service_date),
    fourth: normalizeLeadServiceDateYmd(lead?.fourth_service_date),
  };
}

export async function getLeadJobsByServiceDate(lead, options = {}) {
  if (!lead?.customer_id) {
    return {};
  }

  const supabase = options.supabase || (await import('../supabase/server.js')).getSupabaseAdmin();
  const customerId = options.customerId || lead.customer_id;
  const locationName = options.locationName || buildLeadLocationName(lead);

  let locationId = options.locationId ?? null;

  if (locationId == null && locationName) {
    const { data: location } = await supabase
      .from('locations')
      .select('id')
      .eq('customer_id', customerId)
      .eq('location_name', locationName)
      .is('deleted_at', null)
      .maybeSingle();

    locationId = location?.id ?? null;
  }

  let query = supabase
    .from('jobs')
    .select('id, job_number, scheduled_start')
    .eq('customer_id', customerId)
    .is('deleted_at', null);

  if (locationId != null) {
    query = query.eq('location_id', locationId);
  }

  const { data: jobs, error } = await query;
  if (error) {
    throw new Error(`Failed to load lead jobs: ${error.message}`);
  }

  const dates = getLeadServiceDates(lead);
  const jobsByServiceDate = {};

  for (const job of jobs || []) {
    const jobDate = toSingaporeYmd(job.scheduled_start);
    if (!jobDate) continue;

    if (dates.first === jobDate) jobsByServiceDate.first = { id: job.id, job_number: job.job_number };
    else if (dates.second === jobDate) jobsByServiceDate.second = { id: job.id, job_number: job.job_number };
    else if (dates.third === jobDate) jobsByServiceDate.third = { id: job.id, job_number: job.job_number };
    else if (dates.fourth === jobDate) jobsByServiceDate.fourth = { id: job.id, job_number: job.job_number };
  }

  return jobsByServiceDate;
}
