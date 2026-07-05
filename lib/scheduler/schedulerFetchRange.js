import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";

/** Padding so overnight / carry-over jobs still appear at day boundaries. */
const RANGE_PAD_DAYS = 7;

/**
 * Visible date window for scheduler API fetches (ISO strings).
 * Keeps payloads small vs loading full assignment history.
 */
export function computeSchedulerFetchRange(viewMode, selectedDate) {
  const anchor = selectedDate instanceof Date ? selectedDate : new Date(selectedDate);

  if (viewMode === "month") {
    const start = subDays(startOfMonth(anchor), RANGE_PAD_DAYS);
    const end = addDays(endOfMonth(anchor), RANGE_PAD_DAYS);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (viewMode === "week") {
    const start = subDays(startOfWeek(anchor, { weekStartsOn: 1 }), 1);
    const end = addDays(endOfWeek(anchor, { weekStartsOn: 1 }), 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  // Day view: previous calendar day through next (overnight strip ends ~7am next day).
  const start = subDays(startOfDay(anchor), 1);
  const end = addDays(endOfDay(anchor), 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function schedulerFetchRangeKey(range) {
  if (!range?.start || !range?.end) return "";
  return `${range.start}|${range.end}`;
}
