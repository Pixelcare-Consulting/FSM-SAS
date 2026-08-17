/**
 * Job status settings: defaults + fetch from Supabase.
 * For components that must avoid pulling in Supabase at load time,
 * import from utils/jobStatusDefaults.js instead.
 */

import { buildJobStatusesList } from "../lib/jobs/buildJobStatusesList";
import { readCachedDashboardBootstrap } from "./dashboardBootstrapCache";
import {
  formatJobStatusDisplayLabel,
  getDefaultJobStatuses,
  getJobStatusColorFromList,
  getJobStatusLabelFromList,
  readCachedJobStatuses,
  isJobStatusesCacheFresh,
  writeCachedJobStatuses,
  JOB_STATUS_CACHE_TTL_MS,
} from "./jobStatusDefaults";

export {
  formatJobStatusDisplayLabel,
  getDefaultJobStatuses,
  getJobStatusColorFromList,
  getJobStatusLabelFromList,
  readCachedJobStatuses,
  writeCachedJobStatuses,
  isJobStatusesCacheFresh,
  JOB_STATUS_CACHE_TTL_MS,
};

let fetchJobStatusesInFlight = null;

/**
 * Fetch job statuses: SAP U_API_JOB_STATUS is the source of truth (ID + label).
 * Settings overlay color only (matched by SAP ID or SAP label). Created and In Progress are prepended as portal-only extras.
 */
export const fetchJobStatuses = async ({ force = false } = {}) => {
  if (!force && isJobStatusesCacheFresh()) {
    const cached = readCachedJobStatuses();
    if (Array.isArray(cached) && cached.length > 0) return cached;
  }

  if (fetchJobStatusesInFlight) return fetchJobStatusesInFlight;

  fetchJobStatusesInFlight = (async () => {
    let settingsTypes = null;
    let sapSnapshot = null;
    try {
      const bootstrapCached = !force ? readCachedDashboardBootstrap() : null;
      const bootstrapValue = bootstrapCached?.jobStatuses;
      if (bootstrapValue) {
        settingsTypes = bootstrapValue.types || null;
        sapSnapshot = Array.isArray(bootstrapValue.sapSnapshot) ? bootstrapValue.sapSnapshot : null;
      } else {
        const { getSupabaseClient } = await import("../lib/supabase/client");
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data: settings, error } = await supabase
            .from("settings")
            .select("value")
            .eq("id", "jobStatuses")
            .single();
          if (!error && settings?.value) {
            settingsTypes = settings.value.types || null;
            sapSnapshot = Array.isArray(settings.value.sapSnapshot) ? settings.value.sapSnapshot : null;
          }
        }
      }
    } catch (e) {
      console.warn("Job statuses settings fetch failed:", e?.message);
    }

    const snapshotList = buildJobStatusesList({
      settingsTypes,
      sapRows: sapSnapshot || [],
    });

    if (!force && sapSnapshot?.length > 0 && isJobStatusesCacheFresh()) {
      writeCachedJobStatuses(snapshotList);
      return snapshotList;
    }

    try {
      const res = await fetch("/api/getJobStatus", { method: "GET", credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const apiList = buildJobStatusesList({
          settingsTypes,
          sapRows: Array.isArray(data) ? data : [],
          sapSnapshot: sapSnapshot || [],
        });
        if (apiList.length > 0) {
          writeCachedJobStatuses(apiList);
          return apiList;
        }
      }
    } catch (err) {
      console.warn("Job statuses from API failed, falling back to snapshot/defaults:", err?.message);
    }

    if (snapshotList.length > 0) {
      writeCachedJobStatuses(snapshotList);
      return snapshotList;
    }

    return getDefaultJobStatuses();
  })();

  try {
    return await fetchJobStatusesInFlight;
  } finally {
    fetchJobStatusesInFlight = null;
  }
};
