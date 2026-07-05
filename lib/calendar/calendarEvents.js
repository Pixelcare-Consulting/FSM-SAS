import { toSingaporeYmd } from "../utils/singaporeDateTime.js";
import {
  TECHNICIAN_EMPLOYEE_TABLES,
  normalizeScheduleRows,
} from "../technicians/employeeProfile.js";

export const CALENDAR_SCOPES = Object.freeze({
  COMPANY: "company",
  TECHNICIAN: "technician",
});

export const CALENDAR_EVENT_TYPES = Object.freeze({
  HOLIDAY: "holiday",
  COMPANY_DAY_OFF: "company_day_off",
  LEAVE: "leave",
  MEDICAL: "medical",
  OTHER: "other",
});

export const CALENDAR_EVENT_TYPE_LABELS = {
  holiday: "Holiday",
  company_day_off: "Company day off",
  leave: "Leave",
  medical: "Medical",
  other: "Other",
};

export const CALENDAR_EVENT_COLORS = {
  holiday: "#dc2626",
  company_day_off: "#d97706",
  leave: "#2563eb",
  medical: "#7c3aed",
  other: "#64748b",
};

const REST_IN_CHUNK = 100;

/** Slim select for date-range list reads (attendance, availability). */
export const CALENDAR_EVENTS_RANGE_SELECT =
  "id, scope, technician_id, event_type, title, start_date, end_date, all_day, start_time, end_time";

/** Columns required by normalizeScheduleRows for attendance enrichment. */
export const TECHNICIAN_SCHEDULE_RANGE_SELECT =
  "technician_id, day_key, day_of_week, is_working, shift_number, start_time, end_time";

function chunkIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const chunks = [];
  for (let i = 0; i < unique.length; i += REST_IN_CHUNK) {
    chunks.push(unique.slice(i, i + REST_IN_CHUNK));
  }
  return chunks;
}

export function normalizeCalendarEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    scope: row.scope,
    technicianId: row.technician_id ?? null,
    eventType: row.event_type,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    allDay: row.all_day !== false,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function eventCoversDate(event, ymd) {
  if (!event || !ymd) return false;
  const start = event.startDate ?? event.start_date;
  const end = event.endDate ?? event.end_date;
  if (!start || !end) return false;
  return start <= ymd && end >= ymd;
}

export function eventCoversDateTime(event, dateLike) {
  if (!dateLike) return false;
  const ymd =
    typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)
      ? dateLike
      : toSingaporeYmd(dateLike);
  return eventCoversDate(event, ymd);
}

export function groupEventsByDate(events, { startDate, endDate } = {}) {
  const map = new Map();
  for (const raw of events || []) {
    const event = normalizeCalendarEventRow(raw);
    if (!event) continue;
    const from = startDate && startDate > event.startDate ? startDate : event.startDate;
    const to = endDate && endDate < event.endDate ? endDate : event.endDate;
    if (from > to) continue;

    let cursor = from;
    while (cursor <= to) {
      if (!map.has(cursor)) map.set(cursor, []);
      map.get(cursor).push(event);
      cursor = incrementYmd(cursor);
    }
  }
  return map;
}

function incrementYmd(ymd) {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function fetchCalendarEventsForRange(
  supabase,
  { startDate, endDate, scope = null, technicianIds = null } = {}
) {
  if (!supabase || !startDate || !endDate) {
    return { data: [], error: new Error("startDate and endDate are required") };
  }

  let query = supabase
    .from("calendar_events")
    .select(CALENDAR_EVENTS_RANGE_SELECT)
    .is("deleted_at", null)
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date", { ascending: true });

  if (scope) query = query.eq("scope", scope);

  if (Array.isArray(technicianIds) && technicianIds.length > 0) {
    const unique = [...new Set(technicianIds.filter(Boolean))];
    if (unique.length === 1) {
      query = query.or(`scope.eq.company,technician_id.eq.${unique[0]}`);
    } else {
      query = query.or(
        `scope.eq.company,technician_id.in.(${unique.join(",")})`
      );
    }
  }

  const { data, error } = await query;
  if (error) return { data: [], error };

  return {
    data: (data || []).map(normalizeCalendarEventRow),
    error: null,
  };
}

function validateEventPayload(payload, { partial = false } = {}) {
  const errors = [];
  const scope = payload.scope;
  const eventType = payload.eventType ?? payload.event_type;
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const startDate = payload.startDate ?? payload.start_date;
  const endDate = payload.endDate ?? payload.end_date ?? startDate;
  const technicianId = payload.technicianId ?? payload.technician_id ?? null;

  if (!partial || scope !== undefined) {
    if (!["company", "technician"].includes(scope)) {
      errors.push("Invalid scope");
    }
  }

  if (!partial || eventType !== undefined) {
    const companyTypes = ["holiday", "company_day_off"];
    const techTypes = ["leave", "medical", "other"];
    if (scope === "company" && !companyTypes.includes(eventType)) {
      errors.push("Invalid event type for company scope");
    }
    if (scope === "technician" && !techTypes.includes(eventType)) {
      errors.push("Invalid event type for technician scope");
    }
  }

  if (!partial || title !== undefined) {
    if (!title) errors.push("Title is required");
  }

  if (!partial || startDate !== undefined) {
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      errors.push("Valid start date is required");
    }
    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      errors.push("Valid end date is required");
    }
    if (startDate && endDate && endDate < startDate) {
      errors.push("End date must be on or after start date");
    }
  }

  if (!partial || scope !== undefined) {
    if (scope === "company" && technicianId) {
      errors.push("Company events cannot have a technician");
    }
    if (scope === "technician" && !technicianId) {
      errors.push("Technician is required for leave events");
    }
  }

  return { errors, normalized: { scope, eventType, title, startDate, endDate, technicianId } };
}

