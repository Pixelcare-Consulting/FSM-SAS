import {
  buildScheduleMap,
  parseDateTime,
  pickActiveSchedule,
} from "../scheduler/technicianSchedulerUtils";
import {
  chunkIds,
  fetchChunkedInParallel,
  fetchJobSchedulesByJobIdsChunked,
  fetchJobsForSchedulerWindow,
  fetchTechnicianJobsForJobIdsChunked,
  JOBS_CALENDAR_EVENTS_SELECT,
} from "../scheduler/schedulerQueries";
import { jobDisplayCustomerName } from "../utils/embeddedCustomerName";

const JOB_EQUIPMENT_CALENDAR_SELECT =
  "job_id, equipment:equipment_id ( item_name, equipment_type )";

export async function fetchJobEquipmentsByJobIdsChunked(supabase, jobIds) {
  const chunks = chunkIds(jobIds);
  return fetchChunkedInParallel(chunks, (batch) =>
    supabase
      .from("job_equipments")
      .select(JOB_EQUIPMENT_CALENDAR_SELECT)
      .in("job_id", batch)
      .is("deleted_at", null)
  );
}

function resolveJobWindowTimes(job, schedule) {
  let startDateTime = null;
  let endDateTime = null;

  if (job.scheduled_start) {
    startDateTime = parseDateTime(job.scheduled_start);
  } else if (schedule?.jsdate) {
    startDateTime = parseDateTime(schedule.jsdate, schedule.jstime);
  } else if (job.scheduled_date) {
    startDateTime = parseDateTime(job.scheduled_date, "09:00:00");
  } else {
    startDateTime = parseDateTime(job.created_at);
  }

  if (job.scheduled_end) {
    endDateTime = parseDateTime(job.scheduled_end);
  } else if (schedule?.jedate) {
    endDateTime = parseDateTime(schedule.jedate, schedule.jetime);
  } else if (job.scheduled_date) {
    endDateTime = parseDateTime(job.scheduled_date, "17:00:00");
  } else if (startDateTime) {
    endDateTime = new Date(startDateTime.getTime() + 8 * 60 * 60 * 1000);
  }

  return { startDateTime, endDateTime };
}

export function mapWindowedJobsToCalendarEvents(
  jobs,
  scheduleRows,
  technicianJobRows,
  equipmentRows
) {
  const scheduleMap = buildScheduleMap(scheduleRows || []);

  const techJobsByJobId = {};
  for (const row of technicianJobRows || []) {
    if (row.deleted_at) continue;
    if (!techJobsByJobId[row.job_id]) techJobsByJobId[row.job_id] = [];
    techJobsByJobId[row.job_id].push(row);
  }

  const equipByJobId = {};
  for (const row of equipmentRows || []) {
    if (!equipByJobId[row.job_id]) equipByJobId[row.job_id] = [];
    equipByJobId[row.job_id].push(row);
  }

  const events = [];

  for (const job of jobs || []) {
    const schedule = pickActiveSchedule(scheduleMap[job.id] || []);
    const { startDateTime, endDateTime } = resolveJobWindowTimes(job, schedule);
    if (!startDateTime || !endDateTime) continue;

    const assignedWorkers = (techJobsByJobId[job.id] || []).map((tj) => ({
      workerId: tj.technician_id,
      fullName: tj.technician?.full_name || "Unknown",
      profilePicture: "/images/avatar/NoProfile.png",
    }));

    const equipment = equipByJobId[job.id]?.[0]?.equipment;
    const title = job.job_name || job.title || job.subject_name || "Untitled Job";

    events.push({
      event_id: job.id,
      title,
      start: startDateTime.toISOString(),
      end: endDateTime.toISOString(),
      Id: job.id,
      Subject: title,
      JobNo: job.job_no || job.job_number || job.id,
      Customer: jobDisplayCustomerName(job) || "Unknown Customer",
      ServiceLocation: job.location?.location_name || "",
      AssignedWorkers: assignedWorkers,
      StartTime: startDateTime.toISOString(),
      EndTime: endDateTime.toISOString(),
      JobStatus: job.status || "Created",
      Description: job.description || job.job_description || "",
      Priority: job.priority || "",
      Category: job.category || "N/A",
      ServiceCall: job.service_call?.call_number || job.service_call_id || "N/A",
      Equipment: equipment?.item_name || equipment?.equipment_type || "N/A",
    });
  }

  return events;
}

export function computeJobCalendarStats(events = []) {
  const totalJobs = events.length;
  const activeJobs = events.filter((job) => {
    const status = String(job.JobStatus || "").toLowerCase();
    return (
      status === "inprogress" ||
      status === "in progress" ||
      status === "started"
    );
  }).length;
  return { totalJobs, activeJobs };
}

export async function fetchJobCalendarEventsForRange(supabase, rangeStart, rangeEnd) {
  const jobsWindowResult = await fetchJobsForSchedulerWindow(
    supabase,
    rangeStart,
    rangeEnd,
    JOBS_CALENDAR_EVENTS_SELECT,
    { includeUndated: false }
  );

  if (jobsWindowResult.error) {
    return { events: [], stats: { totalJobs: 0, activeJobs: 0 }, error: jobsWindowResult.error };
  }

  const jobsList = jobsWindowResult.data || [];
  const jobIds = jobsList.map((j) => j.id);

  const [assignmentsResult, schedulesResult, equipmentsResult] = await Promise.all([
    jobIds.length
      ? fetchTechnicianJobsForJobIdsChunked(supabase, jobIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? fetchJobSchedulesByJobIdsChunked(supabase, jobIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? fetchJobEquipmentsByJobIdsChunked(supabase, jobIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (assignmentsResult.error) {
    return { events: [], stats: { totalJobs: 0, activeJobs: 0 }, error: assignmentsResult.error };
  }
  if (schedulesResult.error) {
    return { events: [], stats: { totalJobs: 0, activeJobs: 0 }, error: schedulesResult.error };
  }
  if (equipmentsResult.error) {
    return { events: [], stats: { totalJobs: 0, activeJobs: 0 }, error: equipmentsResult.error };
  }

  const events = mapWindowedJobsToCalendarEvents(
    jobsList,
    schedulesResult.data || [],
    assignmentsResult.data || [],
    equipmentsResult.data || []
  );

  return {
    events,
    stats: computeJobCalendarStats(events),
    error: null,
  };
}
