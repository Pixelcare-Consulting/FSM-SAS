import { requireSession } from '../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import {
  migratePlainTemplateBodyToHtml,
  sanitizeEmailTemplateHtml,
} from '../../../lib/email/emailTemplatesShared';
import { ensureEmailTemplateRegistrySeeded } from '../../../lib/email/templateRegistry';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
} from '../../../lib/services/auditLog';

function isAdmin(session) {
  return session?.user?.role === 'ADMIN';
}

const ALLOWED_SCOPES = new Set(['customer', 'customer_location']);

/**
 * GET  — ?templateId=&scopeType=&scopeId=
 * POST — create/update override
 * DELETE — ?id=
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
    const templateId = req.query?.templateId ? String(req.query.templateId) : '';
    const scopeType = req.query?.scopeType ? String(req.query.scopeType) : '';
    const scopeId = req.query?.scopeId ? String(req.query.scopeId) : '';

    let q = supabase.from('email_template_overrides').select('*').order('priority', { ascending: false });

    if (templateId) q = q.eq('template_id', templateId);
    if (scopeType) q = q.eq('scope_type', scopeType);
    if (scopeId) q = q.eq('scope_id', scopeId);

    const { data, error } = await q.limit(50);
    if (error) {
      if (error.code === '42P01') return res.status(200).json({ overrides: [] });
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ overrides: data || [] });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const templateId = body.template_id ? String(body.template_id).trim() : '';
    const scopeType = body.scope_type ? String(body.scope_type).trim() : '';
    const scopeId = body.scope_id ? String(body.scope_id).trim() : '';

    if (!templateId || !scopeType || !scopeId) {
      return res.status(400).json({ error: 'template_id, scope_type, and scope_id are required' });
    }
    if (!ALLOWED_SCOPES.has(scopeType)) {
      return res.status(400).json({ error: 'Invalid scope_type' });
    }

    const subject = typeof body.subject === 'string' ? body.subject.trim() : null;
    const rawBody = typeof body.body_html === 'string' ? body.body_html : typeof body.body === 'string' ? body.body : null;
    const bodyHtml =
      rawBody != null && rawBody.trim()
        ? sanitizeEmailTemplateHtml(migratePlainTemplateBodyToHtml(rawBody))
        : null;

    const { data, error } = await supabase
      .from('email_template_overrides')
      .upsert(
        {
          template_id: templateId,
          scope_type: scopeType,
          scope_id: scopeId,
          subject: subject || null,
          body_html: bodyHtml,
          priority: typeof body.priority === 'number' ? body.priority : 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'template_id,scope_type,scope_id' }
      )
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      category: AUDIT_CATEGORIES.SETTINGS,
      description: 'Email template override saved',
      details: { area: 'email_template_overrides', template_id: templateId, scope_type: scopeType },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(200).json({ override: data });
  }

  if (req.method === 'DELETE') {
    const overrideId = req.query?.id ? String(req.query.id) : '';
    if (!overrideId) {
      return res.status(400).json({ error: 'id is required' });
    }

    const { error } = await supabase.from('email_template_overrides').delete().eq('id', overrideId);
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      category: AUDIT_CATEGORIES.SETTINGS,
      description: 'Email template override deleted',
      details: { area: 'email_template_overrides', override_id: overrideId },
      status: AUDIT_STATUS.SUCCESS,
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
