import { toSingaporeYmd } from "../utils/singaporeDateTime.js";
import {
  WEEK_DAYS,
  isDateWithinTechnicianSchedule,
} from "../technicians/employeeProfile.js";
import {
  CALENDAR_EVENT_TYPE_LABELS,
  eventCoversDate,
  normalizeCalendarEventRow,
} from "./calendarEvents.js";

const LEAVE_EVENT_TYPES = new Set(["leave", "medical", "other"]);

export const AVAILABILITY_ISSUE_TYPES = Object.freeze({
  OUTSIDE_SCHEDULE: "outside_schedule",
  COMPANY_HOLIDAY: "company_holiday",
  COMPANY_DAY_OFF: "company_day_off",
  ON_LEAVE: "on_leave",
});

export const ATTENDANCE_VARIANCE_TYPES = Object.freeze({
  EXPECTED_WORK_NO_PUNCH: "expected_work_no_punch",
  LEAVE_BUT_PUNCHED: "leave_but_punched",
  HOLIDAY_BUT_PUNCHED: "holiday_but_punched",
});

function normalizeEvents(events) {
  return (events || []).map((event) =>
    event?.scope ? event : normalizeCalendarEventRow(event)
  );
}

function getDayKeyFromDateLike(dateLike) {
  if (!dateLike) return "";
  if (typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
    return dateLike;
  }
  return toSingaporeYmd(dateLike);
}

function getWeekdayKeyFromYmd(ymd) {
  const date = new Date(`${ymd}T12:00:00Z`);
  const day = WEEK_DAYS.find((candidate) => candidate.dayOfWeek === date.getUTCDay());
  return day?.key ?? null;
}

export function getEventsForDate(events, ymd, { scope = null, technicianId = null } = {}) {
  const normalized = normalizeEvents(events);
  return normalized.filter((event) => {
    if (!eventCoversDate(event, ymd)) return false;
    if (scope && event.scope !== scope) return false;
    if (technicianId && event.scope === "technician" && event.technicianId !== technicianId) {
      return false;
    }
    return true;
  });
}

export function getTechnicianAvailabilityIssues({
  dateLike,
  employeeSchedule,
  calendarEvents,
  technicianId,
  technicianName = "Technician",
} = {}) {
  const issues = [];
  const labels = [];
  const ymd = getDayKeyFromDateLike(dateLike);
  const events = normalizeEvents(calendarEvents);

  if (employeeSchedule && dateLike && !isDateWithinTechnicianSchedule(employeeSchedule, dateLike)) {
    issues.push(AVAILABILITY_ISSUE_TYPES.OUTSIDE_SCHEDULE);
    labels.push(
      `${technicianName} is outside their configured employee schedule for this time.`
    );
  }

  const companyEvents = getEventsForDate(events, ymd, { scope: "company" });
  for (const event of companyEvents) {
    if (event.eventType === "holiday") {
      if (!issues.includes(AVAILABILITY_ISSUE_TYPES.COMPANY_HOLIDAY)) {
        issues.push(AVAILABILITY_ISSUE_TYPES.COMPANY_HOLIDAY);
        labels.push(`Company holiday: ${event.title}.`);
      }
    } else if (event.eventType === "company_day_off") {
      if (!issues.includes(AVAILABILITY_ISSUE_TYPES.COMPANY_DAY_OFF)) {
        issues.push(AVAILABILITY_ISSUE_TYPES.COMPANY_DAY_OFF);
        labels.push(`Company day off: ${event.title}.`);
      }
    }
  }

  if (technicianId) {
    const leaveEvents = getEventsForDate(events, ymd, {
      scope: "technician",
      technicianId,
    }).filter((event) => LEAVE_EVENT_TYPES.has(event.eventType));

    if (leaveEvents.length > 0) {
      issues.push(AVAILABILITY_ISSUE_TYPES.ON_LEAVE);
      const title = leaveEvents.map((event) => event.title).join(", ");
      labels.push(`Technician is on approved leave (${title}).`);
    }
  }

  return { issues, labels, ymd };
}

