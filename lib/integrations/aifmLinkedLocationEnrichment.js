/**
 * Jobs that already have customer_id but no location_id: pull service_location from AIFM API
 * by [AIFM:<id>] and link locations + job_schedule.address.
 */

import { getServiceAddressFromAifmJobDescription } from './aifmJobLocationFromApi';
import { resolveLocation } from './aifmAssignCustomersCore';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ log?: function, maxJobs?: number, onJob?: function, onError?: function }} options
 */
export async function runAifmLinkedJobsLocationEnrichmentPass(supabase, options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {};
  const onJob = typeof options.onJob === 'function' ? options.onJob : null;
  const onError = typeof options.onError === 'function' ? options.onError : null;
  const maxJobs = Math.min(Math.max(Number(options.maxJobs) || 500, 1), 20000);

  const PAGE = 500;
  const all = [];
  let from = 0;

  for (;;) {
    if (all.length >= maxJobs) break;
    const need = Math.min(PAGE, maxJobs - all.length);
    const to = from + need - 1;

    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_number, description, customer_id, location_id, scheduled_start')
      .not('customer_id', 'is', null)
      .is('location_id', null)
      .ilike('description', '%[AIFM:%')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error(`Fetch failed: ${error.message}`);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < need) break;
    from += need;
  }

  const total = all.length;
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < all.length; i++) {
    const job = all[i];
    onJob?.(i, total, job);

    try {
      const { data: cust } = await supabase
        .from('customer')
        .select('id, customer_code, customer_name')
        .eq('id', job.customer_id)
        .is('deleted_at', null)
        .maybeSingle();

      if (!cust?.id) {
        skipped++;
        continue;
      }

      const addr = await getServiceAddressFromAifmJobDescription(job.description, job.scheduled_start);
      if (!addr) {
        skipped++;
        log(
          `↷ ${job.job_number} — AIFM: no address (token/auth, job not in list window, or no inline/service_locations row — pnpm run test:aifm-location)`
        );
        continue;
      }

      const location = await resolveLocation(cust.id, addr, supabase);
      if (!location) {
        skipped++;
        continue;
      }

      const { error: uErr } = await supabase
        .from('jobs')
        .update({
          location_id: location.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      if (uErr) throw new Error(uErr.message);

      const { data: sched } = await supabase
        .from('job_schedule')
        .select('id, address')
        .eq('job_id', job.id)
        .limit(1)
        .maybeSingle();

      if (sched?.id && !(sched.address || '').trim()) {
        await supabase.from('job_schedule').update({ address: addr }).eq('id', sched.id);
      } else if (!sched?.id) {
        await supabase.from('job_schedule').insert({ job_id: job.id, address: addr });
      }

      updated++;
      log(`✓ ${job.job_number} → location from AIFM API`);
    } catch (e) {
      failed++;
      log(`✗ ${job.job_number} ${e.message}`);
      onError?.({ job, error: e.message });
    }
  }

  return { updated, failed, skipped, total };
}
