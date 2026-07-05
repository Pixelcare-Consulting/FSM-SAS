/**
 * Resolve SAP Business Partner CardCode from display name (CardName) via Service Layer OData.
 * Aligns with this project: customers use CardType eq 'C', leads use CardType eq 'L'
 * (see getAllCustomers.js / getLeadsList.js). Callers try customers first, then leads.
 *
 * Performance optimisations (applied 2026-03):
 *   1. Module-level name cache (30-min TTL) — re-fetch of the same date range costs ~0 SAP calls.
 *   2. FUZZY_CAP — Phase 2 fuzzy fallback runs for at most 60 unmatched names; the rest get null
 *      and fall through to the import-jobs 3-tier customer resolution.
 *   3. Prefix chain depth capped at 2 — cuts worst-case sequential calls per name from 7 → 3.
 */

import sapService from '../services/sapService.js';
import {
  customerLookupKeyFromAifmJob,
  displayNameFromAifmJob
} from './aifmJobCustomerName.js';

export { customerLookupKeyFromAifmJob, displayNameFromAifmJob };

// ── Tuning constants ──────────────────────────────────────────────────────────

const BATCH_SIZE = 25;   // names per OData OR-filter batch (Phase 1)
const FUZZY_CAP  = 60;   // max names to run Phase 2 fuzzy on; rest get null
const CACHE_TTL  = 30 * 60 * 1000;  // 30 minutes in ms

// ── Module-level name resolution cache ───────────────────────────────────────
// key: `${normalizedName}|||${sessionKey}` → { hit, expiresAt }
// This survives across requests in the same Node process, so re-fetching the
// same date range (or overlapping ranges) costs zero extra SAP calls.

const nameCache = new Map();

function makeCacheKey(name, sessionCookies, cardType = 'C') {
  // Use a short fingerprint of the session so different users don't share results.
  const sessionKey = typeof sessionCookies === 'object'
    ? Object.values(sessionCookies).join('|').slice(0, 32)
    : String(sessionCookies).slice(0, 32);
  return `${name.toLowerCase().trim()}|||${cardType}|||${sessionKey}`;
}

function getCached(name, sessionCookies, cardType = 'C') {
  const key = makeCacheKey(name, sessionCookies, cardType);
  const entry = nameCache.get(key);
  if (!entry) return undefined;      // cache miss
  if (entry.expiresAt < Date.now()) {
    nameCache.delete(key);
    return undefined;                // expired
  }
  return entry.hit;                  // may be null (confirmed no SAP match)
}

function setCached(name, sessionCookies, hit, cardType = 'C') {
  const key = makeCacheKey(name, sessionCookies, cardType);
  nameCache.set(key, { hit, expiresAt: Date.now() + CACHE_TTL });
  // Lazy GC: remove expired entries on every write
  if (nameCache.size > 5000) {
    const now = Date.now();
    for (const [k, v] of nameCache) {
      if (v.expiresAt < now) nameCache.delete(k);
    }
  }
}

// ── OData helpers ─────────────────────────────────────────────────────────────

