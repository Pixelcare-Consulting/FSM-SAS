/**
 * Strip Quill/HTML noise while preserving intentional formatting (lists, links, etc.).
 * Collapses runs of empty paragraphs and removes trailing blocks Quill adds each edit.
 */

/** Matches Quill empty spacer paragraphs, including optional attributes on <p>. */
const EMPTY_PARAGRAPH_RE =
  /<p(?:\s[^>]*)?>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi;

const EMPTY_PARAGRAPH_RUN_RE = new RegExp(
  `(?:${EMPTY_PARAGRAPH_RE.source}\\s*){2,}`,
  'gi',
);

const LEADING_EMPTY_PARAGRAPHS_RE = new RegExp(
  `^\\s*(?:${EMPTY_PARAGRAPH_RE.source}\\s*)+`,
  'gi',
);

const TRAILING_EMPTY_PARAGRAPHS_RE = new RegExp(
  `(?:\\s*${EMPTY_PARAGRAPH_RE.source})+\\s*$`,
  'gi',
);

const HTML_JOB_DESCRIPTION_RE = /<(?:p|br|div|ul|ol|li|h[1-6]|table)\b/i;

export function isHtmlJobDescription(value) {
  if (value == null || typeof value !== 'string') return false;
  return HTML_JOB_DESCRIPTION_RE.test(value);
}

/** Collapse excessive blank lines in plain-text descriptions (table/list cells). */
export function normalizePlainTextDescription(text) {
  if (text == null || typeof text !== 'string') return '';
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function normalizeRichTextHtml(html, options = {}) {
  const { compact = false } = options;
  if (html == null || typeof html !== 'string') return '';

  let normalized = html.trim();
  if (!normalized) return '';

  if (compact) {
    let prev;
    do {
      prev = normalized;
      normalized = normalized.replace(EMPTY_PARAGRAPH_RE, '');
    } while (normalized !== prev);
  } else {
    // Collapse 2+ consecutive empty paragraphs to a single intentional spacer line.
    normalized = normalized.replace(EMPTY_PARAGRAPH_RUN_RE, '<p><br></p>');
  }

  let prev;
  do {
    prev = normalized;
    normalized = normalized.replace(LEADING_EMPTY_PARAGRAPHS_RE, '');
    normalized = normalized.replace(TRAILING_EMPTY_PARAGRAPHS_RE, '');
  } while (normalized !== prev);

  normalized = normalized.replace(/\s+<\/p>/gi, '</p>');
  normalized = normalized.replace(/>\s+</g, '><');

  const textContent = normalized
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, '')
    .trim();

  return textContent ? normalized.trim() : '';
}

export function isRichTextHtmlEmpty(html) {
  return normalizeRichTextHtml(html) === '';
}
