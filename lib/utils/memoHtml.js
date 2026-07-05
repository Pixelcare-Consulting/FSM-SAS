import DOMPurify from 'isomorphic-dompurify';

/** Tags produced by the memo Quill toolbar + safe structure */
const MEMO_SANITIZE = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'h1',
    'h2',
    'h3',
    'ol',
    'ul',
    'li',
    'a',
    'span',
    'blockquote',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
};

/**
 * @param {string} str
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  if (typeof document !== 'undefined') {
    const ta = document.createElement('textarea');
    ta.innerHTML = str;
    return ta.value;
  }
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * @param {string} t
 */
function looksLikeHtmlFragment(t) {
  return /<\s*(p|h[1-3]|ul|ol|li|strong|em|b|i|u|a|blockquote)\b/i.test(t);
}

/**
 * Unwrap pasted raw HTML that Quill stored as a single paragraph of markup.
 * @param {string} raw
 */
function extractHtmlFragment(raw) {
  let t = raw.trim();
  if (!t) return '';

  if (/&lt;\/?[a-z]/i.test(t)) {
    t = decodeHtmlEntities(t);
  }

  const singleP = t.match(/^<p>([\s\S]*)<\/p>$/i);
  if (singleP) {
    const inner = singleP[1].replace(/<br\s*\/?>/gi, '');
    if (/<\s*(h[1-3]|ul|ol|li|blockquote)\b/i.test(inner)) {
      t = inner.trim();
    }
  }

  return t.trim();
}

/**
 * @param {string} t
 */
function plainTextToParagraphHtml(t) {
  const esc = t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${esc.replace(/\r\n|\r|\n/g, '<br />')}</p>`;
}

/**
 * HTML safe for rendering in the portal (sign-in modal, ticker detail, etc.).
 * @param {unknown} html
 * @returns {string}
 */
export function sanitizeMemoBodyForDisplay(html) {
  if (html == null || typeof html !== 'string') return '';
  return DOMPurify.sanitize(html.trim(), MEMO_SANITIZE);
}

/**
 * Normalized HTML for display surfaces (handles legacy plain / escaped HTML).
 * @param {unknown} raw
 * @returns {string}
 */
export function memoHtmlForDisplay(raw) {
  return sanitizeMemoBodyForDisplay(memoBodyForQuill(raw));
}

/**
 * Plain text for search, list previews, and title tooltips.
 * @param {unknown} html
 * @returns {string}
 */
export function memoBodyToPlainText(html) {
  if (html == null || typeof html !== 'string') return '';
  const normalized = memoBodyForQuill(html);
  const withoutTags = normalized.replace(/<[^>]+>/g, ' ');
  return withoutTags.replace(/\s+/g, ' ').trim();
}

/**
 * Persisted value: null if empty after sanitize, otherwise trimmed safe HTML.
 * @param {unknown} html
 * @returns {string | null}
 */
export function normalizeMemoBodyForSave(html) {
  if (html == null || typeof html !== 'string') return null;
  const prepared = memoBodyForQuill(html);
  const sanitized = sanitizeMemoBodyForDisplay(prepared);
  const plain = memoBodyToPlainText(sanitized);
  if (!plain) return null;
  return sanitized;
}

/**
 * Value for Quill: converts legacy plain text, escaped HTML, and pasted raw HTML.
 * @param {unknown} raw
 * @returns {string}
 */
export function memoBodyForQuill(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const fragment = extractHtmlFragment(raw);
  if (!fragment) return '';

  if (!looksLikeHtmlFragment(fragment)) {
    return plainTextToParagraphHtml(fragment);
  }

  return sanitizeMemoBodyForDisplay(fragment);
}
