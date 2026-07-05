import { requireSession } from '../../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import {
  createCustomTrigger,
  deleteCustomTrigger,
  ensureEmailTemplateRegistrySeeded,
  listAllTriggers,
  slugifyTriggerId,
} from '../../../../lib/email/templateRegistry';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
} from '../../../../lib/services/auditLog';

function isAdmin(session) {
  return session?.user?.role === 'ADMIN';
}

/**
 * GET  — list all triggers (system + custom)
 * POST — create custom trigger { label, description?, template_id? }
 * DELETE — ?triggerId=custom.quotation
 */
export default async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return;

  if (!isAdmin(session)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(503).json({ error: 'Server misconfigured' });
  }

  await ensureEmailTemplateRegistrySeeded(supabase);

  if (req.method === 'GET') {
    const triggers = await listAllTriggers(supabase);
    return res.status(200).json({ triggers });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!label) {
      return res.status(400).json({ error: 'label is required' });
    }

    const previewId = slugifyTriggerId(label);
    const result = await createCustomTrigger(supabase, {
      label,
      description: body.description,
      template_id: body.template_id,
    });

    if (!result.ok) {
      const status = /not available/i.test(result.error || '') ? 503 : 400;
      return res.status(status).json({ error: result.error });
    }

    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      category: AUDIT_CATEGORIES.SETTINGS,
      description: 'Custom email trigger created',
      details: { area: 'email_triggers', trigger_id: result.trigger?.trigger_id },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(201).json({ trigger: result.trigger, previewId });
  }

  if (req.method === 'DELETE') {
    const triggerId = req.query?.triggerId ? String(req.query.triggerId).trim() : '';
    if (!triggerId) {
      return res.status(400).json({ error: 'triggerId query param is required' });
    }

    const result = await deleteCustomTrigger(supabase, triggerId);
    if (!result.ok) {
      const status = /not found/i.test(result.error || '') ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }

    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      category: AUDIT_CATEGORIES.SETTINGS,
      description: 'Custom email trigger deleted',
      details: { area: 'email_triggers', trigger_id: triggerId },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
