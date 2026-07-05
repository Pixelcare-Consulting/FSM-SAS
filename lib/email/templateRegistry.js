/**
 * Email template registry — dual-read from DB + legacy settings.emailSettings fallback.
 * Import only from API routes — not from client components.
 */

import {
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_TEMPLATE_KEYS,
  migratePlainTemplateBodyToHtml,
  normalizeEmailTemplates,
} from './emailTemplatesShared';
import { loadEmailSettingsFromDb } from './loadEmailSettings';

/** @type {Record<string, string>} */
export const LEGACY_KEY_TO_TRIGGER = {
  jobAssigned: 'job.assigned',
  jobCompleted: 'job.completed',
  followUpReminder: 'follow_up.created',
};

/** @type {Record<string, string>} */
export const TRIGGER_TO_LEGACY_KEY = Object.fromEntries(
  Object.entries(LEGACY_KEY_TO_TRIGGER).map(([k, v]) => [v, k])
);

/** @type {Record<string, string>} */
export const TRIGGER_TO_DEFAULT_SLUG = {
  'job.assigned': 'job_assigned',
  'job.completed': 'job_completed',
  'follow_up.created': 'follow_up_reminder',
  'follow_up.due': 'follow_up_reminder',
};

/** @type {Record<string, 'sendJobAssigned' | 'sendJobCompleted' | 'sendFollowUpReminder'>} */
export const TRIGGER_TO_TOGGLE_FIELD = {
  'job.assigned': 'sendJobAssigned',
  'job.completed': 'sendJobCompleted',
  'follow_up.created': 'sendFollowUpReminder',
  'follow_up.due': 'sendFollowUpReminder',
};

export const KNOWN_TRIGGERS = [
  { triggerId: 'job.assigned', label: 'Job assigned', legacyKey: 'jobAssigned' },
  { triggerId: 'job.completed', label: 'Job completed', legacyKey: 'jobCompleted' },
  { triggerId: 'follow_up.created', label: 'Follow-up created', legacyKey: 'followUpReminder' },
  { triggerId: 'follow_up.due', label: 'Follow-up due (scheduled)', legacyKey: 'followUpReminder' },
];

/**
 * @param {string} slug
 */
export function slugifyTemplateName(slug) {
  return String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} table
 */
async function tableMissing(supabase, table) {
  const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (!error) return false;
  const msg = error.message || '';
  if (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /could not find the table/i.test(msg) ||
    (/relation/i.test(msg) && /does not exist/i.test(msg) && !/column/i.test(msg))
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} label
 * @returns {string}
 */
export function slugifyTriggerId(label) {
  const slug = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, 58);
  if (!slug) return '';
  return `custom.${slug}`;
}

/**
 * @param {string} triggerId
 */
export function isKnownSystemTrigger(triggerId) {
  return KNOWN_TRIGGERS.some((t) => t.triggerId === triggerId);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function listAllTriggers(supabase) {
  const system = KNOWN_TRIGGERS.map((t, i) => ({
    trigger_id: t.triggerId,
    label: t.label,
    description: null,
    is_system: true,
    legacy_key: t.legacyKey,
    sort_order: (i + 1) * 10,
  }));

  if (await tableMissing(supabase, 'email_triggers')) {
    return system;
  }

  const { data, error } = await supabase
    .from('email_triggers')
    .select('trigger_id, label, description, is_system, sort_order')
    .eq('is_system', false)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (error) {
    console.warn('[listAllTriggers]', error.message);
    return system;
  }

  const custom = (data || []).map((row) => ({
    trigger_id: row.trigger_id,
    label: row.label,
    description: row.description || null,
    is_system: false,
    legacy_key: null,
    sort_order: row.sort_order ?? 100,
  }));

  return [...system, ...custom];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} triggerId
 */
export async function triggerExists(supabase, triggerId) {
  if (isKnownSystemTrigger(triggerId)) return true;
  if (await tableMissing(supabase, 'email_triggers')) return false;
  const { data } = await supabase
    .from('email_triggers')
    .select('trigger_id')
    .eq('trigger_id', triggerId)
    .maybeSingle();
  return !!data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ label: string, description?: string, template_id?: string }} opts
 */
