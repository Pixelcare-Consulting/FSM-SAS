import { schedulerFetchRangeKey } from "./schedulerFetchRange";

const SESSION_PREFIX = "fsm_scheduler_cache_v1";
const TECHNICIANS_KEY = `${SESSION_PREFIX}:technicians`;
const WINDOW_PREFIX = `${SESSION_PREFIX}:window:`;

/** Windowed job/event data TTL (ms). */
export const WINDOW_DATA_TTL_MS = 90 * 1000;

/** Technicians + employee schedules TTL (ms). */
export const STATIC_TECH_TTL_MS = 15 * 60 * 1000;

const memoryCache = new Map();

function readSessionEntry(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionEntry(key, entry) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* ignore quota */
  }
}

function removeSessionEntry(key) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function isFresh(fetchedAt, ttlMs) {
  return typeof fetchedAt === "number" && Date.now() - fetchedAt < ttlMs;
}

export function techniciansCacheKey() {
  return TECHNICIANS_KEY;
}

export function windowCacheKey(range, includeUndated = false) {
  const base = schedulerFetchRangeKey(range);
  return includeUndated ? `${WINDOW_PREFIX}${base}:undated` : `${WINDOW_PREFIX}${base}`;
}

export function readSchedulerCache(key, ttlMs) {
  const mem = memoryCache.get(key);
  if (mem && isFresh(mem.fetchedAt, ttlMs)) {
    return mem.data;
  }

  const session = readSessionEntry(key);
  if (session && isFresh(session.fetchedAt, ttlMs)) {
    memoryCache.set(key, session);
    return session.data;
  }

  return null;
}

export function writeSchedulerCache(key, data) {
  const entry = { fetchedAt: Date.now(), data };
  memoryCache.set(key, entry);
  writeSessionEntry(key, entry);
}

export function invalidateSchedulerCache(key) {
  memoryCache.delete(key);
  removeSessionEntry(key);
}

export const SCHEDULER_INVALIDATE_EVENT = "fsm:scheduler-invalidate";

/** Notify open scheduler tabs to drop window caches and revalidate. */
export function dispatchSchedulerInvalidate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SCHEDULER_INVALIDATE_EVENT));
}

export function invalidateAllWindowCaches() {
  if (typeof window !== "undefined") {
    try {
      const keysToRemove = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k?.startsWith(WINDOW_PREFIX)) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }
  for (const key of [...memoryCache.keys()]) {
    if (key.startsWith(WINDOW_PREFIX)) memoryCache.delete(key);
  }
}
