import { getSupabaseAdmin } from "../../../lib/supabase/server";
import { fetchJobCalendarEventsForRange } from "../../../lib/jobs/jobCalendarEvents";
import {
  SCHEDULER_MAX_RANGE_DAYS,
  normalizeSchedulerRange,
} from "../../../lib/scheduler/schedulerQueries";
import { getListCache, logResponseSize, setListCache } from "../../../lib/supabase/listQueryHelpers";
import { withApiMetrics } from "../../../lib/api/withApiMetrics";

const CACHE_TTL_MS = 45000;

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "private, max-age=30");

  const rawRangeStart = typeof req.query.rangeStart === "string" ? req.query.rangeStart : null;
  const rawRangeEnd = typeof req.query.rangeEnd === "string" ? req.query.rangeEnd : null;

  if (!rawRangeStart || !rawRangeEnd) {
    return res.status(400).json({
      error: "rangeStart and rangeEnd are required (ISO date strings)",
    });
  }

  const normalized = normalizeSchedulerRange(
    rawRangeStart,
    rawRangeEnd,
    SCHEDULER_MAX_RANGE_DAYS
  );
  if (!normalized) {
    return res.status(400).json({
      error: "rangeStart and rangeEnd must be valid ISO dates with rangeEnd >= rangeStart",
    });
  }

  const { rangeStart, rangeEnd } = normalized;

  const cacheKey = `jobs-calendar:${rangeStart}:${rangeEnd}`;
  const cached = getListCache(cacheKey, CACHE_TTL_MS);
  if (cached) {
    logResponseSize("jobs/calendar-events (cached)", cached);
    return res.status(200).json(cached);
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    const { events, stats, error } = await fetchJobCalendarEventsForRange(
      supabase,
      rangeStart,
      rangeEnd
    );

    if (error) throw error;

    const payload = { events, stats };
    setListCache(cacheKey, payload, CACHE_TTL_MS);
    logResponseSize("jobs/calendar-events", payload);

    return res.status(200).json(payload);
  } catch (error) {
    console.error("[jobs/calendar-events]", error);
    return res.status(500).json({
      error: error.message || "Unable to load job calendar events.",
    });
  }
}

export default withApiMetrics(handler);
