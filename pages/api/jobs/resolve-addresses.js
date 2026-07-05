/**
 * POST /api/jobs/resolve-addresses
 * Body: { jobIds: string[] }
 *
 * Resolves missing job addresses from DB fallbacks, then AIFM API when [AIFM:] is present.
 * Persists discovered addresses to job_schedule (+ location link when possible).
 */

import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { requireSession } from '../../../lib/auth/requireSession';
import { getServiceAddressFromAifmJobDescription } from '../../../lib/integrations/aifmJobLocationFromApi';
import { resolveLocation } from '../../../lib/integrations/aifmAssignCustomersCore';
import {
  resolveJobDisplayAddress,
} from '../../../lib/jobs/resolveJobDisplayAddress';

async function upsertScheduleAddress(supabase, jobId, address) {
  const normalized = String(address || '').trim();
  if (!normalized) return;

  const { data: sched } = await supabase
    .from('job_schedule')
    .select('id, address')
    .eq('job_id', jobId)
    .limit(1)
    .maybeSingle();

  if (sched?.id) {
    if ((sched.address || '').trim()) return;
    await supabase.from('job_schedule').update({ address: normalized }).eq('id', sched.id);
    return;
  }

  await supabase.from('job_schedule').insert({ job_id: jobId, address: normalized });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const jobIds = Array.isArray(req.body?.jobIds)
    ? [...new Set(req.body.jobIds.map((id) => String(id).trim()).filter(Boolean))]
    : [];

  if (jobIds.length === 0) {
    return res.status(400).json({ success: false, error: 'jobIds array is required' });
  }

  if (jobIds.length > 100) {
    return res.status(400).json({ success: false, error: 'Maximum 100 job IDs per request' });
  }

  const supabase = getSupabaseAdmin();
  const addresses = {};
  const enrichedFromAifm = [];

  try {
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select(`
        id,
        job_number,
        description,
        customer_id,
        location_id,
        scheduled_start,
        location:location_id(location_name, id)
      `)
      .in('id', jobIds)
      .is('deleted_at', null);

    if (jobsError) {
      return res.status(500).json({ success: false, error: jobsError.message });
    }

    const { data: scheduleRows } = await supabase
      .from('job_schedule')
      .select('job_id, address')
      .in('job_id', jobIds);

    const scheduleByJobId = {};
    for (const row of scheduleRows || []) {
      if (row.job_id && row.address && !scheduleByJobId[row.job_id]) {
        scheduleByJobId[row.job_id] = row.address;
      }
    }

    const customerIds = [...new Set((jobs || []).map((j) => j.customer_id).filter(Boolean))];
    const customerLocationsByCustomerId = {};

    if (customerIds.length > 0) {
      const { data: locRows } = await supabase
        .from('customer_location')
        .select('*')
        .in('customer_id', customerIds)
        .order('site_id', { ascending: true });

      for (const row of locRows || []) {
        if (!customerLocationsByCustomerId[row.customer_id]) {
          customerLocationsByCustomerId[row.customer_id] = [];
        }
        customerLocationsByCustomerId[row.customer_id].push(row);
      }
    }

    const needsAifm = [];

    for (const job of jobs || []) {
      const customerLocations = customerLocationsByCustomerId[job.customer_id] || [];
      const resolved = resolveJobDisplayAddress(job, {
        scheduleAddress: scheduleByJobId[job.id],
        customerLocations,
      });

      if (resolved) {
        addresses[job.id] = resolved;
        continue;
      }

      if (/\[AIFM:[^\]]+\]/.test(job.description || '')) {
        needsAifm.push(job);
      }
    }

    for (const job of needsAifm) {
      try {
        const addr = await getServiceAddressFromAifmJobDescription(
          job.description,
          job.scheduled_start
        );
        if (!addr) continue;

        addresses[job.id] = addr;
        enrichedFromAifm.push(job.id);
        await upsertScheduleAddress(supabase, job.id, addr);

        if (job.customer_id) {
          const location = await resolveLocation(job.customer_id, addr, supabase);
          if (location?.id && !job.location_id) {
            await supabase
              .from('jobs')
              .update({
                location_id: location.id,
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.id);
          }
        }
      } catch (err) {
        console.warn(`[resolve-addresses] AIFM lookup failed for ${job.job_number}:`, err.message);
      }
    }

    return res.status(200).json({
      success: true,
      addresses,
      enrichedFromAifm,
    });
  } catch (err) {
    console.error('[resolve-addresses]', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to resolve addresses',
    });
  }
}
