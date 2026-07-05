/**
 * Data loaders for dashboard reports (browser or server Supabase client).
 */

import { computeTechnicianLaborHours } from "./computeTechnicianLaborHours.js";
import { applyMultiTokenIlikeFilters, paginatedSelect } from "./listQueryHelpers.js";

export function normalizeStatusKey(s) {
  if (!s) return "";
  return String(s).trim().toUpperCase().replace(/\s+/g, "_");
}

export function statusesMatch(filterLabel, jobStatus) {
  const a = normalizeStatusKey(filterLabel);
  const b = normalizeStatusKey(jobStatus);
  if (a === b) return true;
  return a.replace(/_/g, "") === b.replace(/_/g, "");
}

export async function fetchReportTechnicians(supabase) {
  if (!supabase) return { data: [], error: new Error("No Supabase client") };
  const { data, error } = await supabase
    .from("technicians")
    .select("id, full_name")
    .is("deleted_at", null)
    .order("full_name");
  return { data: data || [], error };
}

export async function fetchJobsForStatusReport(supabase, { limit = 800 } = {}) {
  if (!supabase) return { data: [], error: new Error("No Supabase client") };
  const { data, error } = await supabase
    .from("jobs")
    .select(
      `
      id,
      job_number,
      title,
      status,
      scheduled_start,
      scheduled_end,
      created_at,
      customer:customer_id(customer_code, customer_name),
      job_category(description),
      technician_jobs(
        deleted_at,
        technician_id,
        started_at,
        completed_at,
        technician:technician_id(
          id,
          full_name,
          user:users!technicians_user_id_fkey(username)
        )
      )
    `
    )
    .is("deleted_at", null)
    .order("scheduled_start", { ascending: false, nullsFirst: false })
    .limit(limit);

  return { data: data || [], error };
}

export function filterJobsReportRows(jobs, { status, search, dateFrom, dateTo, technicianId }) {
  const rows = (jobs || []).map((job) => {
    const categories = Array.isArray(job.job_category)
      ? job.job_category
      : job.job_category
        ? [job.job_category]
        : [];
    const catDesc = categories[0]?.description || "—";
    const techs = (job.technician_jobs || []).filter((tj) => !tj.deleted_at);
    const techLabel =
      techs
        .map((tj) => tj.technician?.full_name || tj.technician?.user?.username || "")
        .filter(Boolean)
        .join(", ") || "—";
    return { raw: job, catDesc, techLabel, techs };
  });

  let out = rows;

  if (status && status !== "All") {
    out = out.filter(({ raw }) => statusesMatch(status, raw.status));
  }

  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    out = out.filter(({ raw, techLabel }) => {
      const num = String(raw.job_number || "").toLowerCase();
      const title = String(raw.title || "").toLowerCase();
      const cust = `${raw.customer?.customer_name || ""} ${raw.customer?.customer_code || ""}`.toLowerCase();
      return num.includes(q) || title.includes(q) || cust.includes(q) || techLabel.toLowerCase().includes(q);
    });
  }

  if (technicianId) {
    out = out.filter(({ techs }) => techs.some((tj) => tj.technician_id === technicianId));
  }

  if (dateFrom && dateTo) {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    out = out.filter(({ raw }) => {
      const src = raw.scheduled_start || raw.created_at;
      if (!src) return false;
      const d = new Date(src);
      return d >= from && d <= to;
    });
  }

  return out;
}

