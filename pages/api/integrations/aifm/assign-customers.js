/**
 * AIFM → DB: Retroactive Customer + Location Assignment  (SSE)
 *
 * POST  (no body required)
 *
 * 1) Sync [ADDRESS:…] tags into empty job_schedule.address (all AIFM jobs with the tag).
 * 2) Finds every AIFM-imported job where customer_id IS NULL, reads the
 * [CUSTOMER:<name>] tag embedded by import-jobs.js, then matches via
 * lib/integrations/aifmAssignCustomersCore.js (Supabase masterlist/local DB only).
 *    When tags/DB have no address, optional AIFM Open API (AIFM_API_TOKEN) can fill
 *    service_location from the remote job by [AIFM:<id>].
 * 3) Jobs that already have customer_id but no location_id: same AIFM API path to
 *    create/link locations + job_schedule.address (runAifmLinkedJobsLocationEnrichmentPass).
 *
 * Run after importing the Supabase masterlist so the local DB has current customer data.
 */

import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { requireSession } from '../../../../lib/auth/requireSession';
import { runAifmAddressSyncPass } from '../../../../lib/integrations/aifmAddressSyncPass';
import { runAifmLinkedJobsLocationEnrichmentPass } from '../../../../lib/integrations/aifmLinkedLocationEnrichment';
import {
  fetchUnassignedAifmJobs,
  runAifmCustomerAssignmentPass,
} from '../../../../lib/integrations/aifmAssignCustomersCore';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
} from '../../../../lib/services/auditLog';

export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const send = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  try {
    res.socket?.setNoDelay(true);
  } catch (_) {}

  const tag = '[aifm/assign-customers]';
  const log = (...args) => console.log(tag, ...args);

  const supabase = getSupabaseAdmin();

  try {
    send({ type: 'step', phase: 'address', message: 'Syncing AIFM addresses from [ADDRESS] tags…' });
    const addressSummary = await runAifmAddressSyncPass(supabase, {
      maxJobs: 100000,
      log,
      onJob: (i, totalT, job) => {
        send({
          type: 'progress',
          phase: 'address',
          current: i + 1,
          total: totalT,
          message: `(address ${i + 1}/${totalT}) ${job.job_number}…`,
        });
      },
      onError: ({ job, error }) => {
        send({ type: 'addressError', jobNumber: job.job_number, error });
      },
    });
    send({
      type: 'step',
      phase: 'address',
      message: `Address sync: ${addressSummary.updated} updated (${addressSummary.updatedFromTag ?? 0} tag / ${addressSummary.updatedFromLocation ?? 0} location), ${addressSummary.skipped} skipped, ${addressSummary.failed} failed; ${addressSummary.totalWithAddressTag ?? addressSummary.total} with [ADDRESS] tag, ${addressSummary.totalLocationCandidates ?? 0} location candidates.`,
      addressSync: addressSummary,
    });

    send({ type: 'step', phase: 'fetch', message: 'Fetching unassigned AIFM jobs…' });

    const unassigned = await fetchUnassignedAifmJobs(supabase, 100000);
    const totalUnassigned = unassigned.length;
    log(`Found ${totalUnassigned} unassigned AIFM job(s)`);
    send({
      type: 'step',
      phase: 'fetch',
      message: `Found ${totalUnassigned} unassigned AIFM job(s).`,
      total: totalUnassigned,
    });

    let assignmentSummary = {
      matched: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
      total: 0,
    };

    if (totalUnassigned > 0) {
      assignmentSummary = await runAifmCustomerAssignmentPass(supabase, {
        jobs: unassigned,
        sapCookies: null,
        log,
        onJob: (i, totalT, job) => {
          send({
            type: 'progress',
            phase: 'assign',
            current: i + 1,
            total: totalT,
            message: `(${i + 1}/${totalT}) ${job.job_number}…`,
          });
        },
        onMatch: ({ job, customer, location }) => {
          send({
            type: 'match',
            jobNumber: job.job_number,
            customerName: customer.customer_name,
            customerCode: customer.customer_code,
            hasLocation: !!location,
          });
        },
        onError: ({ job, error }) => {
          send({ type: 'matchError', jobNumber: job.job_number, error });
        },
      });
    } else {
      send({
        type: 'step',
        phase: 'assign',
        message: 'All AIFM jobs already have customers assigned.',
      });
    }

    send({
      type: 'step',
      phase: 'linkedLocation',
      message:
        'Filling locations from AIFM API for jobs that have a customer but no location (needs AIFM_API_TOKEN)…',
    });
    const linkedLocationEnrichment = await runAifmLinkedJobsLocationEnrichmentPass(supabase, {
      maxJobs: 100000,
      log,
      onJob: (i, totalT, job) => {
        send({
          type: 'progress',
          phase: 'linkedLocation',
          current: i + 1,
          total: totalT,
          message: `(location ${i + 1}/${totalT}) ${job.job_number}…`,
        });
      },
      onError: ({ job, error }) => {
        send({ type: 'linkedLocationError', jobNumber: job.job_number, error });
      },
    });

    log(`DONE — assign ${JSON.stringify(assignmentSummary)} linked ${JSON.stringify(linkedLocationEnrichment)}`);

    const parts = [
      `Customer assign: ${assignmentSummary.updated} updated of ${assignmentSummary.total} (${assignmentSummary.skipped} skipped, ${assignmentSummary.failed} failed).`,
      `AIFM location backfill: ${linkedLocationEnrichment.updated} updated (${linkedLocationEnrichment.skipped} skipped, ${linkedLocationEnrichment.failed} failed).`,
    ];
    const message = parts.join(' ');

    send({
      type: 'done',
      ...assignmentSummary,
      addressSync: addressSummary,
      linkedLocationEnrichment,
      message,
    });
    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.AIFM_ASSIGN_CUSTOMERS,
      category: AUDIT_CATEGORIES.MIGRATION,
      description: message,
      details: {
        assignment: assignmentSummary,
        addressSync: addressSummary,
        linkedLocationEnrichment,
      },
      status: assignmentSummary.failed > 0 ? AUDIT_STATUS.WARNING : AUDIT_STATUS.SUCCESS,
    });
    res.end();
  } catch (err) {
    log('FATAL:', err.message);
    send({ type: 'error', error: err?.message || 'Assignment failed' });
    res.end();
  }
}
