/**
 * Central transactional email dispatcher — resolves trigger → template → SMTP.
 * Import only from API routes — not from client components.
 */

import { renderEmailTemplateContent } from './emailTemplatesShared';
import { loadEmailSettingsFromDb, mergeEmailSettings } from './loadEmailSettings';
import {
  legacyKeyToTrigger,
  resolveTemplateBySlugOrLegacy,
  resolveTemplateForTrigger,
  scopeFromJobBundle,
} from './templateRegistry';
import { sendResolvedTransactionalEmail } from './sendTransactionalEmail';

/**
 * @typedef {object} DispatchContext
 * @property {import('@supabase/supabase-js').SupabaseClient} supabase
 * @property {string} [triggerId]
 * @property {'jobAssigned' | 'jobCompleted' | 'followUpReminder'} [templateKey] — legacy alias
 * @property {string} [templateSlug]
 * @property {Record<string, string>} vars
 * @property {string | string[]} to
 * @property {string | string[]} [cc]
 * @property {string} [replyTo]
 * @property {Record<string, unknown>} [merged]
 * @property {{ customerId?: string, customerLocationId?: string }} [scope]
 * @property {boolean} [force] — skip enabled toggle
 * @property {Awaited<ReturnType<import('./jobEmailContext').fetchJobBundleForEmail>>} [bundle] — auto scope
 */

/**
 * @param {DispatchContext} opts
 */
export async function dispatchTransactionalEmail(opts) {
  const {
    supabase,
    vars,
    to,
    cc,
    replyTo,
    force = false,
    bundle,
  } = opts;

  let merged = opts.merged;
  if (!merged || typeof merged !== 'object') {
    const dbValue = await loadEmailSettingsFromDb(supabase);
    merged = mergeEmailSettings(dbValue);
  }

  const scope = {
    ...(opts.scope || {}),
    ...(bundle ? scopeFromJobBundle(bundle) : {}),
  };

  let triggerId = opts.triggerId || null;
  if (!triggerId && opts.templateKey) {
    triggerId = legacyKeyToTrigger(opts.templateKey);
  }

  /** @type {import('./templateRegistry').ResolvedTemplateContent | null} */
  let content = null;
  let enabled = true;
  let templateId = null;
  let slug = null;
  let legacyKey = opts.templateKey || null;

  if (triggerId) {
    const resolved = await resolveTemplateForTrigger(supabase, triggerId, { mergedSettings: merged, scope });
    enabled = resolved.enabled;
    content = resolved.content;
    templateId = resolved.templateId;
    slug = resolved.slug;
    legacyKey = resolved.legacyKey || legacyKey;
  } else if (opts.templateSlug) {
    const resolved = await resolveTemplateBySlugOrLegacy(supabase, opts.templateSlug, merged, scope);
    if (resolved) {
      content = resolved;
      templateId = resolved.templateId || null;
      slug = resolved.slug;
      legacyKey = resolved.legacyKey || null;
    }
  }

  if (!content) {
    return { ok: false, skipped: true, reason: 'template_not_found' };
  }

  if (!enabled && !force) {
    return { ok: true, skipped: true, reason: 'toggle_off' };
  }

  const rendered = renderEmailTemplateContent(
    { subject: content.subject, body: content.body },
    vars
  );

  const sendResult = await sendResolvedTransactionalEmail({
    merged,
    rendered,
    to,
    cc,
    replyTo,
    meta: {
      triggerId: triggerId || undefined,
      templateId: templateId || content.templateId || undefined,
      slug: slug || content.slug || undefined,
      legacyKey: legacyKey || content.legacyKey || undefined,
    },
  });

  return {
    ...sendResult,
    triggerId,
    templateId: templateId || content.templateId,
    slug: slug || content.slug,
    legacyKey: legacyKey || content.legacyKey,
  };
}
