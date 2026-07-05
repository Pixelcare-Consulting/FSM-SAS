/**
 * AIFM → DB: Job address sync only (SSE)
 *
 * POST (no body required)
 *
 * Fills empty job_schedule.address from [ADDRESS:…] tags, then from locations.location_name
 * when the job has [AIFM:] + location_id (older imports without the tag). See aifmAddressSyncPass.js.
 */

import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { requireSession } from '../../../../lib/auth/requireSession';
import { runAifmAddressSyncPass } from '../../../../lib/integrations/aifmAddressSyncPass';
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

  const tag = '[aifm/sync-address]';
  const log = (...args) => console.log(tag, ...args);

  const supabase = getSupabaseAdmin();

  try {
    send({
      type: 'step',
      phase: 'start',
      message: 'Syncing addresses: [ADDRESS] tags first, then location names where schedule is empty…',
    });

    const summary = await runAifmAddressSyncPass(supabase, {
      maxJobs: 100000,
      log,
      onJob: (idx, totalT, job) => {
        send({
          type: 'progress',
          current: idx + 1,
          total: totalT,
          message: `(${idx + 1}/${totalT}) ${job.job_number}…`,
        });
      },
      onError: ({ job, error }) => {
        send({ type: 'addressError', jobNumber: job.job_number, error });
      },
    });

    log(`DONE — ${JSON.stringify(summary)}`);
    const uTag = summary.updatedFromTag ?? 0;
    const uLoc = summary.updatedFromLocation ?? 0;
    const head = `Done. ${summary.updated} schedule row(s) updated`;
    const tail =
      uTag || uLoc ? ` (${uTag} from [ADDRESS] tags, ${uLoc} from stored location).` : '.';
    const doneMessage = [
        head + tail,
        summary.skipped > 0 ? `${summary.skipped} skipped in tag pass.` : '',
        summary.failed > 0 ? `${summary.failed} failed.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    send({
      type: 'done',
      ...summary,
      message: doneMessage,
    });
    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.AIFM_SYNC_ADDRESS,
      category: AUDIT_CATEGORIES.MIGRATION,
      description: doneMessage,
      details: summary,
      status: summary.failed > 0 ? AUDIT_STATUS.WARNING : AUDIT_STATUS.SUCCESS,
    });
    res.end();
  } catch (err) {
    log('FATAL:', err.message);
    send({ type: 'error', error: err?.message || 'Address sync failed' });
    res.end();
  }
}