export function getExpectedWorkForDay(employeeSchedule, ymd) {
  const dayKey = getWeekdayKeyFromYmd(ymd);
  if (!dayKey || !employeeSchedule) {
    return { isWorkingDay: false, shiftSummary: "No schedule configured" };
  }

  const daySchedule = employeeSchedule[dayKey];
  if (!daySchedule?.isWorking) {
    const label = WEEK_DAYS.find((d) => d.key === dayKey)?.label ?? dayKey;
    return { isWorkingDay: false, shiftSummary: `Day off (${label.slice(0, 3)})` };
  }

  const parts = [];
  if (daySchedule.firstStart && daySchedule.firstEnd) {
    parts.push(`${daySchedule.firstStart}–${daySchedule.firstEnd}`);
  }
  if (daySchedule.secondStart && daySchedule.secondEnd) {
    parts.push(`${daySchedule.secondStart}–${daySchedule.secondEnd}`);
  }

  const shiftSummary =
    parts.length > 0 ? `Working ${parts.join(", ")}` : "Working (hours not set)";
  return { isWorkingDay: true, shiftSummary };
}

export function getCalendarBadgesForDay(calendarEvents, ymd, technicianId = null) {
  const badges = [];
  const companyEvents = getEventsForDate(calendarEvents, ymd, { scope: "company" });
  for (const event of companyEvents) {
    badges.push({
      scope: "company",
      eventType: event.eventType,
      label: CALENDAR_EVENT_TYPE_LABELS[event.eventType] || event.title,
      title: event.title,
      variant: event.eventType === "holiday" ? "danger" : "warning",
    });
  }

  if (technicianId) {
    const leaveEvents = getEventsForDate(calendarEvents, ymd, {
      scope: "technician",
      technicianId,
    });
    for (const event of leaveEvents) {
      badges.push({
        scope: "technician",
        eventType: event.eventType,
        label: CALENDAR_EVENT_TYPE_LABELS[event.eventType] || event.title,
        title: event.title,
        variant: event.eventType === "medical" ? "primary" : "info",
      });
    }
  }

  return badges;
}

export function getAttendanceVarianceFlags({
  ymd,
  employeeSchedule,
  calendarEvents,
  technicianId,
  punchCount = 0,
} = {}) {
  const flags = [];
  const { isWorkingDay } = getExpectedWorkForDay(employeeSchedule, ymd);
  const badges = getCalendarBadgesForDay(calendarEvents, ymd, technicianId);
  const onLeave = badges.some(
    (badge) => badge.scope === "technician" && LEAVE_EVENT_TYPES.has(badge.eventType)
  );
  const onHoliday = badges.some(
    (badge) => badge.scope === "company" && badge.eventType === "holiday"
  );
  const hasPunches = punchCount > 0;

  if (isWorkingDay && !hasPunches && !onLeave && !onHoliday) {
    flags.push({
      type: ATTENDANCE_VARIANCE_TYPES.EXPECTED_WORK_NO_PUNCH,
      label: "Expected work, no punch",
      variant: "warning",
    });
  }

  if (onLeave && hasPunches) {
    flags.push({
      type: ATTENDANCE_VARIANCE_TYPES.LEAVE_BUT_PUNCHED,
      label: "On leave but punched",
      variant: "warning",
    });
  }

  if (onHoliday && hasPunches) {
    flags.push({
      type: ATTENDANCE_VARIANCE_TYPES.HOLIDAY_BUT_PUNCHED,
      label: "Holiday but punched",
      variant: "info",
    });
  }

  return flags;
}

export function enrichAttendanceGroup(group, { employeeSchedule, calendarEvents } = {}) {
  const ymd = group.dateKey;
  const technicianId = group.technicianId;
  const expected = getExpectedWorkForDay(employeeSchedule, ymd);
  const calendarBadges = getCalendarBadgesForDay(calendarEvents, ymd, technicianId);
  const varianceFlags = getAttendanceVarianceFlags({
    ymd,
    employeeSchedule,
    calendarEvents,
    technicianId,
    punchCount: group.punchCount ?? 0,
  });

  return {
    ...group,
    expectedWork: expected.shiftSummary,
    isExpectedWorkingDay: expected.isWorkingDay,
    calendarBadges,
    varianceFlags,
    hasVariance: varianceFlags.length > 0,
    isOnLeaveDay: calendarBadges.some(
      (badge) => badge.scope === "technician" && LEAVE_EVENT_TYPES.has(badge.eventType)
    ),
    isCompanyHolidayDay: calendarBadges.some(
      (badge) => badge.scope === "company" && badge.eventType === "holiday"
    ),
  };
}

export function companyEventsCoverDate(calendarEvents, ymd) {
  return getEventsForDate(calendarEvents, ymd, { scope: "company" }).length > 0;
}

export function technicianOnLeaveDate(calendarEvents, technicianId, ymd) {
  return getEventsForDate(calendarEvents, ymd, { scope: "technician", technicianId }).some(
    (event) => LEAVE_EVENT_TYPES.has(event.eventType)
  );
}