export async function createCustomTrigger(supabase, opts) {
  const label = typeof opts.label === 'string' ? opts.label.trim() : '';
  if (!label) {
    return { ok: false, error: 'label is required' };
  }

  if (await tableMissing(supabase, 'email_triggers')) {
    return { ok: false, error: 'email_triggers table not available — run migration' };
  }

  let triggerId = slugifyTriggerId(label);
  if (!triggerId || triggerId === 'custom.') {
    return { ok: false, error: 'Could not generate trigger ID from label' };
  }

  if (isKnownSystemTrigger(triggerId)) {
    return { ok: false, error: 'Trigger ID conflicts with a system event' };
  }

  const { data: existing } = await supabase
    .from('email_triggers')
    .select('trigger_id')
    .eq('trigger_id', triggerId)
    .maybeSingle();

  if (existing) {
    const base = slugifyTriggerId(label);
    let suffix = 2;
    let candidate = `${base}_${suffix}`;
    while (suffix < 100) {
      const { data: dup } = await supabase
        .from('email_triggers')
        .select('trigger_id')
        .eq('trigger_id', candidate)
        .maybeSingle();
      if (!dup) {
        triggerId = candidate;
        break;
      }
      suffix += 1;
      candidate = `${base}_${suffix}`;
    }
    if (suffix >= 100) {
      return { ok: false, error: 'Could not find unique trigger ID' };
    }
  }

  const description = typeof opts.description === 'string' ? opts.description.trim() : null;
  const templateId = opts.template_id ? String(opts.template_id).trim() : null;

  const { data: trigger, error: insErr } = await supabase
    .from('email_triggers')
    .insert({
      trigger_id: triggerId,
      label,
      description: description || null,
      is_system: false,
      sort_order: 100,
    })
    .select()
    .single();

  if (insErr) {
    return { ok: false, error: insErr.message };
  }

  const { error: bindErr } = await supabase.from('email_trigger_bindings').upsert(
    {
      trigger_id: triggerId,
      template_id: templateId || null,
      enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'trigger_id' }
  );

  if (bindErr) {
    console.warn('[createCustomTrigger] binding', bindErr.message);
  }

  return { ok: true, trigger };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} triggerId
 */
