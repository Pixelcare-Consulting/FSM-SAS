/**
 * AIFM [ADDRESS:…] tag → job_schedule.address + optional locations link.
 * Second pass: AIFM jobs with location_id but empty schedule address → copy locations.location_name.
 * Split from aifmAssignCustomersCore so API routes (Turbopack) resolve a small module graph.
 */

import { extractTag, resolveLocation } from './aifmAssignCustomersCore';

/**
 * AIFM jobs that carry an embedded [ADDRESS:…] tag (written by import-jobs when service_location exists).
 */
export async function fetchAifmJobsWithAddressTag(supabase, maxTotal = 100000) {
  const PAGE = 1000;
  const cap = Math.max(1, Math.min(Number(maxTotal) || 100000, 200000));
  const all = [];
  let from = 0;

  for (;;) {
    if (all.length >= cap) break;
    const need = Math.min(PAGE, cap - all.length);
    const to = from + need - 1;

    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_number, description, customer_id, location_id')
      .is('deleted_at', null)
      .ilike('description', '%[AIFM:%')
      .ilike('description', '%[ADDRESS:%')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (error) throw new Error(`Fetch failed: ${error.message}`);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < need) break;
    from += need;
  }

  return all;
}

/**
 * AIFM-imported jobs that have a linked location (import always sets location when address exists).
 * Used when descriptions have no [ADDRESS:…] yet — copy location_name into empty job_schedule.address.
 */
export async function fetchAifmJobsWithLocationForBackfill(supabase, maxTotal = 100000) {
  const PAGE = 1000;
  const cap = Math.max(1, Math.min(Number(maxTotal) || 100000, 200000));
  const all = [];
  let from = 0;

  for (;;) {
    if (all.length >= cap) break;
    const need = Math.min(PAGE, cap - all.length);
    const to = from + need - 1;

    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_number, description, location_id')
      .is('deleted_at', null)
      .not('location_id', 'is', null)
      .ilike('description', '%[AIFM:%')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (error) throw new Error(`Fetch failed: ${error.message}`);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < need) break;
    from += need;
  }

  return all;
}

/** Copy locations.location_name → job_schedule.address when schedule address is empty (scheduler visibility). */
async function tryBackfillScheduleFromLocation(supabase, jobId) {
  const { data: sched } = await supabase
    .from('job_schedule')
    .select('id, address')
    .eq('job_id', jobId)
    .limit(1)
    .maybeSingle();
  if (!sched?.id) return { updated: false };
  if ((sched.address || '').trim()) return { updated: false };

  const { data: jobRow } = await supabase
    .from('jobs')
    .select('location_id')
    .eq('id', jobId)
    .maybeSingle();
  if (!jobRow?.location_id) return { updated: false };

  const { data: loc } = await supabase
    .from('locations')
    .select('location_name')
    .eq('id', jobRow.location_id)
    .maybeSingle();
  const name = (loc?.location_name || '').trim();
  if (!name) return { updated: false };

  const { error } = await supabase.from('job_schedule').update({ address: name }).eq('id', sched.id);
  if (error) throw new Error(error.message);
  return { updated: true };
}

/**
 * Apply [ADDRESS:…] from job description, then backfill from locations for AIFM jobs without the tag.
 * Idempotent: does not overwrite non-empty schedule address.
 *
 * @returns {Promise<{ updated: number, failed: number, skipped: number, total: number, totalWithAddressTag: number, totalLocationCandidates: number, updatedFromTag: number, updatedFromLocation: number }>}
 */
export async function runAifmAddressSyncPass(supabase, options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {};
  const onJob = typeof options.onJob === 'function' ? options.onJob : null;
  const onError = typeof options.onError === 'function' ? options.onError : null;
  const maxJobs = Math.min(Math.max(Number(options.maxJobs) || 100000, 1), 200000);

  const jobs =
    Array.isArray(options.jobs) && options.jobs.length >= 0
      ? options.jobs
      : await fetchAifmJobsWithAddressTag(supabase, maxJobs);
  const totalWithAddressTag = jobs.length;

  let updatedFromTag = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    onJob?.(i, totalWithAddressTag, job);

    const raw = extractTag(job.description, 'ADDRESS');
    const normalized = raw ? raw.replace(/\s+/g, ' ').trim() : '';
    if (!normalized) {
      skipped++;
      continue;
    }

    try {
      const { data: sched } = await supabase
        .from('job_schedule')
        .select('id, address')
        .eq('job_id', job.id)
        .limit(1)
        .maybeSingle();

      const current = (sched?.address || '').trim();
      if (current.length > 0) {
        skipped++;
        continue;
      }

      if (sched?.id) {
        const { error: uErr } = await supabase
          .from('job_schedule')
          .update({ address: normalized })
          .eq('id', sched.id);
        if (uErr) throw new Error(uErr.message);
      } else {
        const { error: iErr } = await supabase.from('job_schedule').insert({
          job_id: job.id,
          address: normalized,
        });
        if (iErr) throw new Error(iErr.message);
      }

      if (job.customer_id) {
        const location = await resolveLocation(job.customer_id, normalized, supabase);
        if (location) {
          await supabase
            .from('jobs')
            .update({
              location_id: location.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);
        }
      }

      updatedFromTag++;
      log(`✓ ${job.job_number} → address synced from [ADDRESS] tag`);
    } catch (err) {
      failed++;
      log(`✗ ${job.job_number} address sync: ${err.message}`);
      onError?.({ job, error: err.message });
    }
  }

  // ── Pass 2: older AIFM imports without [ADDRESS:…] but with locations.location_name ──
  const locJobs = await fetchAifmJobsWithLocationForBackfill(supabase, maxJobs);
  const totalLocationCandidates = locJobs.length;
  let updatedFromLocation = 0;

  for (let i = 0; i < locJobs.length; i++) {
    const job = locJobs[i];
    onJob?.(totalWithAddressTag + i, totalWithAddressTag + totalLocationCandidates, job);

    try {
      const result = await tryBackfillScheduleFromLocation(supabase, job.id);
      if (result.updated) {
        updatedFromLocation++;
        log(`✓ ${job.job_number} → schedule address from location`);
      }
    } catch (err) {
      failed++;
      log(`✗ ${job.job_number} location→schedule backfill: ${err.message}`);
      onError?.({ job, error: err.message });
    }
  }

  const updated = updatedFromTag + updatedFromLocation;

  return {
    updated,
    failed,
    skipped,
    /** @deprecated use totalWithAddressTag — kept for older callers */
    total: totalWithAddressTag,
    totalWithAddressTag,
    totalLocationCandidates,
    updatedFromTag,
    updatedFromLocation,
  };
}
