/**
 * Pure defaults and helpers for job status display.
 * No Supabase or other side effects - safe to import from any chunk.
 * Colors come from Dashboard → Settings → Job Statuses (via fetchJobStatuses); this file has no hex fallbacks.
 */

const DEFAULT_JOB_STATUSES = {
  created: { name: "Created", value: "CREATED" },
  unconfirmed: { name: "Unconfirmed", value: "UNCONFIRMED" },
  confirmed: { name: "Confirmed", value: "CONFIRMED" },
  inprogress: { name: "In Progress", value: "IN_PROGRESS" },
  completed: { name: "Completed", value: "COMPLETED" },
  scheduled: { name: "Scheduled", value: "SCHEDULED" },
  rescheduled: { name: "Rescheduled", value: "RESCHEDULED" },
  cancelled: { name: "Cancelled", value: "CANCELLED" },
};

export const getDefaultJobStatuses = () =>
  Object.entries(DEFAULT_JOB_STATUSES).map(([id, s]) => ({ id, ...s }));

const JOB_STATUS_CACHE_KEY = "fsm_job_statuses_cache_v1";
export const JOB_STATUS_CACHE_TTL_MS = 15 * 60 * 1000;

/** Last fetched Settings/SAP status list — instant colors on scheduler revisit. */
export function readCachedJobStatuses() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(JOB_STATUS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.list;
    if (!Array.isArray(list) || list.length === 0) return null;
    const hasColor = list.some(
      (row) => row?.color != null && String(row.color).trim() !== ""
    );
    return hasColor ? list : null;
  } catch {
    return null;
  }
}

export function readCachedJobStatusesMeta() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(JOB_STATUS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { list: parsed, cachedAt: null };
    }
    if (parsed && Array.isArray(parsed.list)) {
      return { list: parsed.list, cachedAt: parsed.cachedAt ?? null };
    }
    return null;
  } catch {
    return null;
  }
}

export function isJobStatusesCacheFresh(ttlMs = JOB_STATUS_CACHE_TTL_MS) {
  const meta = readCachedJobStatusesMeta();
  if (!meta?.list?.length) return false;
  if (!meta.cachedAt) return false;
  return Date.now() - meta.cachedAt < ttlMs;
}

export function writeCachedJobStatuses(list) {
  if (typeof window === "undefined" || !Array.isArray(list) || list.length === 0) return;
  try {
    window.localStorage.setItem(
      JOB_STATUS_CACHE_KEY,
      JSON.stringify({ list, cachedAt: Date.now() })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/** Resolved color from the merged status list, or undefined if none is configured. */
export const getJobStatusColorFromList = (statusValue, jobStatusesList) => {
  const e = findJobStatusEntry(statusValue, jobStatusesList);
  const c = e?.color;
  return c != null && String(c).trim() !== "" ? c : undefined;
};

/**
 * UI label for statuses: underscores → spaces, collapse whitespace, title case each word.
 */
export function formatJobStatusDisplayLabel(text) {
  if (text == null || text === "") return "";
  const normalized = String(text)
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return normalized.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export const getJobStatusLabelFromList = (statusValue, jobStatusesList) => {
  if (!statusValue) return formatJobStatusDisplayLabel("N/A");
  if (!jobStatusesList?.length) return formatJobStatusDisplayLabel(String(statusValue));
  const str = String(statusValue).trim();
  // Match by exact value first (for SAP numeric U_JobStatusID e.g. "554", "-5")
  const foundExact = jobStatusesList.find((s) => String(s.value || "").trim() === str);
  if (foundExact?.name) return formatJobStatusDisplayLabel(foundExact.name);
  const key = str.toUpperCase().replace(/\s+/g, "_");
  const found = jobStatusesList.find((s) => (s.value || "").toUpperCase().replace(/\s+/g, "_") === key);
  return formatJobStatusDisplayLabel(found?.name ?? String(statusValue));
};

const normStatusKey = (x) => String(x ?? "").trim().toUpperCase().replace(/\s+/g, "_");

/**
 * Find a status row from Settings / SAP merged list (same source as Create Job badges).
 */
export function findJobStatusEntry(statusValue, jobStatusesList) {
  if (!jobStatusesList?.length || statusValue == null || String(statusValue).trim() === "") {
    return null;
  }
  const str = String(statusValue).trim();
  const exact = jobStatusesList.find((s) => String(s.value ?? "").trim() === str);
  if (exact) return exact;
  const key = normStatusKey(str);
  const byVal = jobStatusesList.find((s) => normStatusKey(s.value) === key);
  if (byVal) return byVal;
  return jobStatusesList.find((s) => normStatusKey(s.name) === key) ?? null;
}

/**
 * Apex “Performance Overview” series order: Completed, Created, In Progress.
 * Each color is taken from Settings-backed list only; use `undefined` when not configured (charts may substitute).
 */
export function getPerformanceOverviewBarColors(jobStatusesList) {
  if (!Array.isArray(jobStatusesList) || jobStatusesList.length === 0) {
    return [undefined, undefined, undefined];
  }

  const hasColor = (c) => c != null && String(c).trim() !== "";
  const norm = (s) => String(s ?? "").trim().toLowerCase();

  const pickByHeuristic = (predicate) => {
    for (const row of jobStatusesList) {
      if (!row) continue;
      const label = `${norm(row.name)} ${norm(row.value)}`.trim();
      if (!label) continue;
      if (!predicate(label)) continue;
      if (hasColor(row.color)) return row.color;
    }
    return undefined;
  };

  const completed = pickByHeuristic(
    (label) =>
      label.includes("complete") ||
      label.includes("completed") ||
      label.includes("job done") ||
      label.includes("done") ||
      label.includes("repair complete")
  );
  const created = pickByHeuristic(
    (label) =>
      label.includes("created") ||
      label.includes("unconfirmed") ||
      label.includes("pending") ||
      label.includes("unassigned") ||
      label.includes("customer request")
  );
  const inProgress = pickByHeuristic(
    (label) =>
      label.includes("in progress") ||
      label.includes("progress") ||
      label.includes("quotation") ||
      label.includes("working") ||
      label.includes("ongoing")
  );

  return [completed, created, inProgress];
}
