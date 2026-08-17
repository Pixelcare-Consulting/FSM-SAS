/**
 * Process-local scheduler window fetch stampede control.
 * Shared by technician-data and invalidate-cache so an in-flight query
 * cannot rewrite the 180s list cache after a reassign invalidate.
 */

export const SCHEDULER_WINDOW_CACHE_PREFIX = "scheduler-window:";

const inFlightQueries = new Map();
let cacheGeneration = 0;

export function getSchedulerWindowCacheGeneration() {
  return cacheGeneration;
}

export function bumpSchedulerWindowCacheGeneration() {
  cacheGeneration += 1;
  clearInFlightSchedulerWindowQueries();
  return cacheGeneration;
}

export function getInFlightSchedulerQuery(cacheKey) {
  return inFlightQueries.get(cacheKey);
}

export function setInFlightSchedulerQuery(cacheKey, promise) {
  inFlightQueries.set(cacheKey, promise);
}

export function deleteInFlightSchedulerQuery(cacheKey, promise) {
  if (inFlightQueries.get(cacheKey) === promise) {
    inFlightQueries.delete(cacheKey);
  }
}

export function clearInFlightSchedulerWindowQueries() {
  for (const key of [...inFlightQueries.keys()]) {
    if (key.startsWith(SCHEDULER_WINDOW_CACHE_PREFIX)) {
      inFlightQueries.delete(key);
    }
  }
}
