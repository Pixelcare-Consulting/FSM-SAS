/**
 * Load merged Dashboard → Email settings from Supabase (service role).
 * Import only from API routes — not from client components.
 */

import nodemailer from 'nodemailer';
import { EMAIL_ADDRESS_RE } from './emailConstants';

export const EMAIL_SETTINGS_ID = 'emailSettings';

export { EMAIL_ADDRESS_RE };

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadEmailSettingsFromDb(admin) {
  const { data, error } = await admin
    .from('settings')
    .select('value')
    .eq('id', EMAIL_SETTINGS_ID)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.warn('[loadEmailSettingsFromDb]', error.message);
    return {};
  }
  if (data?.value && typeof data.value === 'object') {
    return { ...data.value };
  }
  return {};
}

/**
 * Merge saved settings with optional in-memory overrides (e.g. unsaved form draft).
 * Keeps stored smtpPassword when override omits it.
 * @param {Record<string, unknown>} dbValue
 * @param {Record<string, unknown>} [draftObj]
 */
export function mergeEmailSettings(dbValue, draftObj) {
  const draft = draftObj && typeof draftObj === 'object' ? draftObj : {};
  const merged = { ...dbValue };
  for (const [key, val] of Object.entries(draft)) {
    if (key === 'smtpPassword') {
      if (isNonEmptyString(val)) merged.smtpPassword = String(val).trim();
      continue;
    }
    if (key === 'emailTemplates' && val && typeof val === 'object') {
      merged.emailTemplates = val;
      continue;
    }
    if (val !== undefined && val !== null && val !== '') {
      merged[key] = val;
    }
  }
  if (!isNonEmptyString(merged.smtpPassword) && isNonEmptyString(dbValue.smtpPassword)) {
    merged.smtpPassword = String(dbValue.smtpPassword);
  }
  return merged;
}

/**
 * @param {Record<string, unknown>} merged
 * @returns {import('nodemailer').Transporter}
 */
export function createNodemailerTransport(merged) {
  const host = String(merged.smtpHost || '').trim();
  const smtpUser = String(merged.smtpUser || '').trim();
  const pass =
    merged.smtpPassword != null && String(merged.smtpPassword).length > 0
      ? String(merged.smtpPassword)
      : '';
  const port = parseInt(String(merged.smtpPort || '587'), 10) || 587;
  const enc = String(merged.smtpEncryption || 'tls').toLowerCase();

  const transportOpts = {
    host,
    port,
    secure: enc === 'ssl',
    auth: { user: smtpUser, pass },
    connectionTimeout: 25_000,
    greetingTimeout: 25_000,
    tls: {
      minVersion: 'TLSv1.2',
    },
  };
  if (enc === 'tls') {
    transportOpts.secure = false;
  }
  if (enc === 'none') {
    transportOpts.secure = false;
  }

  return nodemailer.createTransport(transportOpts);
}

/**
 * @param {Record<string, unknown>} merged
 * @returns {{ ok: boolean, error?: string, missing?: string[] }}
 */
export function validateSmtpConfigForSend(merged) {
  const missing = [];
  const host = String(merged.smtpHost || '').trim();
  const fromEmail = String(merged.fromEmail || '').trim();
  const smtpUser = String(merged.smtpUser || '').trim();
  const pass =
    merged.smtpPassword != null && String(merged.smtpPassword).length > 0
      ? String(merged.smtpPassword)
      : '';

  if (!host) missing.push('smtpHost');
  if (!fromEmail || !EMAIL_ADDRESS_RE.test(fromEmail)) missing.push('fromEmail');
  if (!smtpUser) missing.push('smtpUser');
  if (!pass) missing.push('smtpPassword');

  if (missing.length) {
    return { ok: false, error: 'SMTP settings incomplete', missing };
  }
  return { ok: true };
}

/**
 * @param {Record<string, unknown>} merged
 * @returns {{ fromHeader: string, fromEmail: string, smtpUser: string, fromName: string }}
 */
export function buildFromHeaders(merged) {
  const fromEmail = String(merged.fromEmail || '').trim();
  const fromName = String(merged.fromName || '').trim();
  const smtpUser = String(merged.smtpUser || '').trim();
  const fromHeader = fromName
    ? `"${fromName.replace(/"/g, '')}" <${fromEmail}>`
    : fromEmail;
  return { fromHeader, fromEmail, smtpUser, fromName };
}