function escapeODataLiteral(value) {
  return String(value).trim().replace(/'/g, "''");
}

/**
 * AIFM names often end with " ." or stray punctuation. B1 Service Layer OData
 * returns "Not supported function" for indexof/startswith when those literals confuse the parser.
 */
function normalizeSapFilterLiteral(s) {
  let t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  for (let i = 0; i < 4; i++) {
    const next = t.replace(/[\s.,;:_\-]+$/g, '').trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

/** Restrict to SAP customers (not suppliers/CFL). */
function andCustomerType(expr) {
  return `(${expr}) and CardType eq 'C'`;
}

/** Restrict to SAP leads (CardType L). */
function andLeadType(expr) {
  return `(${expr}) and CardType eq 'L'`;
}

async function queryPartners(filter, sessionCookies, top = 20, cardType = 'C') {
  const typeFilter = cardType === 'L' ? andLeadType(filter) : andCustomerType(filter);
  return sapService.getBusinessPartners(
    {
      filter: typeFilter,
      top,
      select: 'CardCode,CardName',
      quiet: true
    },
    sessionCookies
  );
}

function pickMatch(rows, targetNorm) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  if (!rows.length) return null;
  if (rows.length === 1) {
    return { cardCode: rows[0].CardCode, cardName: rows[0].CardName, match: 'exact' };
  }
  const hit = rows.find((r) => norm(r.CardName) === targetNorm);
  if (hit) return { cardCode: hit.CardCode, cardName: hit.CardName, match: 'exact' };
  return { cardCode: rows[0].CardCode, cardName: rows[0].CardName, match: 'ambiguous' };
}

/**
 * Longest-first prefixes from first words.
 * CHANGE 3: callers now slice(0, 2) so only 2 prefixes are tried.
 */
function prefixChainFromName(name) {
  const words = String(name)
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !/^[\s.,;:_\-]+$/.test(w));
  const out = [];
  for (let k = words.length; k >= 1; k--) {
    const p = words.slice(0, k).join(' ');
    if (p.length >= 2) out.push(p);
  }
  return out;
}

/**
 * Build search strings: full name, slash merged, slash segments.
 */
function buildCandidateNames(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  if (!n) return [];
  const out = [];
  const add = (s) => {
    const t = String(s).replace(/\s+/g, ' ').trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };
  add(n);
  add(n.replace(/\s*\/\s*/g, ' ').replace(/\s+/g, ' '));
  for (const part of n.split('/')) {
    add(part);
  }
  return out;
}

/**
 * Try OData call; return empty array on failure (unsupported function, etc.).
 */
async function safeQuery(filter, sessionCookies, cardType = 'C') {
  try {
    const data = await queryPartners(filter, sessionCookies, 20, cardType);
    return data.value || [];
  } catch (e) {
    return [];
  }
}

/**
 * Look up one name variant via SAP OData.
 * CHANGE 3: startswith prefix chain capped at 2 attempts (was unbounded).
 * Worst-case calls per name: 1 exact + 1 indexof + 2 startswith = 4 (was 7+).
 */
async function lookupOneVariant(displayName, targetNorm, sessionCookies, cardType = 'C') {
  const name = (displayName || '').trim();
  if (name.length < 2) return null;

  const escaped = escapeODataLiteral(name);

  let rows = await safeQuery(`CardName eq '${escaped}'`, sessionCookies, cardType);
  let picked = pickMatch(rows, targetNorm);
  if (picked) return picked;

  if (name.length >= 4) {
    const norm = (s) => String(s || '').trim().toLowerCase();
    const fuzzyName = normalizeSapFilterLiteral(name) || name;

    if (fuzzyName.length >= 4) {
      const subRaw = fuzzyName.length > 80 ? fuzzyName.slice(0, 80) : fuzzyName;
      const sub = escapeODataLiteral(subRaw);

      rows = await safeQuery(`indexof(CardName, '${sub}') ge 0`, sessionCookies, cardType);
      if (rows.length) {
        const exact = rows.find((r) => norm(r.CardName) === targetNorm);
        if (exact) return { cardCode: exact.CardCode, cardName: exact.CardName, match: 'indexof_exact' };
        return { cardCode: rows[0].CardCode, cardName: rows[0].CardName, match: 'indexof_partial' };
      }
    }

    // CHANGE 3: cap at 2 prefix attempts instead of full chain
    let lastMulti = null;
    for (const pref of prefixChainFromName(fuzzyName.length >= 2 ? fuzzyName : name).slice(0, 2)) {
      const pe = escapeODataLiteral(pref);
      rows = await safeQuery(`startswith(CardName, '${pe}')`, sessionCookies, cardType);
      if (!rows.length) continue;
      const exact = rows.find((r) => norm(r.CardName) === targetNorm);
      if (exact) return { cardCode: exact.CardCode, cardName: exact.CardName, match: 'startswith_exact' };
      if (rows.length === 1) {
        return { cardCode: rows[0].CardCode, cardName: rows[0].CardName, match: 'startswith_partial' };
      }
      lastMulti = rows;
    }
    if (lastMulti?.length) {
      const exact = lastMulti.find((r) => norm(r.CardName) === targetNorm);
      if (exact) return { cardCode: exact.CardCode, cardName: exact.CardName, match: 'startswith_exact' };
      return { cardCode: lastMulti[0].CardCode, cardName: lastMulti[0].CardName, match: 'ambiguous' };
    }
  }

  return null;
}

/**
 * Exact-match only: OData CardName eq + pickMatch (no indexof/startswith fallback).
 */
async function lookupOneVariantExact(displayName, targetNorm, sessionCookies, cardType = 'C') {
  const name = (displayName || '').trim();
  if (name.length < 2) return null;

  const escaped = escapeODataLiteral(name);
  const rows = await safeQuery(`CardName eq '${escaped}'`, sessionCookies, cardType);
  return pickMatch(rows, targetNorm);
}

// ── Public exports ─────────────────────────────────────────────────────────────

const SKIP = new Set(['', '—', '..', '.', '-', 'n/a', 'na', 'null', 'undefined']);

/**
 * Look up a single AIFM customer name via SAP OData.
 * CHANGE 1: checks/writes the module-level name cache before hitting SAP.
 */
async function lookupCardCodeByNameForCardType(displayName, sessionCookies, cardType) {
  const name = (displayName || '').trim();
  if (!name || SKIP.has(name.toLowerCase())) return null;

  const targetNorm = name.toLowerCase();
  const candidates = buildCandidateNames(name);

  for (const cand of candidates) {
    const hit = await lookupOneVariant(cand, targetNorm, sessionCookies, cardType);
    if (hit) return hit;
  }
  return null;
}

export async function lookupCardCodeByCustomerName(displayName, sessionCookies) {
  const name = (displayName || '').trim();
  if (!name || SKIP.has(name.toLowerCase())) return null;

  const cached = getCached(name, sessionCookies, 'C');
  if (cached !== undefined) return cached;

  const result = await lookupCardCodeByNameForCardType(name, sessionCookies, 'C');
  if (sessionCookies?.b1session) setCached(name, sessionCookies, result, 'C');
  return result;
}

/** SAP Business Partner leads (CardType L) — used after customer (C) lookup misses. */
export async function lookupCardCodeByLeadName(displayName, sessionCookies) {
  const name = (displayName || '').trim();
  if (!name || SKIP.has(name.toLowerCase())) return null;
  return lookupCardCodeByNameForCardType(name, sessionCookies, 'L');
}

/**
 * SAP lead name lookup — exact CardName match only (no fuzzy prefix/substring fallback).
 * Used during Convert to SAP to avoid false links (e.g. DOU LIYU → DOUGLAS COWAN).
 */
export async function lookupCardCodeByLeadNameExact(displayName, sessionCookies) {
  const name = (displayName || '').trim();
  if (!name || SKIP.has(name.toLowerCase())) return null;

  const targetNorm = name.toLowerCase();
  const candidates = buildCandidateNames(name);

  for (const cand of candidates) {
    const hit = await lookupOneVariantExact(cand, targetNorm, sessionCookies, 'L');
    if (hit) return hit;
  }
  return null;
}

// ── Phase 1: Batch exact-match ────────────────────────────────────────────────

/**
 * Batch-query SAP for all candidate names in one OData OR filter per chunk.
 * CHANGE 1: each resolved name is written to the module-level cache.
 *
 * @param {string[]} originalNames
 * @param {object}   sessionCookies
 * @returns {Map<string, { cardCode, cardName, match }>}
 */
async function batchExactMatch(originalNames, sessionCookies, cardType = 'C') {
  const matched = new Map();

  // Separate names that are already cached
  const uncached = [];
  for (const name of originalNames) {
    const cached = getCached(name, sessionCookies);
    if (cached !== undefined) {
      if (cached !== null) matched.set(name, cached);
    } else {
      uncached.push(name);
    }
  }

  if (!uncached.length) return matched;

  // Build a flat list of { candidate, originalName } including slash variants
  const candidates = [];
  const seen = new Set();
  for (const origName of uncached) {
    for (const cand of buildCandidateNames(origName)) {
      const key = `${cand}|||${origName}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({ candidate: cand, originalName: origName });
      }
    }
  }

  // Build reverse lookup: candidateLower -> [{ candidate, originalName }]
  const candToOrig = new Map();
  for (const item of candidates) {
    const cl = item.candidate.toLowerCase();
    if (!candToOrig.has(cl)) candToOrig.set(cl, []);
    candToOrig.get(cl).push(item);
  }

  // Batch unique candidate strings into OData OR-filter calls
  const uniqueCandidates = [...new Set(candidates.map((c) => c.candidate))];
  for (let i = 0; i < uniqueCandidates.length; i += BATCH_SIZE) {
    const chunk = uniqueCandidates.slice(i, i + BATCH_SIZE);
    const filter = `(${chunk.map((n) => `CardName eq '${escapeODataLiteral(n)}'`).join(' or ')})`;
    let rows = [];
    try {
      const data = await queryPartners(filter, sessionCookies, chunk.length + 10, cardType);
      rows = data.value || [];
    } catch (_) {}

    for (const row of rows) {
      const cl = row.CardName.toLowerCase();
      const items = candToOrig.get(cl) || [];
      for (const { originalName } of items) {
        if (!matched.has(originalName)) {
          const hit = { cardCode: row.CardCode, cardName: row.CardName, match: 'exact' };
          matched.set(originalName, hit);
          setCached(originalName, sessionCookies, hit); // CHANGE 1: populate cache
        }
      }
    }
  }

  // Cache confirmed misses from Phase 1 so Phase 2 doesn't re-query them
  for (const name of uncached) {
    if (!matched.has(name) && getCached(name, sessionCookies) === undefined) {
      // Don't cache yet — Phase 2 may still find them; cache after Phase 2.
    }
  }

  return matched;
}

/**
 * Build a name → CardCode map for a set of AIFM jobs.
 *
 * CHANGE 2: Phase 2 fuzzy fallback is capped at FUZZY_CAP names.
 *           Names beyond the cap get null and fall through to import-jobs
 *           tier-2 (DB name search) / tier-3 (auto-create).
 *
 * @param {Array<Object>} jobs
 * @param {Object|null}   sessionCookies
 * @param {number}        concurrency
 * @returns {Promise<Map<string, object>>}
 */
export async function buildCustomerNameCardCodeMap(jobs, sessionCookies, concurrency = 6) {
  const map = new Map();
  if (!sessionCookies) return map;

  const names = new Set();
  for (const row of jobs) {
    const k = customerLookupKeyFromAifmJob(row);
    if (k) names.add(k);
  }

  const list = [...names];
  if (!list.length) return map;

  // ── Phase 1: batch exact-match (few OData calls) ──────────────────────────
  const exactResults = await batchExactMatch(list, sessionCookies);
  for (const [name, hit] of exactResults) {
    map.set(name, hit);
  }

  // ── Phase 2: fuzzy fallback — capped at FUZZY_CAP ─────────────────────────
  const unmatched = list.filter((n) => !map.has(n));
  const fuzzyTarget = unmatched.slice(0, FUZZY_CAP);
  const skipped = unmatched.length - fuzzyTarget.length;

  if (skipped > 0) {
    console.log(
      `[sapLookup] Phase 2 capped: running fuzzy on ${fuzzyTarget.length}/${unmatched.length} unmatched names` +
      ` (${skipped} skipped — will resolve via DB name search during import)`
    );
  }

  if (fuzzyTarget.length > 0) {
    const fallbackConcurrency = Math.max(concurrency, 12);
    for (let i = 0; i < fuzzyTarget.length; i += fallbackConcurrency) {
      const chunk = fuzzyTarget.slice(i, i + fallbackConcurrency);
      const results = await Promise.all(
        chunk.map(async (n) => [n, await lookupCardCodeByCustomerName(n, sessionCookies)])
      );
      for (const [n, hit] of results) {
        map.set(n, hit ?? null);
        // CHANGE 1: cache the result (including null = confirmed miss)
        setCached(n, sessionCookies, hit ?? null);
      }
    }
  }

  // Mark skipped names as null in the map so callers know they were processed
  for (const n of unmatched.slice(FUZZY_CAP)) {
    map.set(n, null);
  }

  return map;
}

export function enrichAifmJobsWithSapCardCodes(jobs, nameMap) {
  return jobs.map((row) => {
    const k = customerLookupKeyFromAifmJob(row);
    const hit = k ? nameMap.get(k) : null;
    return {
      ...row,
      sap_card_code: hit?.cardCode ?? null,
      sap_bp_card_name: hit?.cardName ?? null,
      sap_card_match: hit?.match ?? null
    };
  });
}
