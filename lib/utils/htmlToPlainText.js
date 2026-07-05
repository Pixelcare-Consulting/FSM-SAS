/**
 * Convert rich-text HTML to plain text for PDF/email display.
 * Preserves intentional line breaks from block elements and decodes common entities.
 *
 * @param {unknown} html
 * @returns {string}
 */
export function htmlToPlainText(html) {
  if (!html) return '';
  const str = String(html);
  return str
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<\/div>\s*<div[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n/g, '\n')
    .trim();
}
