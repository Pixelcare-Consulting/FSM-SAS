import { getSupabaseAdmin } from "../../../lib/supabase/server";
import { fetchJobCalendarEventsForRange } from "../../../lib/jobs/jobCalendarEvents";
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
