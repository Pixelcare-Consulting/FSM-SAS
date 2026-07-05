import {
  addDays,
  endOfMonth,
  endOfWeek,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { toSingaporeYmd } from "../utils/singaporeDateTime";

/** Customer appointment window end — not work duration. */
function getAppointmentEndDate(evt) {
  const startMs = new Date(evt.start).getTime();
  const endMs = new Date(evt.end).getTime();
  if (Number.isFinite(endMs) && Number.isFinite(startMs) && endMs > startMs) {
    return new Date(endMs);
  }
  return Number.isFinite(startMs) ? new Date(startMs) : new Date(endMs);
}

function eventOverlapsView(evt, viewMode, selectedDate) {
  const eventStart = new Date(evt.start);
  const eventEnd = new Date(evt.end);

  if (viewMode === "day") {
    const selectedDay = startOfDay(selectedDate);
    return (
      isSameDay(eventStart, selectedDay) ||
      isSameDay(eventEnd, selectedDay) ||
      (eventStart < selectedDay && eventEnd > selectedDay)
    );
  }
  if (viewMode === "week") {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return eventStart <= weekEnd && eventEnd >= weekStart;
  }
  if (viewMode === "month") {
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    return eventStart <= monthEnd && eventEnd >= monthStart;
  }
  return true;
}

function eventOnDay(evt, day) {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);
  const jobStart = new Date(evt.start);
  const jobEnd = getAppointmentEndDate(evt);
  return jobStart <= dayEnd && jobEnd >= dayStart;
}

/**
 * Build Map<technicianId, Map<ymd, Event[]>> for day/week/month views.
 * Month view uses ymd of event start for badge grouping.
 */
export function buildEventsByTechAndDay(events, viewMode, selectedDate) {
  const byTech = new Map();
  const viewFiltered = (events || []).filter((evt) =>
    eventOverlapsView(evt, viewMode, selectedDate)
  );

  const ensureTechDay = (techId, ymd) => {
    const techKey = String(techId);
    if (!byTech.has(techKey)) byTech.set(techKey, new Map());
    const dayMap = byTech.get(techKey);
    if (!dayMap.has(ymd)) dayMap.set(ymd, []);
    return dayMap.get(ymd);
  };

  if (viewMode === "week") {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    for (const evt of viewFiltered) {
      const techId = evt.resourceId || evt.technicianId;
      if (!techId) continue;
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const day = addDays(weekStart, dayIndex);
        if (!eventOnDay(evt, day)) continue;
        const ymd = toSingaporeYmd(day);
        ensureTechDay(techId, ymd).push(evt);
      }
    }
    return byTech;
  }

  if (viewMode === "day") {
    const ymd = toSingaporeYmd(selectedDate);
    for (const evt of viewFiltered) {
      const techId = evt.resourceId || evt.technicianId;
      if (!techId) continue;
      ensureTechDay(techId, ymd).push(evt);
    }
    return byTech;
  }

  if (viewMode === "month") {
    for (const evt of viewFiltered) {
      const techId = evt.resourceId || evt.technicianId;
      if (!techId) continue;
      const ymd = toSingaporeYmd(new Date(evt.start));
      ensureTechDay(techId, ymd).push(evt);
    }
    return byTech;
  }

  return byTech;
}

export function getEventsForTechAndDay(eventsByTechAndDay, techId, ymd) {
  const dayMap = eventsByTechAndDay.get(String(techId));
  return dayMap?.get(ymd) || [];
}