export async function deleteCustomTrigger(supabase, triggerId) {
  const id = String(triggerId || '').trim();
  if (!id) return { ok: false, error: 'triggerId is required' };
  if (isKnownSystemTrigger(id)) {
    return { ok: false, error: 'Cannot delete system events' };
  }
  if (!id.startsWith('custom.')) {
    return { ok: false, error: 'Only custom.* triggers can be deleted' };
  }

  if (await tableMissing(supabase, 'email_triggers')) {
    return { ok: false, error: 'email_triggers table not available' };
  }

  const { data: row } = await supabase
    .from('email_triggers')
    .select('trigger_id, is_system')
    .eq('trigger_id', id)
    .maybeSingle();

  if (!row) return { ok: false, error: 'Trigger not found' };
  if (row.is_system) return { ok: false, error: 'Cannot delete system events' };

  await supabase.from('email_trigger_bindings').delete().eq('trigger_id', id);

  const { error } = await supabase.from('email_triggers').delete().eq('trigger_id', id);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

let seedDone = false;
/** @type {Promise<void> | null} */
let seedPromise = null;

/**
 * Seed registry from legacy settings on first use (idempotent).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function ensureEmailTemplateRegistrySeeded(supabase) {
  if (seedDone) return;
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    if (await tableMissing(supabase, 'email_templates')) {
      seedDone = true;
      return;
    }

    const { count, error: countErr } = await supabase
      .from('email_templates')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);

    if (countErr) {
      console.warn('[ensureEmailTemplateRegistrySeeded] count', countErr.message);
      seedDone = true;
      return;
    }

    if ((count || 0) > 0) {
      await syncLegacySettingsIntoRegistry(supabase);
      seedDone = true;
      return;
    }

    const dbValue = await loadEmailSettingsFromDb(supabase);
    const legacyTemplates = normalizeEmailTemplates(dbValue.emailTemplates);

    for (const legacyKey of EMAIL_TEMPLATE_KEYS) {
      const slug =
        legacyKey === 'jobAssigned'
          ? 'job_assigned'
          : legacyKey === 'jobCompleted'
            ? 'job_completed'
            : 'follow_up_reminder';
      const chunk = legacyTemplates[legacyKey];
      const def = DEFAULT_EMAIL_TEMPLATES[legacyKey];
      const subject = chunk?.subject || def.subject;
      const body = migratePlainTemplateBodyToHtml(chunk?.body || def.body);

      const { data: inserted, error: insErr } = await supabase
        .from('email_templates')
        .upsert(
          {
            slug,
            name: def.subject.split('{{')[0].trim() || slug,
            category: 'system',
            legacy_key: legacyKey,
            subject,
            body_html: body,
            is_active: true,
            version: 1,
          },
          { onConflict: 'slug' }
        )
        .select('id, slug, legacy_key')
        .maybeSingle();

      if (insErr) {
        console.warn('[ensureEmailTemplateRegistrySeeded] insert', slug, insErr.message);
        continue;
      }

      const templateId = inserted?.id;
      if (!templateId) continue;

      const triggerId = LEGACY_KEY_TO_TRIGGER[legacyKey];
      if (triggerId) {
        const toggleField = TRIGGER_TO_TOGGLE_FIELD[triggerId];
        const enabled = dbValue[toggleField] !== false && dbValue[toggleField] !== 'false' && dbValue[toggleField] !== 0;
        await supabase.from('email_trigger_bindings').upsert(
          { trigger_id: triggerId, template_id: templateId, enabled },
          { onConflict: 'trigger_id' }
        );
      }
    }

    const followDueSlug = 'follow_up_reminder';
    const { data: fuTpl } = await supabase
      .from('email_templates')
      .select('id')
      .eq('slug', followDueSlug)
      .maybeSingle();
    if (fuTpl?.id) {
      await supabase.from('email_trigger_bindings').upsert(
        { trigger_id: 'follow_up.due', template_id: fuTpl.id, enabled: false },
        { onConflict: 'trigger_id' }
      );
    }

    seedDone = true;
  })().finally(() => {
    seedPromise = null;
  });

  return seedPromise;
}

/**
 * Copy customized copy from settings into system template rows when DB still has defaults.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function syncLegacySettingsIntoRegistry(supabase) {
  const dbValue = await loadEmailSettingsFromDb(supabase);
  const legacyTemplates = normalizeEmailTemplates(dbValue.emailTemplates);

  for (const legacyKey of EMAIL_TEMPLATE_KEYS) {
    const triggerId = LEGACY_KEY_TO_TRIGGER[legacyKey];
    if (!triggerId) continue;

    const toggleField = TRIGGER_TO_TOGGLE_FIELD[triggerId];
    const enabled = dbValue[toggleField] !== false && dbValue[toggleField] !== 'false' && dbValue[toggleField] !== 0;

    const { data: tpl } = await supabase
      .from('email_templates')
      .select('id, subject, body_html')
      .eq('legacy_key', legacyKey)
      .is('deleted_at', null)
      .maybeSingle();

    if (tpl?.id) {
      await supabase
        .from('email_trigger_bindings')
        .upsert({ trigger_id: triggerId, template_id: tpl.id, enabled }, { onConflict: 'trigger_id' });
    }
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} triggerId
 * @param {Record<string, unknown>} mergedSettings
 */
async function isTriggerEnabled(supabase, triggerId, mergedSettings) {
  if (await tableMissing(supabase, 'email_trigger_bindings')) {
    const legacyKey = TRIGGER_TO_LEGACY_KEY[triggerId];
    const toggleField = legacyKey ? TRIGGER_TO_TOGGLE_FIELD[triggerId] : null;
    if (!toggleField) return true;
    const v = mergedSettings[toggleField];
    if (triggerId === 'follow_up.created' || triggerId === 'follow_up.due') {
      return v === true || v === 'true' || v === 1;
    }
    return v !== false && v !== 'false' && v !== 0;
  }

  const { data: binding } = await supabase
    .from('email_trigger_bindings')
    .select('enabled')
    .eq('trigger_id', triggerId)
    .maybeSingle();

  if (binding && typeof binding.enabled === 'boolean') {
    return binding.enabled;
  }

  const legacyKey = TRIGGER_TO_LEGACY_KEY[triggerId];
  const toggleField = legacyKey ? TRIGGER_TO_TOGGLE_FIELD[triggerId] : null;
  if (!toggleField) return true;
  const v = mergedSettings[toggleField];
  if (triggerId === 'follow_up.created' || triggerId === 'follow_up.due') {
    return v === true || v === 'true' || v === 1;
  }
  return v !== false && v !== 'false' && v !== 0;
}

/**
 * @typedef {{ subject: string, body: string, templateId?: string, slug?: string, legacyKey?: string }} ResolvedTemplateContent
 */

/**
 * Resolve template content for a trigger (DB → legacy settings fallback).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} triggerId
 * @param {object} [opts]
 * @param {Record<string, unknown>} [opts.mergedSettings]
 * @param {{ customerId?: string, customerLocationId?: string }} [opts.scope]
 */
export async function resolveTemplateForTrigger(supabase, triggerId, opts = {}) {
  const mergedSettings = opts.mergedSettings && typeof opts.mergedSettings === 'object' ? opts.mergedSettings : {};
  const scope = opts.scope || {};

  await ensureEmailTemplateRegistrySeeded(supabase);

  const enabled = await isTriggerEnabled(supabase, triggerId, mergedSettings);
  const legacyKey = TRIGGER_TO_LEGACY_KEY[triggerId] || null;

  /** @type {ResolvedTemplateContent | null} */
  let content = null;
  /** @type {string | null} */
  let templateId = null;
  /** @type {string | null} */
  let slug = null;

  if (!(await tableMissing(supabase, 'email_templates'))) {
    const { data: binding } = await supabase
      .from('email_trigger_bindings')
      .select('template_id, email_templates:template_id ( id, slug, legacy_key, subject, body_html, is_active, deleted_at )')
      .eq('trigger_id', triggerId)
      .maybeSingle();

    const tpl = binding?.email_templates;
    if (tpl && tpl.is_active !== false && !tpl.deleted_at) {
      templateId = tpl.id;
      slug = tpl.slug;
      let subject = String(tpl.subject || '');
      let body = String(tpl.body_html || '');

      const override = await resolveTemplateOverride(supabase, tpl.id, scope);
      if (override) {
        if (override.subject) subject = override.subject;
        if (override.body_html) body = override.body_html;
      }

      content = {
        subject,
        body,
        templateId: tpl.id,
        slug: tpl.slug,
        legacyKey: tpl.legacy_key || legacyKey || undefined,
      };
    }
  }

  if (!content && legacyKey) {
    const legacy = normalizeEmailTemplates(mergedSettings.emailTemplates)[legacyKey];
    content = {
      subject: legacy.subject,
      body: migratePlainTemplateBodyToHtml(legacy.body),
      legacyKey,
      slug: TRIGGER_TO_DEFAULT_SLUG[triggerId],
    };
  }

  if (!content) {
    const defaultSlug = TRIGGER_TO_DEFAULT_SLUG[triggerId];
    if (legacyKey && DEFAULT_EMAIL_TEMPLATES[legacyKey]) {
      const d = DEFAULT_EMAIL_TEMPLATES[legacyKey];
      content = {
        subject: d.subject,
        body: migratePlainTemplateBodyToHtml(d.body),
        legacyKey,
        slug: defaultSlug,
      };
    }
  }

  return {
    triggerId,
    enabled,
    content,
    templateId,
    slug,
    legacyKey,
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} templateId
 * @param {{ customerId?: string, customerLocationId?: string }} scope
 */
async function resolveTemplateOverride(supabase, templateId, scope) {
  if (await tableMissing(supabase, 'email_template_overrides')) return null;
  const { customerLocationId, customerId } = scope;

  if (customerLocationId) {
    const { data } = await supabase
      .from('email_template_overrides')
      .select('subject, body_html, priority')
      .eq('template_id', templateId)
      .eq('scope_type', 'customer_location')
      .eq('scope_id', customerLocationId)
      .order('priority', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (customerId) {
    const { data } = await supabase
      .from('email_template_overrides')
      .select('subject, body_html, priority')
      .eq('template_id', templateId)
      .eq('scope_type', 'customer')
      .eq('scope_id', customerId)
      .order('priority', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

/**
 * Resolve by slug or legacy key.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} slugOrLegacy
 * @param {Record<string, unknown>} [mergedSettings]
 * @param {{ customerId?: string, customerLocationId?: string }} [scope]
 */
export async function resolveTemplateBySlugOrLegacy(supabase, slugOrLegacy, mergedSettings = {}, scope = {}) {
  await ensureEmailTemplateRegistrySeeded(supabase);

  const key = String(slugOrLegacy || '').trim();
  if (!key) return null;

  if (!(await tableMissing(supabase, 'email_templates'))) {
    let query = supabase
      .from('email_templates')
      .select('id, slug, legacy_key, subject, body_html, category, is_active')
      .is('deleted_at', null)
      .eq('is_active', true);

    const { data: bySlug } = await query.eq('slug', key).maybeSingle();
    const row =
      bySlug ||
      (
        await supabase
          .from('email_templates')
          .select('id, slug, legacy_key, subject, body_html, category, is_active')
          .is('deleted_at', null)
          .eq('is_active', true)
          .eq('legacy_key', key)
          .maybeSingle()
      ).data;

    if (row) {
      let subject = String(row.subject || '');
      let body = String(row.body_html || '');
      const override = await resolveTemplateOverride(supabase, row.id, scope);
      if (override) {
        if (override.subject) subject = override.subject;
        if (override.body_html) body = override.body_html;
      }
      return {
        subject,
        body,
        templateId: row.id,
        slug: row.slug,
        legacyKey: row.legacy_key || undefined,
        category: row.category,
      };
    }
  }

  if (EMAIL_TEMPLATE_KEYS.includes(key)) {
    const legacy = normalizeEmailTemplates(mergedSettings.emailTemplates)[key];
    return {
      subject: legacy.subject,
      body: migratePlainTemplateBodyToHtml(legacy.body),
      legacyKey: key,
      slug:
        key === 'jobAssigned' ? 'job_assigned' : key === 'jobCompleted' ? 'job_completed' : 'follow_up_reminder',
    };
  }

  return null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} [opts]
 * @param {boolean} [opts.includeArchived]
 */
export async function listEmailTemplates(supabase, opts = {}) {
  await ensureEmailTemplateRegistrySeeded(supabase);

  if (await tableMissing(supabase, 'email_templates')) {
    return [];
  }

  let q = supabase
    .from('email_templates')
    .select('id, slug, name, category, legacy_key, subject, body_html, merge_field_schema, is_active, version, created_at, updated_at, deleted_at')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (!opts.includeArchived) {
    q = q.is('deleted_at', null);
  }

  const { data, error } = await q;
  if (error) {
    console.warn('[listEmailTemplates]', error.message);
    return [];
  }
  return data || [];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function listTriggerBindings(supabase) {
  await ensureEmailTemplateRegistrySeeded(supabase);

  const allTriggers = await listAllTriggers(supabase);

  if (await tableMissing(supabase, 'email_trigger_bindings')) {
    return allTriggers.map((t) => ({
      trigger_id: t.trigger_id,
      template_id: null,
      enabled: true,
      label: t.label,
      description: t.description || null,
      is_system: t.is_system,
      legacy_key: t.legacy_key || null,
    }));
  }

  const { data, error } = await supabase
    .from('email_trigger_bindings')
    .select('trigger_id, template_id, enabled, email_templates:template_id ( id, slug, name, category )');

  if (error) {
    console.warn('[listTriggerBindings]', error.message);
    return allTriggers.map((t) => ({
      trigger_id: t.trigger_id,
      label: t.label,
      description: t.description || null,
      is_system: t.is_system,
      legacy_key: t.legacy_key || null,
      template_id: null,
      enabled: true,
      template: null,
    }));
  }

  const byId = Object.fromEntries((data || []).map((r) => [r.trigger_id, r]));
  return allTriggers.map((t) => {
    const row = byId[t.trigger_id];
    return {
      trigger_id: t.trigger_id,
      label: t.label,
      description: t.description || null,
      is_system: t.is_system,
      legacy_key: t.legacy_key || null,
      template_id: row?.template_id || null,
      enabled: row?.enabled !== false,
      template: row?.email_templates || null,
    };
  });
}

/**
 * Extract scope from job email bundle.
 * @param {Awaited<ReturnType<import('./jobEmailContext').fetchJobBundleForEmail>>} bundle
 */
export function scopeFromJobBundle(bundle) {
  if (!bundle?.job) return {};
  const customerId = bundle.job.customer_id || bundle.job.customer?.id || null;
  const customerLocationId = bundle.matchedCustLoc?.id || null;
  return {
    customerId: customerId ? String(customerId) : undefined,
    customerLocationId: customerLocationId ? String(customerLocationId) : undefined,
  };
}

/**
 * @param {'jobAssigned' | 'jobCompleted' | 'followUpReminder'} templateKey
 */
export function legacyKeyToTrigger(templateKey) {
  return LEGACY_KEY_TO_TRIGGER[templateKey] || null;
}
