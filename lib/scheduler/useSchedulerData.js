import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, subDays } from "date-fns";
import {
  computeSchedulerFetchRange,
  schedulerFetchRangeKey,
} from "./schedulerFetchRange";
import {
  getSchedulerCacheFetchedAt,
  invalidateSchedulerCache,
  markLocalSchedulerMutation,
  patchSchedulerWindowCacheEvent,
  replaceSchedulerWindowCacheEventsForJob,
  readSchedulerCache,
  REVALIDATE_MIN_INTERVAL_MS,
  STATIC_TECH_TTL_MS,
  techniciansCacheKey,
  WINDOW_DATA_TTL_MS,
  windowCacheKey,
  writeSchedulerCache,
} from "./schedulerCache";
import {
  bumpSchedulerWindowFetchGeneration,
  fetchSchedulerTechnicians,
  fetchSchedulerWindowData,
  hydrateSchedulerEvents,
  normalizeSchedulerTechnicians,
} from "./technicianSchedulerService";

const NAV_DEBOUNCE_MS = 200;
const PREFETCH_DELAY_MS = 400;

function isSchedulerRange(value) {
  return Boolean(value?.start && value?.end);
}

function hasCachedTechnicians(technicians) {
  return Array.isArray(technicians) && technicians.length > 0;
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

/**
 * Stale-while-revalidate data hook for the worker scheduler.
 * Technicians (15 min TTL) are fetched separately from windowed events (90s TTL).
 */
export function useSchedulerData({
  viewMode,
  selectedDate,
  includeUndated = false,
  enabled = true,
}) {
  const [resources, setResources] = useState([]);
  const [events, setEvents] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [undatedByTech, setUndatedByTech] = useState({});
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const hasLoadedOnceRef = useRef(false);
  const fetchRangeKeyRef = useRef("");
  const dataVersionRef = useRef(null);
  const requestSeqRef = useRef(0);
  const mutationEpochRef = useRef(0);
  const windowAbortRef = useRef(null);
  const inFlightRefreshRef = useRef(null);
  const navDebounceRef = useRef(null);
  const prefetchTimerRef = useRef(null);

  const isCacheRecentlyFetched = useCallback((key, ttlMs) => {
    const fetchedAt = getSchedulerCacheFetchedAt(key, ttlMs);
    return fetchedAt != null && Date.now() - fetchedAt < REVALIDATE_MIN_INTERVAL_MS;
  }, []);

  const applyUndated = useCallback((undatedAssignments) => {
    const undatedMap = {};
    (undatedAssignments || []).forEach((a) => {
      if (!undatedMap[a.technicianId]) undatedMap[a.technicianId] = [];
      undatedMap[a.technicianId].push(a);
    });
    setUndatedByTech(undatedMap);
  }, []);

  const mergeWindowPayload = useCallback((windowPayload, technicians) => {
    const normalizedTechnicians = normalizeSchedulerTechnicians(technicians);
    setResources(normalizedTechnicians);
    const hydratedEvents = hydrateSchedulerEvents(
      windowPayload.events || [],
      normalizedTechnicians
    );
    setEvents(hydratedEvents);
    setCalendarEvents(windowPayload.calendarEvents || []);
    applyUndated(windowPayload.undatedAssignments);
    const version = windowPayload.dataVersion || null;
    dataVersionRef.current = version;
    setDataVersion(version);
  }, [applyUndated]);

  const paintFromCache = useCallback(
    (range) => {
      const windowKey = windowCacheKey(range, includeUndated);
      const cachedWindow = readSchedulerCache(windowKey, WINDOW_DATA_TTL_MS);
      const cachedTechs = readSchedulerCache(techniciansCacheKey(), STATIC_TECH_TTL_MS)
        ?.technicians;
      const canPaint = Boolean(cachedWindow) && hasCachedTechnicians(cachedTechs);

      if (hasCachedTechnicians(cachedTechs)) {
        setResources(normalizeSchedulerTechnicians(cachedTechs));
      }
      if (canPaint) {
        mergeWindowPayload(cachedWindow, cachedTechs);
        if (!hasLoadedOnceRef.current) {
          hasLoadedOnceRef.current = true;
          setHasLoadedOnce(true);
          setLoading(false);
        }
      }
      return canPaint;
    },
    [includeUndated, mergeWindowPayload]
  );

  const loadTechnicians = useCallback(async ({ background = false } = {}) => {
    const key = techniciansCacheKey();
    const cached = readSchedulerCache(key, STATIC_TECH_TTL_MS);
    const cachedTechnicians = cached?.technicians;

    if (hasCachedTechnicians(cachedTechnicians)) {
      setResources(normalizeSchedulerTechnicians(cachedTechnicians));
      if (background) {
        if (isCacheRecentlyFetched(key, STATIC_TECH_TTL_MS)) {
          return cachedTechnicians;
        }
        void (async () => {
          try {
            const payload = await fetchSchedulerTechnicians();
            writeSchedulerCache(key, payload);
            setResources(normalizeSchedulerTechnicians(payload.technicians || []));
          } catch (error) {
            console.error("Scheduler.technicians.revalidate", error);
          }
        })();
        return cachedTechnicians;
      }
      return cachedTechnicians;
    }

    const payload = await fetchSchedulerTechnicians();
    writeSchedulerCache(key, payload);
    const technicians = payload.technicians || [];
    setResources(normalizeSchedulerTechnicians(technicians));
    return technicians;
  }, [isCacheRecentlyFetched]);

  const resolveTechniciansForWindow = useCallback(
    (techniciansOverride) =>
      techniciansOverride ||
      readSchedulerCache(techniciansCacheKey(), STATIC_TECH_TTL_MS)?.technicians ||
      [],
    []
  );

  const revalidateWindowInBackground = useCallback(
    async (range, key, techniciansOverride, { signal, isStale, mutationEpoch } = {}) => {
      const epoch = mutationEpoch ?? mutationEpochRef.current;
      try {
        const payload = await fetchSchedulerWindowData(range, {
          includeUndated,
          dataVersion: dataVersionRef.current,
          signal,
        });

        if (isStale?.() || mutationEpochRef.current !== epoch) return;

        if (payload.unchanged) {
          if (payload.dataVersion) {
            dataVersionRef.current = payload.dataVersion;
            setDataVersion(payload.dataVersion);
          }
          return;
        }

        writeSchedulerCache(key, payload);
        if (isStale?.() || mutationEpochRef.current !== epoch) return;
        mergeWindowPayload(payload, resolveTechniciansForWindow(techniciansOverride));
      } catch (error) {
        if (isAbortError(error)) return;
        console.error("Scheduler.window.revalidate", error);
      }
    },
    [includeUndated, mergeWindowPayload, resolveTechniciansForWindow]
  );

  const loadWindow = useCallback(
    async (
      range,
      {
        background = false,
        techniciansOverride,
        signal,
        isStale,
        prefetchOnly = false,
        mutationEpoch,
      } = {}
    ) => {
      const epoch = mutationEpoch ?? mutationEpochRef.current;
      const key = windowCacheKey(range, includeUndated);
      const cached = readSchedulerCache(key, WINDOW_DATA_TTL_MS);
      const techs = resolveTechniciansForWindow(techniciansOverride);

      if (cached && background) {
        if (!prefetchOnly && !isStale?.()) {
          mergeWindowPayload(cached, techs);
        }
        if (!isCacheRecentlyFetched(key, WINDOW_DATA_TTL_MS)) {
          void revalidateWindowInBackground(range, key, techniciansOverride, {
            signal,
            isStale,
            mutationEpoch: epoch,
          });
        }
        return cached;
      }

      if (cached && !background) {
        if (!prefetchOnly && !isStale?.()) {
          mergeWindowPayload(cached, techs);
        }
        return cached;
      }

      const payload = await fetchSchedulerWindowData(range, {
        includeUndated,
        dataVersion: null,
        signal,
      });

      if (isStale?.() || mutationEpochRef.current !== epoch) return payload;

      if (payload.unchanged) {
        if (payload.dataVersion) {
          dataVersionRef.current = payload.dataVersion;
          if (!prefetchOnly && !isStale?.()) {
            setDataVersion(payload.dataVersion);
          }
        }
        return { unchanged: true, dataVersion: payload.dataVersion };
      }

      writeSchedulerCache(key, payload);
      if (prefetchOnly || isStale?.() || mutationEpochRef.current !== epoch) return payload;

      const freshTechs =
        techniciansOverride ||
        readSchedulerCache(techniciansCacheKey(), STATIC_TECH_TTL_MS)?.technicians ||
        (await loadTechnicians({ background: true }));
      if (isStale?.() || mutationEpochRef.current !== epoch) return payload;
      mergeWindowPayload(payload, freshTechs);
      return payload;
    },
    [
      includeUndated,
      loadTechnicians,
      mergeWindowPayload,
      revalidateWindowInBackground,
      resolveTechniciansForWindow,
      isCacheRecentlyFetched,
    ]
  );

  const prefetchWindow = useCallback(
    async (range) => {
      if (inFlightRefreshRef.current?.promise) return;

      const key = windowCacheKey(range, includeUndated);
      if (readSchedulerCache(key, WINDOW_DATA_TTL_MS)) return;

      const epoch = mutationEpochRef.current;
      try {
        const payload = await fetchSchedulerWindowData(range, {
          includeUndated,
          dataVersion: null,
        });
        if (!payload.unchanged && mutationEpochRef.current === epoch) {
          writeSchedulerCache(key, payload);
        }
      } catch (error) {
        if (!isAbortError(error)) {
          console.debug("Scheduler.window.prefetch", error);
        }
      }
    },
    [includeUndated]
  );

  const scheduleAdjacentPrefetch = useCallback(
    (mode, date) => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = setTimeout(() => {
        prefetchTimerRef.current = null;
        if (mode !== "day") return;
        const anchor = date instanceof Date ? date : new Date(date);
        void prefetchWindow(computeSchedulerFetchRange(mode, subDays(anchor, 1)));
        void prefetchWindow(computeSchedulerFetchRange(mode, addDays(anchor, 1)));
      }, PREFETCH_DELAY_MS);
    },
    [prefetchWindow]
  );

  const refreshData = useCallback(
    async (rangeOverride, { force = false, rangeKey: rangeKeyOverride } = {}) => {
      const range = isSchedulerRange(rangeOverride)
        ? rangeOverride
        : computeSchedulerFetchRange(viewMode, selectedDate);
      const rangeKey =
        rangeKeyOverride ?? `${schedulerFetchRangeKey(range)}|undated:${includeUndated}`;

      const mutationEpoch = mutationEpochRef.current;
      const inFlight = inFlightRefreshRef.current;
      if (
        !force &&
        inFlight?.rangeKey === rangeKey &&
        inFlight.promise &&
        inFlight.mutationEpoch === mutationEpoch
      ) {
        return inFlight.promise;
      }

      if (inFlight?.rangeKey !== rangeKey || inFlight?.mutationEpoch !== mutationEpoch) {
        windowAbortRef.current?.abort();
      }

      const seq = ++requestSeqRef.current;
      const controller = new AbortController();
      windowAbortRef.current = controller;

      const isStale = () =>
        requestSeqRef.current !== seq ||
        fetchRangeKeyRef.current !== rangeKey ||
        mutationEpochRef.current !== mutationEpoch;

      const runRefresh = async () => {
        const wasAlreadyLoaded = hasLoadedOnceRef.current;

        if (!wasAlreadyLoaded) {
          setLoading(true);
        }

        try {
          const techKey = techniciansCacheKey();
          const windowKey = windowCacheKey(range, includeUndated);
          if (force) {
            invalidateSchedulerCache(techKey);
            invalidateSchedulerCache(windowKey);
          }

          const cachedTechs = !force
            ? readSchedulerCache(techKey, STATIC_TECH_TTL_MS)?.technicians
            : null;
          const cachedWindow = !force ? readSchedulerCache(windowKey, WINDOW_DATA_TTL_MS) : null;
          const canPaintFromCache =
            Boolean(cachedWindow) && hasCachedTechnicians(cachedTechs);

          if (hasCachedTechnicians(cachedTechs) && !isStale()) {
            setResources(normalizeSchedulerTechnicians(cachedTechs));
          }
          if (canPaintFromCache && !isStale()) {
            mergeWindowPayload(cachedWindow, cachedTechs);
            if (!hasLoadedOnceRef.current) {
              hasLoadedOnceRef.current = true;
              setHasLoadedOnce(true);
              setLoading(false);
            }
          }

          const technicians = await loadTechnicians({
            background: Boolean(hasCachedTechnicians(cachedTechs)),
          });
          if (isStale()) return;

          await loadWindow(range, {
            background: canPaintFromCache,
            techniciansOverride: technicians,
            signal: controller.signal,
            isStale,
            mutationEpoch,
          });

          if (!isStale() && wasAlreadyLoaded) {
            scheduleAdjacentPrefetch(viewMode, selectedDate);
          }
        } catch (error) {
          if (isAbortError(error)) return;
          console.error("Scheduler.fetch", error);
          if (!isStale()) fetchRangeKeyRef.current = "";
        } finally {
          if (!isStale()) {
            setLoading(false);
            hasLoadedOnceRef.current = true;
            setHasLoadedOnce(true);
          }
        }
      };

      const promise = runRefresh();
      inFlightRefreshRef.current = { rangeKey, promise, mutationEpoch };
      try {
        return await promise;
      } finally {
        if (inFlightRefreshRef.current?.promise === promise) {
          inFlightRefreshRef.current = null;
        }
      }
    },
    [
      viewMode,
      selectedDate,
      includeUndated,
      loadTechnicians,
      loadWindow,
      mergeWindowPayload,
      scheduleAdjacentPrefetch,
    ]
  );

  const invalidateCurrentRange = useCallback(() => {
    const range = computeSchedulerFetchRange(viewMode, selectedDate);
    invalidateSchedulerCache(windowCacheKey(range, includeUndated));
  }, [viewMode, selectedDate, includeUndated]);

  const patchEvent = useCallback(
    (updatedEvent) => {
      if (!updatedEvent) return;
      mutationEpochRef.current += 1;
      bumpSchedulerWindowFetchGeneration();
      markLocalSchedulerMutation(updatedEvent);
      windowAbortRef.current?.abort();
      inFlightRefreshRef.current = null;

      setEvents((prev) => {
        const id = updatedEvent.technicianJobId ?? updatedEvent.id;
        const idx = prev.findIndex(
          (e) => (e.technicianJobId ?? e.id) === id
        );
        if (idx === -1) return [...prev, updatedEvent];
        const next = [...prev];
        next[idx] = { ...next[idx], ...updatedEvent };
        return next;
      });

      const range = computeSchedulerFetchRange(viewMode, selectedDate);
      patchSchedulerWindowCacheEvent(
        windowCacheKey(range, includeUndated),
        updatedEvent
      );
    },
    [viewMode, selectedDate, includeUndated]
  );

  const replaceEventsForJob = useCallback(
    (jobId, nextEvents) => {
      if (jobId == null) return;
      const incoming = Array.isArray(nextEvents) ? nextEvents : [];
      mutationEpochRef.current += 1;
      bumpSchedulerWindowFetchGeneration();
      markLocalSchedulerMutation(incoming[0], { jobId });
      windowAbortRef.current?.abort();
      inFlightRefreshRef.current = null;

      const jobIdStr = String(jobId);
      setEvents((prev) => {
        const others = prev.filter(
          (evt) => evt?.jobId == null || String(evt.jobId) !== jobIdStr
        );
        return [...others, ...incoming];
      });

      const range = computeSchedulerFetchRange(viewMode, selectedDate);
      replaceSchedulerWindowCacheEventsForJob(
        windowCacheKey(range, includeUndated),
        jobId,
        incoming
      );
    },
    [viewMode, selectedDate, includeUndated]
  );

  useEffect(() => {
    if (!enabled) return;
    const range = computeSchedulerFetchRange(viewMode, selectedDate);
    const rangeKey = `${schedulerFetchRangeKey(range)}|undated:${includeUndated}`;
    if (fetchRangeKeyRef.current === rangeKey && hasLoadedOnceRef.current) return;

    fetchRangeKeyRef.current = rangeKey;
    windowAbortRef.current?.abort();
    requestSeqRef.current += 1;

    paintFromCache(range);

    if (navDebounceRef.current) clearTimeout(navDebounceRef.current);
    navDebounceRef.current = setTimeout(() => {
      navDebounceRef.current = null;
      refreshData(range, { rangeKey });
    }, NAV_DEBOUNCE_MS);

    return () => {
      if (navDebounceRef.current) {
        clearTimeout(navDebounceRef.current);
        navDebounceRef.current = null;
      }
    };
  }, [enabled, viewMode, selectedDate, includeUndated, refreshData, paintFromCache]);

  useEffect(
    () => () => {
      windowAbortRef.current?.abort();
      if (navDebounceRef.current) clearTimeout(navDebounceRef.current);
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    },
    []
  );

  const isInitialLoad = loading && !hasLoadedOnce;
  const isRefreshing = loading && hasLoadedOnce;

  return {
    resources,
    setResources,
    events,
    setEvents,
    calendarEvents,
    undatedByTech,
    loading,
    isInitialLoad,
    isRefreshing,
    hasLoadedOnceRef,
    dataVersion,
    dataVersionRef,
    refreshData,
    invalidateCurrentRange,
    patchEvent,
    replaceEventsForJob,
    loadWindow,
    loadTechnicians,
  };
}
