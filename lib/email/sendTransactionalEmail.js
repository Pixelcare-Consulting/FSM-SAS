/** Server-side only — import from API routes only. */

import { renderEmailTemplate, renderEmailTemplateContent } from './emailTemplatesShared';
import {
  buildFromHeaders,
  createNodemailerTransport,
  EMAIL_ADDRESS_RE,
  validateSmtpConfigForSend,
} from './loadEmailSettings';
import { legacyKeyToTrigger } from './templateRegistry';

/** @type {Record<string, 'sendJobAssigned' | 'sendJobCompleted' | 'sendFollowUpReminder'>} */
const TEMPLATE_TO_TOGGLE = {
  jobAssigned: 'sendJobAssigned',
  jobCompleted: 'sendJobCompleted',
  followUpReminder: 'sendFollowUpReminder',
};

/**
 * @param {'jobAssigned' | 'jobCompleted' | 'followUpReminder'} templateKey
 * @param {Record<string, unknown>} merged settings row value
 */
export function isEmailToggleOn(templateKey, merged) {
  const field = TEMPLATE_TO_TOGGLE[templateKey];
  if (!field) return false;
  const v = merged[field];
  if (templateKey === 'followUpReminder') {
    return v === true || v === 'true' || v === 1;
  }
  return v !== false && v !== 'false' && v !== 0;
}

/**
 * Send using pre-rendered subject/text/html.
 *
 * @param {object} opts
 * @param {Record<string, unknown>} opts.merged
 * @param {{ subject: string, text: string, html: string }} opts.rendered
 * @param {string | string[]} opts.to
 * @param {string | string[]} [opts.cc]
 * @param {string} [opts.replyTo]
 * @param {object} [opts.meta]
 */
export async function sendResolvedTransactionalEmail({ merged, rendered, to, cc, replyTo, meta }) {
  const validation = validateSmtpConfigForSend(merged);
  if (!validation.ok) {
    console.warn('[sendResolvedTransactionalEmail] incomplete SMTP:', validation.missing);
    return { ok: false, skipped: true, reason: 'smtp_incomplete', error: validation.error };
  }

  const toList = Array.isArray(to) ? to : [to];
  const normalizedTo = [...new Set(toList.map((e) => String(e || '').trim()).filter(Boolean))].filter(
    (e) => EMAIL_ADDRESS_RE.test(e)
  );
  if (!normalizedTo.length) {
    return { ok: false, skipped: true, reason: 'no_recipients' };
  }

  let ccList = [];
  if (cc) {
    const raw = Array.isArray(cc) ? cc : [cc];
    ccList = [
      ...new Set(raw.map((e) => String(e || '').trim()).filter((e) => EMAIL_ADDRESS_RE.test(e))),
    ];
  }

  const toLower = new Set(normalizedTo.map((e) => e.toLowerCase()));
  ccList = ccList.filter((e) => !toLower.has(e.toLowerCase()));

  const { fromHeader, fromEmail, smtpUser } = buildFromHeaders(merged);
  const fromLower = fromEmail.toLowerCase();
  const userLower = smtpUser.toLowerCase();
  const fromDiffersFromAuthUser = fromLower !== userLower;

  /** @type {import('nodemailer').SendMailOptions} */
  const mailOptions = {
    from: fromHeader,
    to: normalizedTo.join(', '),
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    replyTo: replyTo && String(replyTo).trim() ? String(replyTo).trim() : fromHeader,
  };
  if (ccList.length) {
    mailOptions.cc = ccList.join(', ');
  }
  if (fromDiffersFromAuthUser) {
    mailOptions.sender = smtpUser;
  }

  try {
    const transporter = createNodemailerTransport(merged);
    const info = await transporter.sendMail(mailOptions);
    return {
      ok: true,
      messageId: info.messageId,
      meta,
    };
  } catch (err) {
    const msg = err && typeof err.message === 'string' ? err.message : 'send_failed';
    console.error('[sendResolvedTransactionalEmail]', meta?.slug || meta?.legacyKey || '', msg);
    return { ok: false, error: msg, meta };
  }
}

/**
 * Send one templated message. Respects per-template toggle. Does not throw on skip.
 * Prefer dispatchTransactionalEmail for trigger-based sends.
 *
 * @param {object} opts
 * @param {'jobAssigned' | 'jobCompleted' | 'followUpReminder'} opts.templateKey
 * @param {Record<string, unknown>} opts.merged
 * @param {Record<string, string>} opts.vars
 * @param {string | string[]} opts.to
 * @param {string | string[]} [opts.cc]
 * @param {string} [opts.replyTo]
 * @param {import('@supabase/supabase-js').SupabaseClient} [opts.supabase] — when set, uses registry
 * @param {boolean} [opts.force]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, messageId?: string, error?: string }>}
 */
export async function sendTemplatedTransactionalEmail({
  templateKey,
  merged,
  vars,
  to,
  cc,
  replyTo,
  supabase,
  force = false,
}) {
  if (supabase) {
    const { dispatchTransactionalEmail } = await import('./dispatchTransactionalEmail');
    return dispatchTransactionalEmail({
      supabase,
      templateKey,
      merged,
      vars,
      to,
      cc,
      replyTo,
      force,
    });
  }

  if (!force && !isEmailToggleOn(templateKey, merged)) {
    return { ok: true, skipped: true, reason: 'toggle_off' };
  }

  const validation = validateSmtpConfigForSend(merged);
  if (!validation.ok) {
    console.warn('[sendTemplatedTransactionalEmail] incomplete SMTP:', validation.missing);
    return { ok: false, skipped: true, reason: 'smtp_incomplete', error: validation.error };
  }

  const templatesPartial = merged.emailTemplates;
  const rendered = renderEmailTemplate(templateKey, templatesPartial, vars);

  return sendResolvedTransactionalEmail({
    merged,
    rendered,
    to,
    cc,
    replyTo,
    meta: { legacyKey: templateKey, triggerId: legacyKeyToTrigger(templateKey) || undefined },
  });
}

/**
 * Send from explicit template content (custom templates).
 * @param {object} opts
 * @param {Record<string, unknown>} opts.merged
 * @param {{ subject: string, body: string }} opts.templateContent
 * @param {Record<string, string>} opts.vars
 * @param {string | string[]} opts.to
 * @param {string | string[]} [opts.cc]
 * @param {string} [opts.replyTo]
 * @param {object} [opts.meta]
 */
export async function sendCustomTemplateEmail({
  merged,
  templateContent,
  vars,
  to,
  cc,
  replyTo,
  meta,
}) {
  const validation = validateSmtpConfigForSend(merged);
  if (!validation.ok) {
    return { ok: false, skipped: true, reason: 'smtp_incomplete', error: validation.error };
  }

  const rendered = renderEmailTemplateContent(templateContent, vars);
  return sendResolvedTransactionalEmail({ merged, rendered, to, cc, replyTo, meta });
}
