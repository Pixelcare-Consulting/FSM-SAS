/**
 * POST /api/cron/follow-up-due-emails
 *
 * Stub for scheduled follow-up reminder emails (trigger: follow_up.due).
 * Wire to external cron (e.g. Vercel cron, pg_cron) with CRON_SECRET header.
 *
 * Full implementation would:
 * 1. Query follow_ups where due_date <= today and reminder not sent
 * 2. dispatchTransactionalEmail({ triggerId: 'follow_up.due', ... })
 * 3. Mark follow-up as email_reminder_sent
 */
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { ensureEmailTemplateRegistrySeeded } from '../../../lib/email/templateRegistry';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-cron-secret'];

  if (cronSecret && token !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(503).json({ error: 'Server misconfigured' });
  }

  await ensureEmailTemplateRegistrySeeded(supabase);

  return res.status(200).json({
    ok: true,
    stub: true,
    message:
      'follow_up.due cron stub — enable follow_up.due trigger binding and implement follow-up query + dispatchTransactionalEmail',
    triggerId: 'follow_up.due',
  });
}
