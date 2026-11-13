/**
 * True when a SAP Service Layer error says the Activity no longer exists (-2028, 404).
 * Shared by the server-side link reset and the sync result UI.
 * @param {string|null|undefined} message
 * @returns {boolean}
 */
export function isSapActivityMissingError(message) {
  if (!message || typeof message !== 'string') return false;
  return /"code"\s*:\s*-2028\b/.test(message) || /\b404\b[\s\S]*does not exist/i.test(message);
}
