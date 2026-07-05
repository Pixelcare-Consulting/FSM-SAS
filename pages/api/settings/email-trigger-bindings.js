import { requireSession } from '../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import {
  ensureEmailTemplateRegistrySeeded,
  listTriggerBindings,
  triggerExists,
} from '../../../lib/email/templateRegistry';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
} from '../../../lib/services/auditLog';

function isAdmin(session) {
  return session?.user?.role === 'ADMIN';
}

/**
 * GET — list trigger bindings
 * PUT — batch update { bindings: [{ trigger_id, template_id, enabled }] }
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
    const bindings = await listTriggerBindings(supabase);
    return res.status(200).json({ bindings });
  }

  if (req.method === 'PUT') {
    const bindings = req.body?.bindings;
    if (!Array.isArray(bindings)) {
      return res.status(400).json({ error: 'bindings array is required' });
    }

    const results = [];
    for (const row of bindings) {
      const triggerId = row?.trigger_id ? String(row.trigger_id).trim() : '';
      if (!triggerId) continue;

      const known = await triggerExists(supabase, triggerId);
      if (!known) {
        results.push({ trigger_id: triggerId, ok: false, error: 'Unknown trigger' });
        continue;
      }

      const templateId = row.template_id ? String(row.template_id).trim() : null;
      const enabled = row.enabled !== false;

      const { error } = await supabase.from('email_trigger_bindings').upsert(
        {
          trigger_id: triggerId,
          template_id: templateId || null,
          enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'trigger_id' }
      );

      results.push({ trigger_id: triggerId, ok: !error, error: error?.message });
    }

    const updated = await listTriggerBindings(supabase);
    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      category: AUDIT_CATEGORIES.SETTINGS,
      description: 'Email trigger bindings updated',
      details: { area: 'email_trigger_bindings', count: results.length },
      status: AUDIT_STATUS.SUCCESS,
    });
    return res.status(200).json({ results, bindings: updated });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
