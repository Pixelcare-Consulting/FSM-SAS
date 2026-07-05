/**
 * AIFM job field `assigned_teches`: comma-separated, each segment often "TEAMCODE First Last".
 * Used by AIFM import (resolveTechnicianIds) and preview display.
 */

/**
 * @param {string|null|undefined} value
 * @returns {{ raw: string, code: string|null, name: string }[]}
 */
export function parseAifmAssignedTeches(value) {
  if (!value) return [];
  const s = String(value).trim();
  if (!s) return [];
  return s
    .split(',')
    .map((p) => p.trim().replace(/\s*\.\s*$/g, '').trim())
    .filter(Boolean)
    .map((p) => {
      const parts = p.split(/\s+/).filter(Boolean);
      if (parts.length <= 1) return { raw: p, code: null, name: p };
      return { raw: p, code: parts[0], name: parts.slice(1).join(' ') };
    });
}

/**
 * Readable multi-line string for tables (one tech per line).
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function formatAifmAssignedTechsDisplay(value) {
  const items = parseAifmAssignedTeches(value);
  if (!items.length) return '';
  return items.map((t) => (t.code ? `${t.code} · ${t.name}` : t.raw)).join('\n');
}
