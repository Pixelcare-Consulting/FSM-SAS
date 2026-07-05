/** @type {const} */
export const UPDATE_LOGS_FOLDER = 'Update Logs';

/** @type {readonly string[]} */
export const MEMO_FOLDERS = [
  'General',
  UPDATE_LOGS_FOLDER,
  'Announcements',
  'Operations',
];

const FOLDER_SET = new Set(MEMO_FOLDERS);

/**
 * @param {unknown} value
 * @param {string} [fallback]
 */
export function normalizeMemoFolder(value, fallback = 'General') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (FOLDER_SET.has(trimmed)) return trimmed;
  return trimmed.slice(0, 100);
}
