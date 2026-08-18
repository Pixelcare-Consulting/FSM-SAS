import { format, isValid, parseISO, startOfDay } from "date-fns";

export const SCHEDULER_VIEW_MODES = ["day", "week", "month"];
const DATE_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function firstQueryValue(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function parseSchedulerDateParam(value) {
  const raw = String(firstQueryValue(value) || "").trim();
  if (!DATE_YMD_RE.test(raw)) return null;
  const parsed = parseISO(raw);
  return isValid(parsed) ? startOfDay(parsed) : null;
}

export function parseSchedulerViewParam(value) {
  const view = String(firstQueryValue(value) || "")
    .trim()
    .toLowerCase();
  return SCHEDULER_VIEW_MODES.includes(view) ? view : null;
}

export function formatSchedulerDateParam(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
}

export function buildSchedulerAsPath(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (key === "date" || key === "view") continue;
    const raw = firstQueryValue(value);
    if (raw == null || raw === "") continue;
    params.set(key, String(raw));
  }
  const date = firstQueryValue(query?.date);
  const view = firstQueryValue(query?.view);
  if (date) params.set("date", String(date));
  if (view) params.set("view", String(view));
  const qs = params.toString();
  return qs ? `/scheduler?${qs}` : "/scheduler";
}
