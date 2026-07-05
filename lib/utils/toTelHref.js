/**
 * SAP / UI phone → digit string for tel: / wa.me (strips "65-000-", optional SG CC).
 *
 * Yeastar Linkus for Google detects plain digit runs on hover — prefer `ExtensionFriendlyPhone`
 * (`components/common/ExtensionFriendlyPhone.js`) for CRM tables; raw `tel:` links often trigger
 * Chrome/Windows tel handling instead of the extension popup.
 * @param {unknown} raw
 * @returns {string} digits only or ""
 */
export function digitsForPhoneLinks(raw) {
  if (raw == null) return '';
  const str = String(raw);
  const hadSapPrefix = /^65-000-/i.test(str);
  const s = str.replace(/^65-000-\s*/i, '').trim();
  let digits = s.replace(/\D/g, '');
  if (!digits.length) return '';
  if (hadSapPrefix && digits.length === 8 && !digits.startsWith('65')) {
    digits = `65${digits}`;
  }
  return digits;
}

/**
 * tel: URI from digit-only national/international string (after digitsForPhoneLinks).
 * Uses tel:+digits when length ≥ 10 so URIs look like E.164 — improves Yeastar Linkus / Windows routing.
 * Shorter digit strings stay tel:local (technician numbers stored without country code).
 */
export function telUriFromDigits(digits) {
  if (digits == null || digits === '') return '';
  const d = String(digits).replace(/\D/g, '');
  if (!d.length) return '';
  if (d.length >= 10) return `tel:+${d}`;
  return `tel:${d}`;
}

/**
 * @param {unknown} raw
 * @returns {string} e.g. "tel:+6562286223", or "" if no digits
 */
export function toTelHref(raw) {
  const digits = digitsForPhoneLinks(raw);
  return telUriFromDigits(digits);
}

/**
 * @param {unknown} raw
 * @returns {string} WhatsApp chat URL or "" if not suitable
 */
export function toWhatsAppHref(raw) {
  const digits = digitsForPhoneLinks(raw);
  return digits.length >= 8 ? `https://wa.me/${digits}` : '';
}

/**
 * tel: + visible label + wa.me from one SAP/UI string (site contact phones, etc.).
 * @returns {{ telHref: string, label: string, waHref: string }}
 */
export function phoneLinkRow(raw) {
  const trimmed = raw == null ? '' : String(raw).trim();
  if (!trimmed) return { telHref: '', label: '', waHref: '' };
  const digits = digitsForPhoneLinks(trimmed);
  const telHref = telUriFromDigits(digits);
  const label = digits || trimmed;
  const waHref = digits.length >= 8 ? `https://wa.me/${digits}` : '';
  return { telHref, label, waHref };
}
