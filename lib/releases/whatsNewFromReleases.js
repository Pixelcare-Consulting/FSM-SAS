import { releases } from '@/content/releases';

export const WHATS_NEW_HIDE_DATE_KEY = 'fsm_whats_new_hide_date';

const NOTE_META = {
  feature: { type: 'feature', tag: 'New', tagType: 'new', icon: '🚀' },
  improvement: { type: 'improvement', tag: 'Improved', tagType: 'improved', icon: '⚡' },
  fix: { type: 'fix', tag: 'Fixed', tagType: 'fixed', icon: '🔧' },
};

/**
 * Parse a release note line into type / badge / plain text.
 * Unknown prefixes default to improvement.
 */
export function parseNoteType(note) {
  const raw = String(note ?? '').trim();
  const match = raw.match(/^(feature|improvement|fix)\s*:\s*(.*)$/i);
  if (match) {
    const key = match[1].toLowerCase();
    const meta = NOTE_META[key] || NOTE_META.improvement;
    return {
      ...meta,
      text: (match[2] || '').trim() || raw,
    };
  }
  return {
    ...NOTE_META.improvement,
    text: raw,
  };
}

/** Escape text before injecting into SweetAlert HTML. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function noteToCard(note, release, highlight) {
  const parsed = parseNoteType(note);
  return {
    icon: parsed.icon,
    title: release.title,
    description: parsed.text,
    tag: parsed.tag,
    tagType: parsed.tagType,
    type: parsed.type,
    highlight: Boolean(highlight),
    version: release.version,
    date: release.date,
  };
}

/**
 * One page per release version (newest first), cards = that version's notes.
 * First feature on the page is highlighted; otherwise the first card.
 */
export function getReleasePages() {
  return (releases || []).map((release) => {
    const notes = Array.isArray(release.notes) ? release.notes : [];
    const highlightIndex = notes.findIndex((n) => {
      const { type } = parseNoteType(n);
      return type === 'feature';
    });
    const activeHighlight = highlightIndex >= 0 ? highlightIndex : notes.length > 0 ? 0 : -1;
    const items = notes.map((note, i) => noteToCard(note, release, i === activeHighlight));
    return {
      version: release.version,
      date: release.date,
      title: release.title,
      shortDate: formatShortDate(release.date),
      items,
    };
  });
}

/**
 * Flatten newest notes across versions until `limit` (sidebar feed).
 */
export function getSidebarWhatsNewItems(limit = 6) {
  const pages = getReleasePages();
  const items = [];
  for (const page of pages) {
    for (const item of page.items) {
      items.push(item);
      if (items.length >= limit) return items;
    }
  }
  return items;
}

function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True when localStorage date equals today's local YYYY-MM-DD. */
export function isWhatsNewHiddenToday() {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(WHATS_NEW_HIDE_DATE_KEY);
    if (!stored) return false;
    return stored === getLocalDateString();
  } catch {
    return false;
  }
}

/** Persist today's local YYYY-MM-DD so auto-popup is suppressed for the day. */
export function markWhatsNewHiddenToday() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WHATS_NEW_HIDE_DATE_KEY, getLocalDateString());
  } catch {
    // ignore quota / private mode
  }
}
