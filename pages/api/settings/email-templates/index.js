import { requireSession } from '../../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import {
  migratePlainTemplateBodyToHtml,
  sanitizeEmailTemplateHtml,
} from '../../../../lib/email/emailTemplatesShared';
import {
  ensureEmailTemplateRegistrySeeded,
  listEmailTemplates,
  listTriggerBindings,
  slugifyTemplateName,
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
 * GET  — list templates + trigger bindings
 * POST — create custom template (or duplicate via copyFromId)
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
    const includeArchived = req.query?.includeArchived === 'true';
    const [templates, bindings] = await Promise.all([
      listEmailTemplates(supabase, { includeArchived }),
      listTriggerBindings(supabase),
    ]);
    return res.status(200).json({ templates, bindings });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const copyFromId = body.copyFromId ? String(body.copyFromId).trim() : '';

    if (copyFromId) {
      const { data: source, error: srcErr } = await supabase
        .from('email_templates')
        .select('name, subject, body_html, merge_field_schema')
        .eq('id', copyFromId)
        .is('deleted_at', null)
        .maybeSingle();

      if (srcErr || !source) {
        return res.status(404).json({ error: 'Source template not found' });
      }

      const baseName = `${source.name} (copy)`;
      const slug = `${slugifyTemplateName(baseName)}_${Date.now().toString(36)}`;

      const { data: created, error: insErr } = await supabase
        .from('email_templates')
        .insert({
          slug,
          name: baseName,
          category: 'custom',
          subject: source.subject,
          body_html: source.body_html,
          merge_field_schema: source.merge_field_schema || [],
          is_active: true,
          version: 1,
        })
        .select()
        .single();

      if (insErr) {
        return res.status(500).json({ error: insErr.message });
      }
      void writeAuditLogFromRequest(req, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        category: AUDIT_CATEGORIES.SETTINGS,
        description: 'Email template duplicated',
        details: { area: 'email_templates', template_id: created?.id },
        status: AUDIT_STATUS.SUCCESS,
      });
      return res.status(201).json({ template: created });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const rawBody = typeof body.body_html === 'string' ? body.body_html : typeof body.body === 'string' ? body.body : '';
    const slugInput = body.slug ? String(body.slug).trim() : slugifyTemplateName(name);

    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!subject) return res.status(400).json({ error: 'subject is required' });

    const slug = slugifyTemplateName(slugInput) || `custom_${Date.now().toString(36)}`;
    const bodyHtml = sanitizeEmailTemplateHtml(
      rawBody.trim() ? migratePlainTemplateBodyToHtml(rawBody) : '<p><br></p>'
    );

    const { data: existing } = await supabase
      .from('email_templates')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'slug already exists' });
    }

    const { data: created, error } = await supabase
      .from('email_templates')
      .insert({
        slug,
        name,
        category: 'custom',
        subject,
        body_html: bodyHtml,
        merge_field_schema: Array.isArray(body.merge_field_schema) ? body.merge_field_schema : [],
        is_active: true,
        version: 1,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      category: AUDIT_CATEGORIES.SETTINGS,
      description: 'Email template created',
      details: { area: 'email_templates', template_id: created?.id, slug },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(201).json({ template: created });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
