export const TECHNICIAN_EMPLOYEE_TABLES = {
  employment: "technician_employment_details",
  access: "technician_access_settings",
  payroll: "technician_payroll_profiles",
  schedules: "technician_schedules",
  documents: "technician_documents",
  other: "technician_other_details",
};

export const WEEK_DAYS = [
  { key: "monday", label: "Monday", dayOfWeek: 1 },
  { key: "tuesday", label: "Tuesday", dayOfWeek: 2 },
  { key: "wednesday", label: "Wednesday", dayOfWeek: 3 },
  { key: "thursday", label: "Thursday", dayOfWeek: 4 },
  { key: "friday", label: "Friday", dayOfWeek: 5 },
  { key: "saturday", label: "Saturday", dayOfWeek: 6 },
  { key: "sunday", label: "Sunday", dayOfWeek: 0 },
];

export const DEFAULT_WORKER_SCHEDULE = WEEK_DAYS.reduce((schedule, day) => {
  schedule[day.key] = {
    isWorking: day.key !== "saturday" && day.key !== "sunday",
    firstStart: "08:00",
    firstEnd: "12:00",
    secondStart: "13:00",
    secondEnd: "17:00",
  };
  return schedule;
}, {});

const EMPTY_PROFILE = {
  employment: {},
  access: {},
  payroll: {},
  schedule: DEFAULT_WORKER_SCHEDULE,
  documents: [],
  other: {},
};

export const normalizeTime = (value) => {
  if (!value) return "";
  const parts = String(value).split(":");
  if (parts.length < 2) return "";
  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
};

export const timeToSeconds = (value) => {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 3600 + minutes * 60;
};

export const cloneDefaultWorkerSchedule = () =>
  JSON.parse(JSON.stringify(DEFAULT_WORKER_SCHEDULE));

export const normalizeScheduleRows = (rows = []) => {
  const schedule = cloneDefaultWorkerSchedule();

  rows
    .filter((row) => row && !row.deleted_at)
    .forEach((row) => {
      const day = WEEK_DAYS.find(
        (candidate) =>
          candidate.key === row.day_key ||
          candidate.dayOfWeek === Number(row.day_of_week)
      );
      if (!day) return;

      if (!schedule[day.key]) {
        schedule[day.key] = cloneDefaultWorkerSchedule()[day.key];
      }

      schedule[day.key].isWorking = row.is_working !== false;

      if (Number(row.shift_number) === 1) {
        schedule[day.key].firstStart = normalizeTime(row.start_time);
        schedule[day.key].firstEnd = normalizeTime(row.end_time);
      }

      if (Number(row.shift_number) === 2) {
        schedule[day.key].secondStart = normalizeTime(row.start_time);
        schedule[day.key].secondEnd = normalizeTime(row.end_time);
      }
    });

  return schedule;
};

export const scheduleToRows = (technicianId, schedule = DEFAULT_WORKER_SCHEDULE) =>
  WEEK_DAYS.flatMap((day) => {
    const daySchedule = schedule[day.key] || DEFAULT_WORKER_SCHEDULE[day.key];
    const baseRow = {
      technician_id: technicianId,
      day_of_week: day.dayOfWeek,
      day_key: day.key,
      is_working: Boolean(daySchedule?.isWorking),
      effective_from: new Date().toISOString().slice(0, 10),
      deleted_at: null,
    };

    return [
      {
        ...baseRow,
        shift_number: 1,
        start_time: normalizeTime(daySchedule?.firstStart) || null,
        end_time: normalizeTime(daySchedule?.firstEnd) || null,
      },
      {
        ...baseRow,
        shift_number: 2,
        start_time: normalizeTime(daySchedule?.secondStart) || null,
        end_time: normalizeTime(daySchedule?.secondEnd) || null,
      },
    ];
  });

