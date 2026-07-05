import { APP_TIMEZONE, toSingaporeYmd } from "../utils/singaporeDateTime.js";
import {
  fetchCalendarEventsForRange,
  fetchTechnicianSchedulesForIds,
} from "../calendar/calendarEvents.js";
import {
  enrichAttendanceGroup as enrichGroup,
  enrichAttendanceGroup,
  getExpectedWorkForDay,
  getCalendarBadgesForDay,
  getAttendanceVarianceFlags,
} from "../calendar/availability.js";

export {
  enrichAttendanceGroup,
  getExpectedWorkForDay,
  getCalendarBadgesForDay,
  getAttendanceVarianceFlags,
};

export function getAttendanceEmployeeName(punch) {
  const tech = punch?.technician;
  return tech?.full_name || tech?.user?.username || "Unknown";
}

export function getPortalLoginFromPunch(punch) {
  const updatedAt = punch?.technician?.user?.updated_at;
  const clockIn = punch?.clock_in;
  if (!updatedAt || !clockIn) return null;
  const loginDay = toSingaporeYmd(updatedAt);
  const punchDay = toSingaporeYmd(clockIn);
  if (loginDay && punchDay && loginDay === punchDay) return updatedAt;
  return null;
}

export function getAttendanceMinutes(punch) {
  if (punch?.duration_minutes != null) return punch.duration_minutes;
  if (punch?.clock_in && punch?.clock_out) {
    const diff = (new Date(punch.clock_out) - new Date(punch.clock_in)) / 60000;
    return diff > 0 ? Math.round(diff) : null;
  }
  return null;
}

export function formatAttendanceDateDisplay(iso) {
  if (!iso) return "";
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    timeZone: APP_TIMEZONE,
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

export function getAttendanceStatusBadge(group) {
  if (group?.isWorking) {
    return group.isOnBreak
      ? { label: "On break", bg: "info" }
      : { label: "Working", bg: "success" };
  }
  return { label: "Off duty", bg: "secondary" };
}

export function isUnusuallyLongMinutes(minutes) {
  return minutes != null && minutes > 720;
}

export async function enrichAttendanceGroups(groups, supabase, { startIso, endIso } = {}) {
  if (!supabase || !groups?.length) return groups || [];

  const technicianIds = [...new Set(groups.map((g) => g.technicianId).filter(Boolean))];
  const startDate = startIso ? toSingaporeYmd(startIso) : groups[0]?.dateKey;
  const endDate = endIso ? toSingaporeYmd(endIso) : groups[groups.length - 1]?.dateKey;

  const [calendarResult, schedulesByTech] = await Promise.all([
    fetchCalendarEventsForRange(supabase, {
      startDate,
      endDate,
      technicianIds,
    }),
    fetchTechnicianSchedulesForIds(supabase, technicianIds),
  ]);

  const calendarEvents = calendarResult.data || [];

  return groups.map((group) =>
    enrichGroup(group, {
      employeeSchedule: schedulesByTech[group.technicianId],
      calendarEvents,
    })
  );
}

/**
 * Group flat attendance punches into one row per technician + Singapore calendar day.
 */
export function groupAttendanceByTechnicianAndDate(punches) {
  const groupsMap = new Map();

  for (const punch of punches || []) {
    const techId = punch.technician_id || punch.technician?.id || "unknown";
    const dateKey = toSingaporeYmd(punch.clock_in);
    if (!dateKey) continue;

    const groupKey = `${techId}|${dateKey}`;
    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, {
        id: groupKey,
        technicianId: techId,
        workerViewId:
          punch.technician?.user_id ||
          punch.technician?.user?.id ||
          null,
        employee: getAttendanceEmployeeName(punch),
        username: punch.technician?.user?.username || null,
        dateKey,
        dateDisplay: formatAttendanceDateDisplay(punch.clock_in),
        punches: [],
        portalLogin: getPortalLoginFromPunch(punch),
      });
    }

    const group = groupsMap.get(groupKey);
    group.punches.push(punch);
    if (!group.workerViewId) {
      group.workerViewId =
        punch.technician?.user_id ||
        punch.technician?.user?.id ||
        null;
    }
    const portal = getPortalLoginFromPunch(punch);
    if (portal && !group.portalLogin) group.portalLogin = portal;
  }

  const groups = [];
  for (const group of groupsMap.values()) {
    group.punches.sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in));

    const openPunch = group.punches.find((p) => p.clock_out == null);
    group.isWorking = Boolean(openPunch);
    group.isOnBreak = Boolean(openPunch?.is_break);

    group.firstIn = group.punches[0]?.clock_in || null;
    const closedOuts = group.punches
      .map((p) => p.clock_out)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a));
    group.lastOut = closedOuts[0] || null;

    let dayTotalMinutes = 0;
    let hasOpenWithoutMinutes = false;
    for (const p of group.punches) {
      const mins = getAttendanceMinutes(p);
      if (mins != null && mins > 0) {
        dayTotalMinutes += mins;
      } else if (!p.clock_out) {
        hasOpenWithoutMinutes = true;
      }
    }
    group.dayTotalMinutes =
      dayTotalMinutes > 0 ? dayTotalMinutes : hasOpenWithoutMinutes ? null : dayTotalMinutes || null;
    group.punchCount = group.punches.length;

    group.lastClockIn = group.punches.reduce((max, p) => {
      if (!p.clock_in) return max;
      return !max || new Date(p.clock_in) > new Date(max) ? p.clock_in : max;
    }, null);

    groups.push(group);
  }

  groups.sort((a, b) => {
    const dateCmp = b.dateKey.localeCompare(a.dateKey);
    if (dateCmp !== 0) return dateCmp;
    return a.employee.localeCompare(b.employee);
  });

  return groups;
}

