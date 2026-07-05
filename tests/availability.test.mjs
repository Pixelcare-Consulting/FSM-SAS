import assert from "node:assert/strict";

import {
  AVAILABILITY_ISSUE_TYPES,
  ATTENDANCE_VARIANCE_TYPES,
  getAttendanceVarianceFlags,
  getCalendarBadgesForDay,
  getExpectedWorkForDay,
  getTechnicianAvailabilityIssues,
  companyEventsCoverDate,
  technicianOnLeaveDate,
} from "../lib/calendar/availability.js";
import { eventCoversDate } from "../lib/calendar/calendarEvents.js";
import { DEFAULT_WORKER_SCHEDULE } from "../lib/technicians/employeeProfile.js";

const schedule = DEFAULT_WORKER_SCHEDULE;

assert.equal(eventCoversDate({ startDate: "2026-01-01", endDate: "2026-01-03" }, "2026-01-02"), true);
assert.equal(eventCoversDate({ startDate: "2026-01-01", endDate: "2026-01-03" }, "2026-01-04"), false);

const mondayWork = getExpectedWorkForDay(schedule, "2026-06-15");
assert.equal(mondayWork.isWorkingDay, true);
assert.match(mondayWork.shiftSummary, /Working/);

const saturdayOff = getExpectedWorkForDay(schedule, "2026-06-20");
assert.equal(saturdayOff.isWorkingDay, false);

const calendarEvents = [
  {
    scope: "company",
    eventType: "holiday",
    title: "National Day",
    startDate: "2026-08-09",
    endDate: "2026-08-09",
  },
  {
    scope: "technician",
    technicianId: "tech-1",
    eventType: "leave",
    title: "Annual Leave",
    startDate: "2026-06-16",
    endDate: "2026-06-16",
  },
];

const badges = getCalendarBadgesForDay(calendarEvents, "2026-08-09", "tech-1");
assert.equal(badges.some((b) => b.eventType === "holiday"), true);

const leaveIssues = getTechnicianAvailabilityIssues({
  dateLike: "2026-06-16T10:00:00+08:00",
  employeeSchedule: schedule,
  calendarEvents,
  technicianId: "tech-1",
  technicianName: "Alex",
});
assert.equal(leaveIssues.issues.includes(AVAILABILITY_ISSUE_TYPES.ON_LEAVE), true);

const holidayIssues = getTechnicianAvailabilityIssues({
  dateLike: "2026-08-09T09:00:00+08:00",
  employeeSchedule: schedule,
  calendarEvents,
  technicianId: "tech-1",
});
assert.equal(holidayIssues.issues.includes(AVAILABILITY_ISSUE_TYPES.COMPANY_HOLIDAY), true);

const variance = getAttendanceVarianceFlags({
  ymd: "2026-06-15",
  employeeSchedule: schedule,
  calendarEvents,
  technicianId: "tech-1",
  punchCount: 0,
});
assert.equal(
  variance.some((v) => v.type === ATTENDANCE_VARIANCE_TYPES.EXPECTED_WORK_NO_PUNCH),
  true
);

const leavePunchVariance = getAttendanceVarianceFlags({
  ymd: "2026-06-16",
  employeeSchedule: schedule,
  calendarEvents,
  technicianId: "tech-1",
  punchCount: 1,
});
assert.equal(
  leavePunchVariance.some((v) => v.type === ATTENDANCE_VARIANCE_TYPES.LEAVE_BUT_PUNCHED),
  true
);

assert.equal(companyEventsCoverDate(calendarEvents, "2026-08-09"), true);
assert.equal(technicianOnLeaveDate(calendarEvents, "tech-1", "2026-06-16"), true);

console.log("availability tests passed");
