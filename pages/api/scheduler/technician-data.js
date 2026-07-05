import { buildScheduleMap } from "../../../lib/scheduler/technicianSchedulerUtils";
import { getSupabaseAdmin } from "../../../lib/supabase/server";
import {
  JOBS_FOR_SCHEDULER_SELECT,
  buildSchedulerEventsPayload,
  computeSchedulerDataVersion,
  fetchCalendarEventsForSchedulerRange,
  fetchJobSchedulesByJobIdsChunked,
  fetchJobsForSchedulerWindow,
  fetchSchedulerTechnicians,
  fetchTechnicianJobsForJobIdsChunked,
  TECHNICIAN_BY_ID_SELECT,
} from "../../../lib/scheduler/schedulerQueries";
import { getListCache, logResponseSize, setListCache } from "../../../lib/supabase/listQueryHelpers";

const CACHE_TTL_MS = 45000;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "private, max-age=30");

  const rangeStart = typeof req.query.rangeStart === "string" ? req.query.rangeStart : null;
  const rangeEnd = typeof req.query.rangeEnd === "string" ? req.query.rangeEnd : null;

  if (!rangeStart || !rangeEnd) {
    return res.status(400).json({
      error: "rangeStart and rangeEnd are required (ISO date strings)",
    });
  }

  const includeUndated =
    req.query.includeUndated === "true" || req.query.includeUndated === "1";
  const clientDataVersion =
    typeof req.query.dataVersion === "string" ? req.query.dataVersion : null;

  const cacheKey = `scheduler-window:${rangeStart}:${rangeEnd}:${includeUndated ? "1" : "0"}`;

  if (clientDataVersion) {
    const cached = getListCache(cacheKey, CACHE_TTL_MS);
    if (cached?.dataVersion === clientDataVersion) {
      return res.status(200).json({ unchanged: true, dataVersion: clientDataVersion });
    }
  } else {
    const cached = getListCache(cacheKey, CACHE_TTL_MS);
    if (cached) {
      logResponseSize("scheduler/technician-data (cached)", cached);
      return res.status(200).json(cached);
    }
  }

  try {
    const supabase = getSupabaseAdmin();
    const { technicians } = await fetchSchedulerTechnicians(supabase);

    const jobsWindowResult = await fetchJobsForSchedulerWindow(
      supabase,
      rangeStart,
      rangeEnd,
      JOBS_FOR_SCHEDULER_SELECT,
      { includeUndated }
    );

    if (jobsWindowResult.error) throw jobsWindowResult.error;

    const jobsList = jobsWindowResult.data || [];
    const jobsById = Object.fromEntries(jobsList.map((j) => [j.id, j]));
    const jobIds = jobsList.map((j) => j.id);

    const [assignmentsPaged, jobSchedulesResult] = await Promise.all([
      fetchTechnicianJobsForJobIdsChunked(supabase, jobIds),
      jobIds.length
        ? fetchJobSchedulesByJobIdsChunked(supabase, jobIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (assignmentsPaged.error) throw assignmentsPaged.error;
    if (jobSchedulesResult.error) throw jobSchedulesResult.error;

    const assignmentsResult = { data: assignmentsPaged.data || [] };
    const scheduleRows = jobSchedulesResult.data || [];
    const scheduleMap = buildScheduleMap(scheduleRows);

    const assignmentTechIds = [
      ...new Set((assignmentsResult.data || []).map((a) => a.technician_id).filter(Boolean)),
    ];

    const techsResult = await supabase
      .from("technicians")
      .select(TECHNICIAN_BY_ID_SELECT)
      .is("deleted_at", null);

    if (techsResult.error) throw techsResult.error;

    const filteredTechnicians = (techsResult.data || []).filter(
      (technician) => technician.user?.role === "TECHNICIAN"
    );
    const allTechnicianRows = [...filteredTechnicians];

    const techsById = Object.fromEntries(allTechnicianRows.map((t) => [t.id, t]));
    const missingFromList = assignmentTechIds.filter((id) => !techsById[id]);

    const { events, undatedAssignments } = await buildSchedulerEventsPayload({
      assignmentsResult,
      jobsById,
      scheduleMap,
      technicians,
      allTechnicianRows,
      filteredTechnicians,
      techsById,
      missingFromList,
      supabase,
    });

    if (process.env.NODE_ENV === "development") {
      console.log("[SchedulerAPI] counts", {
        windowed: true,
        includeUndated,
        technicians: technicians.length,
        assignments: assignmentsResult.data?.length || 0,
        events: events.length,
        undatedAssignments: undatedAssignments.length,
      });
    }

    let calendarEvents = [];
    const calendarResult = await fetchCalendarEventsForSchedulerRange(
      supabase,
      rangeStart,
      rangeEnd
    );
    if (calendarResult.error) {
      console.warn(
        "[SchedulerAPI] Failed to fetch calendar events:",
        calendarResult.error.message
      );
    } else {
      calendarEvents = calendarResult.data || [];
    }

    const dataVersion = computeSchedulerDataVersion({
      events,
      undatedAssignments,
      calendarEvents,
      assignments: assignmentsResult.data || [],
      schedules: scheduleRows,
    });

    if (clientDataVersion && clientDataVersion === dataVersion) {
      return res.status(200).json({ unchanged: true, dataVersion });
    }

    const payload = {
      events,
      undatedAssignments,
      calendarEvents,
      dataVersion,
      stats: {
        activeJobs: events.length,
        undatedJobs: undatedAssignments.length,
        calendarEvents: calendarEvents.length,
      },
    };

    setListCache(cacheKey, payload, CACHE_TTL_MS);
    logResponseSize("scheduler/technician-data", payload);

    return res.status(200).json(payload);
  } catch (error) {
    console.error("Technician scheduler API error", error);
    return res.status(500).json({
      error: error.message || "Unable to load technician schedules.",
    });
  }
}