export async function fetchFormsReportData(
  supabase,
  { signatureLimit = 150, mediaLimit = 150, dateFrom, dateTo, formType, techFilter } = {}
) {
  if (!supabase) return { googleForms: [], signatureRows: [], mediaRows: [], error: new Error("No Supabase client") };

  const gf = await supabase
    .from("google_forms")
    .select("id, name, url, is_active, created_at")
    .is("deleted_at", null)
    .order("name");

  let sigQuery = supabase
    .from("job_signatures")
    .select("id, signed_at, customer_name, customer_feedback, technician_job_id")
    .order("signed_at", { ascending: false })
    .limit(signatureLimit);

  if (dateFrom) sigQuery = sigQuery.gte("signed_at", dateFrom);
  if (dateTo) sigQuery = sigQuery.lte("signed_at", dateTo);

  let medQuery = supabase
    .from("job_media")
    .select("id, created_at, filename, media_type, image_url, job_id, technician_job_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(mediaLimit);

  if (dateFrom) medQuery = medQuery.gte("created_at", dateFrom);
  if (dateTo) medQuery = medQuery.lte("created_at", dateTo);

  const sigRes = await sigQuery;
  const medRes = await medQuery;

  const error = gf.error || sigRes.error || medRes.error;
  if (error) {
    return { googleForms: [], signatureRows: [], mediaRows: [], error };
  }

  const signatures = sigRes.data || [];
  const tjIds = [...new Set(signatures.map((s) => s.technician_job_id).filter(Boolean))];
  let tjMap = new Map();
  let jobMap = new Map();
  let techMap = new Map();

  if (tjIds.length > 0) {
    const { data: tjs } = await supabase.from("technician_jobs").select("id, job_id, technician_id").in("id", tjIds);
    for (const tj of tjs || []) tjMap.set(tj.id, tj);
    const jobIds = [...new Set((tjs || []).map((t) => t.job_id).filter(Boolean))];
    const techIds = [...new Set((tjs || []).map((t) => t.technician_id).filter(Boolean))];
    if (jobIds.length > 0) {
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, job_number, title, customer:customer_id(customer_name)")
        .in("id", jobIds);
      for (const j of jobs || []) jobMap.set(j.id, j);
    }
    if (techIds.length > 0) {
      const { data: techs } = await supabase.from("technicians").select("id, full_name").in("id", techIds);
      for (const t of techs || []) techMap.set(t.id, t);
    }
  }

  const signatureRows = signatures.map((s) => {
    const tj = tjMap.get(s.technician_job_id);
    const job = tj ? jobMap.get(tj.job_id) : null;
    const tech = tj ? techMap.get(tj.technician_id) : null;
    return {
      ...s,
      jobNumber: job?.job_number || "—",
      jobTitle: job?.title || "—",
      customerName: job?.customer?.customer_name || "—",
      technicianName: tech?.full_name || "—",
    };
  });

  const media = medRes.data || [];
  const medTjIds = [...new Set(media.map((m) => m.technician_job_id).filter(Boolean))];
  const medJobIds = [...new Set(media.map((m) => m.job_id).filter(Boolean))];
  let medTjMap = new Map();
  let medJobMap = new Map();
  let medTechMap = new Map();

  if (medTjIds.length > 0) {
    const { data: tjs } = await supabase.from("technician_jobs").select("id, technician_id").in("id", medTjIds);
    for (const tj of tjs || []) medTjMap.set(tj.id, tj);
    const techIds = [...new Set((tjs || []).map((t) => t.technician_id).filter(Boolean))];
    if (techIds.length > 0) {
      const { data: techs } = await supabase.from("technicians").select("id, full_name").in("id", techIds);
      for (const t of techs || []) medTechMap.set(t.id, t);
    }
  }
  if (medJobIds.length > 0) {
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, job_number, title, customer:customer_id(customer_name)")
      .in("id", medJobIds);
    for (const j of jobs || []) medJobMap.set(j.id, j);
  }

  let mediaRows = media.map((m) => {
    const job = medJobMap.get(m.job_id);
    const tj = m.technician_job_id ? medTjMap.get(m.technician_job_id) : null;
    const tech = tj ? medTechMap.get(tj.technician_id) : null;
    return {
      ...m,
      jobNumber: job?.job_number || "—",
      customerName: job?.customer?.customer_name || "—",
      technicianName: tech?.full_name || "—",
    };
  });

  let filteredSignatures = signatureRows;
  let filteredMedia = mediaRows;

  if (formType === "signoff") {
    filteredMedia = [];
  } else if (formType === "media") {
    filteredSignatures = [];
  }

  const techQ = String(techFilter || "").trim().toLowerCase();
  if (techQ) {
    filteredSignatures = filteredSignatures.filter((r) =>
      (r.technicianName || "").toLowerCase().includes(techQ)
    );
    filteredMedia = filteredMedia.filter((r) => (r.technicianName || "").toLowerCase().includes(techQ));
  }

  return {
    googleForms: gf.data || [],
    signatureRows: filteredSignatures,
    mediaRows: filteredMedia,
    error: null,
  };
}

export async function fetchJobsForMonthlyCharts(supabase, year, { limit = 6000 } = {}) {
  if (!supabase) return { data: [], error: new Error("No Supabase client") };
  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, scheduled_start, created_at")
    .is("deleted_at", null)
    .limit(limit);

  if (error) return { data: [], error };

  const y = Number(year);
  const inYear = (d) => {
    if (!d) return false;
    return new Date(d).getFullYear() === y;
  };

  const filtered = (data || []).filter((j) => inYear(j.scheduled_start) || (!j.scheduled_start && inYear(j.created_at)));

  const byMonth = Array.from({ length: 12 }, (_, m) => ({
    month: m + 1,
    jobs: 0,
    completed: 0,
    statuses: {},
  }));

  for (const j of filtered) {
    const d = new Date(j.scheduled_start || j.created_at);
    const m = d.getMonth();
    byMonth[m].jobs += 1;
    const st = normalizeStatusKey(j.status);
    if (st.includes("COMPLETE") || st === "COMPLETED") byMonth[m].completed += 1;
    const key = j.status || "Unknown";
    byMonth[m].statuses[key] = (byMonth[m].statuses[key] || 0) + 1;
  }

  const technicianProductivity = []; // filled if we add a separate query later
  return { data: filtered, byMonth, technicianProductivity, error: null };
}

export async function fetchTechniciansWithJobsInYear(supabase, year) {
  if (!supabase) return { data: [], error: null };
  const y = Number(year);
  const { data: tjRows, error } = await supabase
    .from("technician_jobs")
    .select(
      `
      technician_id,
      job:job_id(scheduled_start, created_at, deleted_at, status)
    `
    )
    .is("deleted_at", null)
    .limit(8000);

  if (error) return { data: [], error };

  const counts = {};
  for (const row of tjRows || []) {
    const job = row.job;
    if (!job || job.deleted_at) continue;
    const d = job.scheduled_start || job.created_at;
    if (!d || new Date(d).getFullYear() !== y) continue;
    const tid = row.technician_id;
    if (!tid) continue;
    counts[tid] = (counts[tid] || 0) + 1;
  }

  const ids = Object.keys(counts);
  if (ids.length === 0) return { data: [], error: null };

  const { data: techs, error: te } = await supabase.from("technicians").select("id, full_name").in("id", ids);
  if (te) return { data: [], error: te };

  const list = (techs || []).map((t) => ({ name: t.full_name || t.id, jobs: counts[t.id] || 0 }));
  list.sort((a, b) => b.jobs - a.jobs);
  return { data: list, error: null };
}

export {
  getAttendanceMinutes,
  groupAttendanceByTechnicianAndDate,
  getAttendanceStatusBadge,
  getAttendanceEmployeeName,
  formatAttendanceDateDisplay,
} from "./attendanceUtils.js";

/** Slim attendance select for period summaries (server API routes). */
export const ATTENDANCE_PERIOD_SELECT = `
  id,
  technician_id,
  duration_minutes,
  clock_in,
  clock_out,
  is_break,
  technician:technician_id(
    id,
    user_id,
    full_name,
    is_online,
    user:users!technicians_user_id_fkey(id, username, is_logged_in, updated_at)
  )
`;

export async function fetchAttendanceForPeriod(supabase, startIso, endIso) {
  if (!supabase) return { data: [], error: new Error("No Supabase client") };
  const { data, error } = await supabase
    .from("attendance")
    .select(ATTENDANCE_PERIOD_SELECT)
    .gte("clock_in", startIso)
    .lte("clock_in", endIso)
    .order("clock_in", { ascending: false })
    .limit(5000);

  return { data: data || [], error };
}

export function aggregateAttendanceByTechnician(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const t = row.technician;
    const id = t?.id || "unknown";
    const name = t?.full_name || t?.user?.username || "Unknown";
    if (!map.has(id)) map.set(id, { id, name, totalMinutes: 0, punches: 0 });
    const rec = map.get(id);
    const mins = row.duration_minutes;
    if (mins != null && mins > 0) rec.totalMinutes += mins;
    else if (row.clock_in && row.clock_out) {
      const diff = (new Date(row.clock_out) - new Date(row.clock_in)) / 60000;
      if (diff > 0) rec.totalMinutes += Math.round(diff);
    }
    rec.punches += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
}

/** Portal job statuses that mean work is finished (for labor inference + assignment sync). */
export function isJobStatusCompletedForLabor(status) {
  if (status == null) return false;
  const s = normalizeStatusKey(status);
  if (!s) return false;
  if (s.includes("INCOMPLETE") || s.includes("NOT_COMPLET")) return false;
  if (s.includes("JOB_DONE")) return true;
  return s.includes("COMPLET") || s === "COMPLETE" || s === "JOB_COMPLETE";
}

function isCompletedForLaborInference(row) {
  if (normalizeStatusKey(row?.assignment_status) === "COMPLETED") return true;
  return isJobStatusCompletedForLabor(row?.job?.status);
}

function shouldTrustCompletedAt(row) {
  if (normalizeStatusKey(row?.assignment_status) === "COMPLETED") return true;
  if (isJobStatusCompletedForLabor(row?.job?.status)) return true;
  const asn = normalizeStatusKey(row?.assignment_status);
  if ((asn === "STARTED" || asn === "ASSIGNED") && !isJobStatusCompletedForLabor(row?.job?.status)) {
    return false;
  }
  if (row?.completed_at) return true;
  return false;
}

function scheduleWindowLaborHours(row) {
  const schedStart = row?.job?.scheduled_start ? new Date(row.job.scheduled_start).getTime() : NaN;
  const schedEnd = row?.job?.scheduled_end ? new Date(row.job.scheduled_end).getTime() : NaN;
  if (!Number.isFinite(schedStart) || !Number.isFinite(schedEnd) || schedEnd <= schedStart) return 0;
  return Math.round(((schedEnd - schedStart) / 3600000) * 10000) / 10000;
}

function inferLaborStartMsForIncentive(row) {
  if (row?.started_at) {
    const t = new Date(row.started_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (!isCompletedForLaborInference(row)) return NaN;
  const schedStart = row?.job?.scheduled_start ? new Date(row.job.scheduled_start).getTime() : NaN;
  return Number.isFinite(schedStart) ? schedStart : NaN;
}

function inferLaborEndMsForIncentive(row) {
  if (!isCompletedForLaborInference(row)) return NaN;
  if (shouldTrustCompletedAt(row) && row?.completed_at) {
    const t = new Date(row.completed_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  const schedEnd = row?.job?.scheduled_end ? new Date(row.job.scheduled_end).getTime() : NaN;
  if (!Number.isFinite(schedEnd)) return NaN;
  const start = inferLaborStartMsForIncentive(row);
  if (Number.isFinite(start) && schedEnd < start) return NaN;
  return schedEnd;
}

export function calculateTechnicianJobIncentive(row) {
  const rawRate = Number(row?.technician?.job_incentive_hourly_rate ?? 0);
  const incentiveRate = Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 0;

  if (!isCompletedForLaborInference(row)) {
    return { laborMs: 0, laborHours: 0, incentiveRate, incentiveAmount: 0 };
  }

  let laborHours = computeTechnicianLaborHours({
    started_at: row.started_at,
    completed_at: shouldTrustCompletedAt(row) ? row.completed_at : null,
    accumulated_hours: row.accumulated_hours,
    assignment_status: "COMPLETED",
    scheduled_start: row.job?.scheduled_start,
    scheduled_end: row.job?.scheduled_end,
  });

  if (laborHours <= 0) {
    laborHours = scheduleWindowLaborHours(row);
  }

  const laborMs = laborHours > 0 ? laborHours * 3600000 : 0;
  const incentiveAmount = Math.round(laborHours * incentiveRate * 100) / 100;

  return {
    laborMs,
    laborHours,
    incentiveRate,
    incentiveAmount,
  };
}

/**
 * Date used to decide whether a technician_job falls inside a reporting period.
 * Matches worker mental model: finished work → completion time, else in-progress → start, else scheduled job date.
 * Completed assignments without completed_at use scheduled_end (same as labor inference).
 * @returns {number} epoch ms, or NaN if no usable timestamp
 */
export function assignmentPeriodAnchorMs(row) {
  const schedEndMs = row?.job?.scheduled_end ? new Date(row.job.scheduled_end).getTime() : NaN;

  if (shouldTrustCompletedAt(row) && row?.completed_at) {
    const t = new Date(row.completed_at).getTime();
    if (Number.isFinite(t)) {
      if (Number.isFinite(schedEndMs) && t > schedEndMs + 2 * 86400000) {
        return schedEndMs;
      }
      return t;
    }
  }
  const inferredEnd = inferLaborEndMsForIncentive(row);
  if (Number.isFinite(inferredEnd)) return inferredEnd;
  if (row?.started_at) {
    const t = new Date(row.started_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  const sched = row?.job?.scheduled_start;
  if (sched) {
    const t = new Date(sched).getTime();
    if (Number.isFinite(t)) return t;
  }
  return NaN;
}

export function formatIncentiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "0.00";
  return amount.toFixed(2);
}

const TECHNICIAN_JOBS_LABOR_SELECT_BASIC = `
  id,
  started_at,
  completed_at,
  accumulated_hours,
  assignment_status,
  technician:technician_id(id, full_name, job_incentive_hourly_rate),
  job:job_id(job_number, title, customer:customer_id(customer_name), scheduled_start, scheduled_end, deleted_at, status)
`;

const TECHNICIAN_JOBS_LABOR_SELECT_DETAILED = `
  id,
  job_id,
  technician_id,
  started_at,
  completed_at,
  accumulated_hours,
  assignment_status,
  technician_hours(labor_hours, period_anchor_at),
  technician:technician_id(id, full_name, job_incentive_hourly_rate),
  job:job_id(
    id,
    job_number,
    title,
    description,
    status,
    priority,
    scheduled_start,
    scheduled_end,
    customer_id,
    deleted_at,
    customer:customer_id(customer_name, id),
    location:location_id(location_name, id)
  )
`;

const TECHNICIAN_HOURS_LABOR_REPORT_SELECT = `
  labor_hours,
  period_anchor_at,
  technician_id,
  technician_job_id,
  technician_jobs!inner(
    id,
    started_at,
    completed_at,
    accumulated_hours,
    assignment_status,
    deleted_at,
    technician:technician_id(id, full_name, job_incentive_hourly_rate),
    job:job_id(job_number, title, customer:customer_id(customer_name), scheduled_start, scheduled_end, deleted_at, status)
  )
`;

function mapTechnicianJobLaborRow(row, cachedLaborHours) {
  const { laborMs, laborHours, incentiveRate, incentiveAmount } = calculateTechnicianJobIncentive(row);
  const resolvedLaborHours =
    Number.isFinite(Number(cachedLaborHours)) && Number(cachedLaborHours) > 0
      ? Number(cachedLaborHours)
      : laborHours;
  const jobDate = row.job?.scheduled_start || row.started_at;
  return {
    ...row,
    laborHours: resolvedLaborHours,
    laborMs: resolvedLaborHours > 0 ? resolvedLaborHours * 3600000 : laborMs,
    incentiveRate,
    incentiveAmount,
    jobDate,
  };
}

/**
 * Server-optimized loader: SQL date filter on technician_hours.period_anchor_at (not JS scan of 5000 rows).
 */
export async function fetchTechnicianJobsLaborInPeriodServer(
  supabase,
  startMs,
  endMs,
  options = {}
) {
  if (!supabase) return { data: [], error: new Error("No Supabase client") };

  const start = Number(startMs);
  const end = Number(endMs);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { data: [], error: new Error("Invalid period bounds") };
  }

  const { technicianId, limit = 500 } = options;
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();
  const safeLimit = Math.min(Math.max(1, Number(limit) || 500), 500);

  let hoursQuery = supabase
    .from("technician_hours")
    .select(TECHNICIAN_HOURS_LABOR_REPORT_SELECT)
    .gte("period_anchor_at", startIso)
    .lte("period_anchor_at", endIso)
    .not("period_anchor_at", "is", null)
    .order("period_anchor_at", { ascending: false })
    .limit(safeLimit);

  if (technicianId) {
    hoursQuery = hoursQuery.eq("technician_id", technicianId);
  }

  const { data: hoursRows, error: hoursError } = await hoursQuery;

  if (!hoursError) {
    const rows = (hoursRows || [])
      .filter((th) => !th.technician_jobs?.deleted_at && !th.technician_jobs?.job?.deleted_at)
      .map((th) => mapTechnicianJobLaborRow(th.technician_jobs, th.labor_hours));
    return { data: rows, error: null };
  }

  console.warn(
    "fetchTechnicianJobsLaborInPeriodServer: technician_hours query failed, using fallback:",
    hoursError.message
  );

  return fetchTechnicianJobsLaborInPeriodSqlFallback(supabase, startMs, endMs, options);
}

/** SQL pre-filter on started_at / completed_at before assignmentPeriodAnchorMs refinement. */
async function fetchTechnicianJobsLaborInPeriodSqlFallback(
  supabase,
  startMs,
  endMs,
  options = {}
) {
  const start = Number(startMs);
  const end = Number(endMs);
  const { technicianId, limit = 500 } = options;
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();
  const safeLimit = Math.min(Math.max(1, Number(limit) || 500), 500);

  let completedQuery = supabase
    .from("technician_jobs")
    .select(TECHNICIAN_JOBS_LABOR_SELECT_BASIC)
    .is("deleted_at", null)
    .gte("completed_at", startIso)
    .lte("completed_at", endIso)
    .limit(safeLimit);

  let startedQuery = supabase
    .from("technician_jobs")
    .select(TECHNICIAN_JOBS_LABOR_SELECT_BASIC)
    .is("deleted_at", null)
    .gte("started_at", startIso)
    .lte("started_at", endIso)
    .limit(safeLimit);

  if (technicianId) {
    completedQuery = completedQuery.eq("technician_id", technicianId);
    startedQuery = startedQuery.eq("technician_id", technicianId);
  }

  const [completedRes, startedRes] = await Promise.all([completedQuery, startedQuery]);
  if (completedRes.error) return { data: [], error: completedRes.error };
  if (startedRes.error) return { data: [], error: startedRes.error };

  const byId = new Map();
  for (const row of [...(completedRes.data || []), ...(startedRes.data || [])]) {
    if (!row?.id || row.job?.deleted_at) continue;
    byId.set(row.id, row);
  }

  const filtered = Array.from(byId.values()).filter((row) => {
    const t = assignmentPeriodAnchorMs(row);
    return Number.isFinite(t) && t >= start && t <= end;
  });

  return {
    data: filtered.map((row) => mapTechnicianJobLaborRow(row)),
    error: null,
  };
}

export async function fetchTechnicianJobsLaborInPeriod(
  supabase,
  startMs,
  endMs,
  options = {}
) {
  if (!supabase) return { data: [], error: new Error("No Supabase client") };
  const { technicianId, detailed = false } = options;
  const selectFragment = detailed
    ? TECHNICIAN_JOBS_LABOR_SELECT_DETAILED
    : TECHNICIAN_JOBS_LABOR_SELECT_BASIC;

  let query = supabase
    .from("technician_jobs")
    .select(selectFragment)
    .is("deleted_at", null);

  if (technicianId) {
    query = query.eq("technician_id", technicianId);
  }

  const { data, error } = await query.limit(technicianId ? 500 : 5000);

  if (error) return { data: [], error };

  const start = Number(startMs);
  const end = Number(endMs);

  const filtered = (data || []).filter((row) => {
    if (row.job?.deleted_at) return false;
    const t = assignmentPeriodAnchorMs(row);
    return Number.isFinite(t) && t >= start && t <= end;
  });

  return {
    data: filtered.map((row) => mapTechnicianJobLaborRow(row)),
    error: null,
  };
}

function filterAggregateRows(rows, search, fields) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return rows || [];
  return (rows || []).filter((row) =>
    fields.some((field) => String(row[field] || "").toLowerCase().includes(q))
  );
}

export const VENDOR_REPORT_LIST_SELECT = "id, customer_code, customer_name, phone_number, email";

export async function fetchVendorReportList(supabase, { page = 1, limit = 200, search = "" } = {}) {
  if (!supabase) return { data: [], totalCount: 0, error: new Error("No Supabase client") };

  const result = await paginatedSelect(supabase, "customer", VENDOR_REPORT_LIST_SELECT, {
    page,
    limit: Math.min(Math.max(1, Number(limit) || 200), 500),
    order: { column: "customer_name", ascending: true },
    filters: (query) => {
      if (!search.trim()) return query;
      return applyMultiTokenIlikeFilters(query, search, [
        "customer_code",
        "customer_name",
        "phone_number",
        "email",
      ]);
    },
  });

  return { data: result.data, totalCount: result.totalCount, error: null };
}

export const LOCATIONS_REPORT_LIST_SELECT =
  "id, location_name, current_latitude, current_longitude, customer_id";

const CUSTOMER_REPORT_MIN_SELECT = "id, customer_code, customer_name";

export async function fetchLocationsReportServer(
  supabase,
  { page = 1, limit = 200, search = "" } = {}
) {
  if (!supabase) return { data: [], totalCount: 0, error: new Error("No Supabase client") };

  const searchText = String(search || "").trim();

  const result = await paginatedSelect(supabase, "locations", LOCATIONS_REPORT_LIST_SELECT, {
    page,
    limit: Math.min(Math.max(1, Number(limit) || 200), 500),
    order: { column: "location_name", ascending: true },
    filters: (query) => {
      if (!searchText) return query;
      return applyMultiTokenIlikeFilters(query, searchText, ["location_name"]);
    },
  });

  const customerIds = [...new Set((result.data || []).map((r) => r.customer_id).filter(Boolean))];
  const customerMap = new Map();
  const chunkSize = 120;
  for (let i = 0; i < customerIds.length; i += chunkSize) {
    const chunk = customerIds.slice(i, i + chunkSize);
    const { data: customers, error: cErr } = await supabase
      .from("customer")
      .select(CUSTOMER_REPORT_MIN_SELECT)
      .in("id", chunk)
      .is("deleted_at", null);
    if (cErr) return { data: [], totalCount: 0, error: cErr };
    for (const c of customers || []) customerMap.set(c.id, c);
  }

  let rows = (result.data || []).map((r) => ({
    id: r.id,
    location_name: r.location_name,
    current_latitude: r.current_latitude,
    current_longitude: r.current_longitude,
    customer: r.customer_id ? customerMap.get(r.customer_id) || null : null,
  }));

  if (searchText) {
    const q = searchText.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.location_name || "").toLowerCase().includes(q) ||
        (r.customer?.customer_name || "").toLowerCase().includes(q) ||
        (r.customer?.customer_code || "").toLowerCase().includes(q)
    );
  }

  return {
    data: rows,
    totalCount: searchText ? rows.length : result.totalCount,
    error: null,
  };
}

async function fetchEquipmentBrandsFallback(supabase) {
  const { data, error } = await supabase
    .from("equipments")
    .select("brand, equipment_type, item_group")
    .is("deleted_at", null)
    .limit(8000);

  if (error) return { data: [], error };

  const map = new Map();
  for (const row of data || []) {
    const b = (row.brand || "").trim() || "Unknown";
    if (!map.has(b)) map.set(b, { brand: b, count: 0, types: new Set() });
    const rec = map.get(b);
    rec.count += 1;
    if (row.equipment_type) rec.types.add(row.equipment_type);
  }

  const list = Array.from(map.values()).map((r) => ({
    brand: r.brand,
    count: r.count,
    types: Array.from(r.types).slice(0, 5).join(", ") || "—",
  }));
  list.sort((a, b) => b.count - a.count);
  return { data: list, error: null };
}

export async function fetchEquipmentBrands(supabase, { search = "" } = {}) {
  if (!supabase) return { data: [], error: new Error("No Supabase client") };

  const { data: rpcData, error: rpcError } = await supabase.rpc("report_equipment_brand_aggregates");

  if (!rpcError && Array.isArray(rpcData)) {
    const list = rpcData.map((row) => ({
      brand: row.brand,
      count: Number(row.equipment_count) || 0,
      types: row.types || "—",
    }));
    return { data: filterAggregateRows(list, search, ["brand", "types"]), error: null };
  }

  console.warn("fetchEquipmentBrands: RPC failed, using fallback:", rpcError?.message);

  const { data, error } = await fetchEquipmentBrandsFallback(supabase);
  if (error) return { data: [], error };
  return { data: filterAggregateRows(data, search, ["brand", "types"]), error: null };
}

async function fetchJobCategoryAggregatesFallback(supabase) {
  // No PostgREST embeds: Supabase only exposes joins when a FK exists between tables.
  // If `job_category.job_id` → `jobs.id` is missing in the DB, `job_category(...)` / `job:job_id(...)` both fail.
  const { data: catRows, error: catErr } = await supabase
    .from("job_category")
    .select("description, job_id")
    .limit(8000);

  if (catErr) return { data: [], error: catErr };

  const rows = catRows || [];
  const jobIds = [...new Set(rows.map((r) => r.job_id).filter(Boolean))];
  if (jobIds.length === 0) {
    return { data: [], error: null };
  }

  const activeJobIds = new Set();
  const chunkSize = 120;
  for (let i = 0; i < jobIds.length; i += chunkSize) {
    const chunk = jobIds.slice(i, i + chunkSize);
    const { data: activeRows, error: jErr } = await supabase
      .from("jobs")
      .select("id")
      .in("id", chunk)
      .is("deleted_at", null);

    if (jErr) return { data: [], error: jErr };
    for (const r of activeRows || []) activeJobIds.add(r.id);
  }

  const map = new Map();
  for (const row of rows) {
    if (!row.job_id || !activeJobIds.has(row.job_id)) continue;
    const desc = (row.description || "").trim() || "Uncategorized";
    map.set(desc, (map.get(desc) || 0) + 1);
  }

  const list = Array.from(map.entries()).map(([description, jobCount]) => ({ description, jobCount }));
  list.sort((a, b) => b.jobCount - a.jobCount);
  return { data: list, error: null };
}

export async function fetchJobCategoryAggregates(supabase, { search = "" } = {}) {
  if (!supabase) return { data: [], error: new Error("No Supabase client") };

  const { data: rpcData, error: rpcError } = await supabase.rpc("report_job_category_aggregates");

  if (!rpcError && Array.isArray(rpcData)) {
    const list = rpcData.map((row) => ({
      description: row.description,
      jobCount: Number(row.job_count) || 0,
    }));
    return { data: filterAggregateRows(list, search, ["description"]), error: null };
  }

  console.warn("fetchJobCategoryAggregates: RPC failed, using fallback:", rpcError?.message);

  const { data, error } = await fetchJobCategoryAggregatesFallback(supabase);
  if (error) return { data: [], error };
  return { data: filterAggregateRows(data, search, ["description"]), error: null };
}

export async function fetchEquipmentsCatalog(supabase, { limit = 5000 } = {}) {
  if (!supabase) return { data: [], error: new Error("No Supabase client") };
  const { data, error } = await supabase
    .from("equipments")
    .select(
      "id, item_code, item_name, item_group, equipment_type, model_series, brand, serial_number, customer:customer_id(customer_name)"
    )
    .is("deleted_at", null)
    .order("item_name")
    .limit(limit);

  return { data: data || [], error };
}

async function fetchProductCategoryAggregatesFallback(supabase) {
  const { data, error } = await supabase
    .from("equipments")
    .select("item_group")
    .is("deleted_at", null)
    .limit(8000);

  if (error) return { data: [], error };

  const map = new Map();
  for (const row of data || []) {
    const g = (row.item_group || "").trim() || "Unspecified";
    map.set(g, (map.get(g) || 0) + 1);
  }

  const list = Array.from(map.entries()).map(([name, totalItems]) => ({ name, totalItems }));
  list.sort((a, b) => b.totalItems - a.totalItems);
  return { data: list, error: null };
}

export async function fetchProductCategoryAggregates(supabase, { search = "" } = {}) {
  if (!supabase) return { data: [], error: new Error("No Supabase client") };

  const { data: rpcData, error: rpcError } = await supabase.rpc("report_product_category_aggregates");

  if (!rpcError && Array.isArray(rpcData)) {
    const list = rpcData.map((row) => ({
      name: row.name,
      totalItems: Number(row.total_items) || 0,
    }));
    return { data: filterAggregateRows(list, search, ["name"]), error: null };
  }

  console.warn("fetchProductCategoryAggregates: RPC failed, using fallback:", rpcError?.message);

  const { data, error } = await fetchProductCategoryAggregatesFallback(supabase);
  if (error) return { data: [], error };
  return { data: filterAggregateRows(data, search, ["name"]), error: null };
}

/** @deprecated Prefer fetchLocationsReportServer via /api/reports/warehouse-list */
export async function fetchLocationsReport(supabase, options = {}) {
  const { data, error } = await fetchLocationsReportServer(supabase, {
    page: 1,
    limit: options.limit || 5000,
    search: options.search || "",
  });
  return { data, error };
}

export function formatHours(h) {
  if (!h || h <= 0) return "0h";
  const hrs = Math.floor(h);
  const m = Math.round((h - hrs) * 60);
  if (m === 0) return `${hrs}h`;
  return `${hrs}h ${m}m`;
}

/** Completed technician_jobs in [startMs, endMs] by technician_id */
export async function fetchCompletedJobCountsByTechnician(supabase, startMs, endMs) {
  if (!supabase) return { data: new Map(), error: new Error("No Supabase client") };
  const { data, error } = await supabase
    .from("technician_jobs")
    .select("technician_id, completed_at")
    .is("deleted_at", null)
    .limit(8000);

  if (error) return { data: new Map(), error };

  const start = Number(startMs);
  const end = Number(endMs);
  const map = new Map();
  for (const row of data || []) {
    if (!row.completed_at) continue;
    const t = new Date(row.completed_at).getTime();
    if (t < start || t > end) continue;
    const id = row.technician_id;
    if (!id) continue;
    map.set(id, (map.get(id) || 0) + 1);
  }
  return { data: map, error: null };
}