function toDbRow(payload, createdBy = null) {
  return {
    scope: payload.scope,
    technician_id: payload.scope === "technician" ? payload.technicianId : null,
    event_type: payload.eventType,
    title: payload.title,
    start_date: payload.startDate,
    end_date: payload.endDate,
    all_day: payload.allDay !== false,
    start_time: payload.startTime ?? null,
    end_time: payload.endTime ?? null,
    notes: payload.notes ?? null,
    ...(createdBy ? { created_by: createdBy } : {}),
  };
}

export async function fetchCalendarEventById(supabase, id) {
  if (!supabase || !id) {
    return { data: null, error: new Error("Event id is required") };
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error("Calendar event not found") };
  return { data: normalizeCalendarEventRow(data), error: null };
}

export async function createCalendarEvent(supabase, payload, createdBy = null) {
  const { errors, normalized } = validateEventPayload(payload);
  if (errors.length) return { data: null, error: new Error(errors.join("; ")) };

  const row = toDbRow({ ...payload, ...normalized }, createdBy);
  const { data, error } = await supabase
    .from("calendar_events")
    .insert(row)
    .select("*")
    .single();

  if (error) return { data: null, error };
  return { data: normalizeCalendarEventRow(data), error: null };
}

export async function updateCalendarEvent(supabase, id, payload) {
  const { errors, normalized } = validateEventPayload(payload, { partial: true });
  if (errors.length) return { data: null, error: new Error(errors.join("; ")) };

  const patch = {};
  if (normalized.scope !== undefined) patch.scope = normalized.scope;
  if (normalized.eventType !== undefined) patch.event_type = normalized.eventType;
  if (payload.title !== undefined) patch.title = normalized.title;
  if (normalized.startDate !== undefined) patch.start_date = normalized.startDate;
  if (normalized.endDate !== undefined) patch.end_date = normalized.endDate;
  if (payload.allDay !== undefined) patch.all_day = payload.allDay !== false;
  if (payload.startTime !== undefined) patch.start_time = payload.startTime;
  if (payload.endTime !== undefined) patch.end_time = payload.endTime;
  if (payload.notes !== undefined) patch.notes = payload.notes;

  if (normalized.scope === "company") {
    patch.technician_id = null;
  } else if (normalized.scope === "technician" && normalized.technicianId) {
    patch.technician_id = normalized.technicianId;
  } else if (payload.technicianId !== undefined || payload.technician_id !== undefined) {
    patch.technician_id = normalized.technicianId;
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error("Calendar event not found") };
  return { data: normalizeCalendarEventRow(data), error: null };
}

export async function softDeleteCalendarEvent(supabase, id) {
  const { data, error } = await supabase
    .from("calendar_events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error("Calendar event not found") };
  return { data: normalizeCalendarEventRow(data), error: null };
}

export async function fetchTechnicianSchedulesForIds(supabase, technicianIds = []) {
  const unique = [...new Set((technicianIds || []).filter(Boolean))];
  if (!unique.length || !supabase) return {};

  const merged = [];
  for (const batch of chunkIds(unique)) {
    const { data, error } = await supabase
      .from(TECHNICIAN_EMPLOYEE_TABLES.schedules)
      .select(TECHNICIAN_SCHEDULE_RANGE_SELECT)
      .in("technician_id", batch)
      .is("deleted_at", null);

    if (error) throw error;
    if (data?.length) merged.push(...data);
  }

  const byTechnician = {};
  for (const row of merged) {
    if (!byTechnician[row.technician_id]) byTechnician[row.technician_id] = [];
    byTechnician[row.technician_id].push(row);
  }

  return Object.fromEntries(
    Object.entries(byTechnician).map(([id, rows]) => [
      id,
      normalizeScheduleRows(rows),
    ])
  );
}

export function calendarEventToFullCalendarEvent(event) {
  const normalized = normalizeCalendarEventRow(event);
  if (!normalized) return null;

  const color = CALENDAR_EVENT_COLORS[normalized.eventType] || "#64748b";
  const endExclusive = incrementYmd(normalized.endDate);

  return {
    id: normalized.id,
    title: normalized.title,
    start: normalized.startDate,
    end: endExclusive,
    allDay: true,
    backgroundColor: color,
    borderColor: color,
    extendedProps: normalized,
  };
}
