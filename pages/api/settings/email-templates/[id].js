import { requireSession } from '../../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import {
  migratePlainTemplateBodyToHtml,
  sanitizeEmailTemplateHtml,
} from '../../../../lib/email/emailTemplatesShared';
import { ensureEmailTemplateRegistrySeeded } from '../../../../lib/email/templateRegistry';
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
 * PATCH — update template (saves version snapshot)
 * DELETE — soft-archive custom template
 */
export default async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return;

  if (!isAdmin(session)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const id = req.query?.id;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'id is required' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(503).json({ error: 'Server misconfigured' });
  }

  await ensureEmailTemplateRegistrySeeded(supabase);

  const { data: existing, error: fetchErr } = await supabase
    .from('email_templates')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchErr) {
    return res.status(500).json({ error: fetchErr.message });
  }
  if (!existing) {
    return res.status(404).json({ error: 'Template not found' });
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    const nextVersion = (existing.version || 1) + 1;

    try {
      const { error: verErr } = await supabase.from('email_template_versions').insert({
        template_id: existing.id,
        version: existing.version || 1,
        subject: existing.subject,
        body_html: existing.body_html,
      });
      if (verErr && verErr.code !== '42P01') {
        console.warn('[email-templates PATCH] version snapshot', verErr.message);
      }
    } catch (verErr) {
      console.warn('[email-templates PATCH] version snapshot', verErr?.message);
    }

    /** @type {Record<string, unknown>} */
    const patch = {
      updated_at: new Date().toISOString(),
      version: nextVersion,
    };

    if (typeof body.name === 'string' && body.name.trim()) {
      patch.name = body.name.trim();
    }
    if (typeof body.subject === 'string') {
      patch.subject = body.subject.trim();
    }
    if (typeof body.body_html === 'string' || typeof body.body === 'string') {
      const raw = typeof body.body_html === 'string' ? body.body_html : body.body;
      patch.body_html = sanitizeEmailTemplateHtml(migratePlainTemplateBodyToHtml(raw));
    }
    if (typeof body.is_active === 'boolean') {
      patch.is_active = body.is_active;
    }
    if (Array.isArray(body.merge_field_schema)) {
      patch.merge_field_schema = body.merge_field_schema;
    }

    const { data: updated, error } = await supabase
      .from('email_templates')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      category: AUDIT_CATEGORIES.SETTINGS,
      description: 'Email template updated',
      details: { area: 'email_templates', template_id: id },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(200).json({ template: updated });
  }

  if (req.method === 'DELETE') {
    if (existing.category === 'system') {
      return res.status(400).json({ error: 'System templates cannot be archived' });
    }

    const { data: archived, error } = await supabase
      .from('email_templates')
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      category: AUDIT_CATEGORIES.SETTINGS,
      description: 'Email template archived',
      details: { area: 'email_templates', template_id: id },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(200).json({ template: archived });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
