/**
 * Whether a single token appears in haystack (already lowercased).
 * Unit numbers: users type "#17-06" but SAP/SQL often store "17-06" without "#".
 */
function tokenMatchesInLowercaseHaystack(text, token) {
  const t = String(token);
  if (!t) return true;
  if (text.includes(t)) return true;
  if (t.startsWith('#') && t.length > 1) {
    const withoutHash = t.slice(1);
    if (withoutHash.length > 0 && text.includes(withoutHash)) return true;
  }
  return false;
}

/**
 * Global search helper: every whitespace-separated token must appear in the haystack
 * (order-independent). Fixes names like "THAM KWONG LEONG" vs search "KWONG LEONG THAM".
 *
 * @param {string} haystackLower - Already lowercased combined searchable text
 * @param {string} queryLower - Already lowercased user query
 */
export function textMatchesAllSearchTokens(haystackLower, queryLower) {
  const q = String(queryLower || '').trim();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const text = String(haystackLower || '');
  return tokens.every((t) => tokenMatchesInLowercaseHaystack(text, t));
}
