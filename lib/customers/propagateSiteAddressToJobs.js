import { sanitizeAddressPart } from '../utils/formatPortalBpAddress.js';

/**
 * Patch `locations.location_name` and cascade formatted address to all non-deleted jobs
 * linked via `jobs.location_id` (upsert `job_schedule.address` per job).
 *
 * @returns {Promise<{ locationUpdated: boolean, jobsMatched: number, schedulesUpdated: number }>}
 */
export async function propagateSiteAddressToJobs(supabase, linkedLocationId, formattedAddressLine) {
  const address = sanitizeAddressPart(formattedAddressLine);
  if (!linkedLocationId || !address) {
    return { locationUpdated: false, jobsMatched: 0, schedulesUpdated: 0 };
  }

  const now = new Date().toISOString();

  const { error: locErr } = await supabase
    .from('locations')
    .update({ location_name: address, updated_at: now })
    .eq('id', linkedLocationId)
    .is('deleted_at', null);
  if (locErr) throw new Error(`locations update: ${locErr.message}`);

  const { data: jobs, error: jobsErr } = await supabase
    .from('jobs')
    .select('id')
    .eq('location_id', linkedLocationId)
    .is('deleted_at', null);
  if (jobsErr) throw new Error(`jobs lookup: ${jobsErr.message}`);

  const jobIds = (jobs || []).map((j) => j.id).filter(Boolean);
  let schedulesUpdated = 0;

  for (const jobId of jobIds) {
    const { data: sched } = await supabase
      .from('job_schedule')
      .select('id')
      .eq('job_id', jobId)
      .limit(1)
      .maybeSingle();

    if (sched?.id) {
      const { error } = await supabase
        .from('job_schedule')
        .update({ address, updated_at: now })
        .eq('id', sched.id);
      if (error) throw new Error(`job_schedule update ${sched.id}: ${error.message}`);
      schedulesUpdated += 1;
    } else {
      const { error } = await supabase
        .from('job_schedule')
        .insert({ job_id: jobId, address });
      if (error) throw new Error(`job_schedule insert for ${jobId}: ${error.message}`);
      schedulesUpdated += 1;
    }
  }

  return {
    locationUpdated: true,
    jobsMatched: jobIds.length,
    schedulesUpdated,
  };
}
