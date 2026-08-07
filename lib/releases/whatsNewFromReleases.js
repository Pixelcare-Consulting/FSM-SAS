import { releases } from '@/content/releases';

export const WHATS_NEW_HIDE_DATE_KEY = 'fsm_whats_new_hide_date';

const NOTE_META = {
  feature: { type: 'feature', tag: 'New', tagType: 'new', icon: '🚀' },
  improvement: { type: 'improvement', tag: 'Improved', tagType: 'improved', icon: '⚡' },
  fix: { type: 'fix', tag: 'Fixed', tagType: 'fixed', icon: '🔧' },
};

/**
 * Prefer an explicit "Title — description" / "Title | description" body.
 * Otherwise use a short lead-in from the sentence so cards don't all share the release title.
 */
function splitNoteTitleAndDescription(body) {
  const text = String(body ?? '').trim();
  if (!text) return { title: '', description: '' };

  const explicit = text.match(/^(.{2,72}?)\s+[—|]\s+(.+)$/);
  if (explicit) {
    return {
      title: explicit[1].trim(),
      description: explicit[2].trim(),
    };
  }

  const lead = text.split(/[.!?]/)[0]?.trim() || text;
  const words = lead.split(/\s+/).filter(Boolean);
  const short =
    words.length <= 8
      ? lead
      : `${words.slice(0, 8).join(' ')}…`;
  return {
    title: short.length > 64 ? `${short.slice(0, 61).trim()}…` : short,
    description: text,
  };
}

/**
 * Parse a release note line into type / badge / card title / description.
 * Optional title: `feature: Short title — Longer description…`
 * Unknown prefixes default to improvement.
 */
export function parseNoteType(note) {
  const raw = String(note ?? '').trim();
  const match = raw.match(/^(feature|improvement|fix)\s*:\s*(.*)$/i);
  const body = match ? (match[2] || '').trim() || raw : raw;
  const key = match ? match[1].toLowerCase() : 'improvement';
  const meta = NOTE_META[key] || NOTE_META.improvement;
  const { title, description } = splitNoteTitleAndDescription(body);
  return {
    ...meta,
    title,
    text: description || body,
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
    title: parsed.title || release.title,
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
