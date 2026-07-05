/**
 * Match AIFM assigned_teches name segments to portal technicians.full_name.
 * Prefers exact/normalized equality, then order-independent token overlap (safer than a single broad %substring%).
 */

/**
 * @param {string|null|undefined} s
 * @returns {string}
 */
export function normalizeTechNameForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,;]+/g, ' ')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split into tokens; short tokens (≤2 chars) must match a whole word later.
 * @param {string} norm
 * @returns {string[]}
 */
function tokensFromNormalized(norm) {
  return norm.split(/\s+/).filter(Boolean);
}

/**
 * Every AIFM name token must be “found” in the technician full_name:
 * - tokens of length ≥3: substring match in normalized full name (handles "Phyllis" in "Ng Phyllis Ang")
 * - tokens of length ≤2: must equal some whitespace-separated word (avoids "an" matching "Andrew")
 *
 * @param {string} haystackNorm
 * @param {string[]} needleTokens
 */
function everyNeedleTokenMatchesHaystack(haystackNorm, needleTokens) {
  const words = tokensFromNormalized(haystackNorm);
  return needleTokens.every((tok) => {
    if (tok.length <= 2) {
      return words.some((w) => w === tok);
    }
    return haystackNorm.includes(tok);
  });
}

/**
 * @param {string} needleFromAifm — segment after team code, or full raw segment
 * @param {{ id: string, full_name: string }[]} technicians
 * @returns {{ id: string, full_name: string, match: 'exact' | 'token' | 'fuzzy' } | null}
 */
export function matchTechnicianToAifmName(needleFromAifm, technicians) {
  const needle = normalizeTechNameForMatch(needleFromAifm);
  if (!needle) return null;

  const list = (technicians || []).filter((t) => t?.id && t?.full_name);
  if (!list.length) return null;

  // 1) Exact normalized full string
  const exact = list.find((t) => normalizeTechNameForMatch(t.full_name) === needle);
  if (exact) return { id: exact.id, full_name: exact.full_name, match: 'exact' };

  const needleTokens = tokensFromNormalized(needle);
  if (needleTokens.length === 0) return null;

  // 2) All needle tokens match (strict rules for short tokens)
  const tokenMatches = list.filter((t) =>
    everyNeedleTokenMatchesHaystack(normalizeTechNameForMatch(t.full_name), needleTokens)
  );

  if (tokenMatches.length === 1) {
    return { id: tokenMatches[0].id, full_name: tokenMatches[0].full_name, match: 'token' };
  }

  if (tokenMatches.length > 1) {
    // Prefer fewer extra “words” in DB name, then shorter full_name (more specific)
    const scored = tokenMatches.map((t) => {
      const h = normalizeTechNameForMatch(t.full_name);
      const hw = tokensFromNormalized(h);
      const extraWords = Math.max(0, hw.length - needleTokens.length);
      return { t, score: extraWords * 100 + h.length };
    });
    scored.sort((a, b) => a.score - b.score);
    return { id: scored[0].t.id, full_name: scored[0].t.full_name, match: 'token' };
  }

  // 3) Conservative fallback: whole needle as substring (only if needle is long enough to be distinctive)
  if (needle.length >= 5) {
    const sub = list.filter((t) => normalizeTechNameForMatch(t.full_name).includes(needle));
    if (sub.length === 1) {
      return { id: sub[0].id, full_name: sub[0].full_name, match: 'fuzzy' };
    }
    if (sub.length > 1) {
      sub.sort((a, b) => a.full_name.length - b.full_name.length);
      return { id: sub[0].id, full_name: sub[0].full_name, match: 'fuzzy' };
    }
  }

  return null;
}