export const isDateWithinTechnicianSchedule = (schedule, dateLike) => {
  if (!schedule || Object.keys(schedule).length === 0 || !dateLike) return true;

  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return true;

  const day = WEEK_DAYS.find((candidate) => candidate.dayOfWeek === date.getDay());
  const daySchedule = day ? schedule[day.key] : null;
  if (!daySchedule) return true;
  if (!daySchedule.isWorking) return false;

  const currentSeconds = date.getHours() * 3600 + date.getMinutes() * 60;
  const windows = [
    [daySchedule.firstStart, daySchedule.firstEnd],
    [daySchedule.secondStart, daySchedule.secondEnd],
  ];

  return windows.some(([start, end]) => {
    const startSeconds = timeToSeconds(start);
    const endSeconds = timeToSeconds(end);
    if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) {
      return false;
    }
    return currentSeconds >= startSeconds && currentSeconds < endSeconds;
  });
};

export const fetchTechnicianEmployeeProfile = async (supabase, technicianId) => {
  if (!supabase || !technicianId) return EMPTY_PROFILE;

  const [employment, access, payroll, schedules, documents, other] = await Promise.all([
    supabase
      .from(TECHNICIAN_EMPLOYEE_TABLES.employment)
      .select("*")
      .eq("technician_id", technicianId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from(TECHNICIAN_EMPLOYEE_TABLES.access)
      .select("*")
      .eq("technician_id", technicianId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from(TECHNICIAN_EMPLOYEE_TABLES.payroll)
      .select("*")
      .eq("technician_id", technicianId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from(TECHNICIAN_EMPLOYEE_TABLES.schedules)
      .select("*")
      .eq("technician_id", technicianId)
      .is("deleted_at", null)
      .order("day_of_week", { ascending: true })
      .order("shift_number", { ascending: true }),
    supabase
      .from(TECHNICIAN_EMPLOYEE_TABLES.documents)
      .select("*")
      .eq("technician_id", technicianId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from(TECHNICIAN_EMPLOYEE_TABLES.other)
      .select("*")
      .eq("technician_id", technicianId)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  const ignoredMissingTableCodes = new Set(["42P01", "PGRST205"]);
  const responses = [employment, access, payroll, schedules, documents, other];
  const unexpectedError = responses.find(
    (response) =>
      response?.error && !ignoredMissingTableCodes.has(response.error.code)
  )?.error;

  if (unexpectedError) {
    throw unexpectedError;
  }

  return {
    employment: employment.data || {},
    access: access.data || {},
    payroll: payroll.data || {},
    schedule: normalizeScheduleRows(schedules.data || []),
    documents: documents.data || [],
    other: other.data || {},
  };
};

export const upsertTechnicianProfileSection = async (
  supabase,
  tableName,
  technicianId,
  values
) => {
  const payload = {
    ...values,
    technician_id: technicianId,
    deleted_at: null,
  };

  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;

  const { data, error } = await supabase
    .from(tableName)
    .upsert(payload, { onConflict: "technician_id" })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const replaceTechnicianSchedule = async (supabase, technicianId, schedule) => {
  const rows = scheduleToRows(technicianId, schedule);

  const { error: deleteError } = await supabase
    .from(TECHNICIAN_EMPLOYEE_TABLES.schedules)
    .delete()
    .eq("technician_id", technicianId);

  if (deleteError) throw deleteError;

  const { data, error } = await supabase
    .from(TECHNICIAN_EMPLOYEE_TABLES.schedules)
    .insert(rows)
    .select();

  if (error) throw error;
  return normalizeScheduleRows(data || rows);
};

export const createTechnicianDocument = async (supabase, technicianId, values) => {
  const { data, error } = await supabase
    .from(TECHNICIAN_EMPLOYEE_TABLES.documents)
    .insert({
      ...values,
      technician_id: technicianId,
      deleted_at: null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteTechnicianDocument = async (supabase, documentId) => {
  const { error } = await supabase
    .from(TECHNICIAN_EMPLOYEE_TABLES.documents)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId);

  if (error) throw error;
};
