import { getSupabaseAdmin } from "../../../lib/supabase/server";
import { fetchAttendanceForPeriod } from "../../../lib/supabase/reports";
import {
  enrichAttendanceGroups,
  groupAttendanceByTechnicianAndDate,
} from "../../../lib/supabase/attendanceUtils";
import { getListCache, logResponseSize, setListCache } from "../../../lib/supabase/listQueryHelpers";
import { toSingaporeYmd } from "../../../lib/utils/singaporeDateTime";

const CACHE_TTL_MS = 45000;
const PUNCH_LIMIT = 5000;

function parseRangeBounds(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Invalid date range" };
  }
  if (start > end) {
    return { error: "startIso must be on or before endIso" };
  }
  return { startIso, endIso };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "private, max-age=30");

  const startIso = String(req.query.startIso || "").trim();
  const endIso = String(req.query.endIso || "").trim();

  if (!startIso || !endIso) {
    return res.status(400).json({ error: "startIso and endIso are required" });
  }

  const bounds = parseRangeBounds(startIso, endIso);
  if (bounds.error) {
    return res.status(400).json({ error: bounds.error });
  }

  const cacheKey = `workers-attendance:${bounds.startIso}:${bounds.endIso}`;
  const cached = getListCache(cacheKey, CACHE_TTL_MS);
  if (cached) {
    logResponseSize("workers/attendance-summary (cached)", cached);
    return res.status(200).json(cached);
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    const { data: punches, error: attendanceError } = await fetchAttendanceForPeriod(
      supabase,
      bounds.startIso,
      bounds.endIso
    );
    if (attendanceError) throw attendanceError;

    const grouped = groupAttendanceByTechnicianAndDate(punches || []);
    const groups = await enrichAttendanceGroups(grouped, supabase, {
      startIso: bounds.startIso,
      endIso: bounds.endIso,
    });

    const payload = {
      groups,
      rawPunchCount: (punches || []).length,
      punchLimit: PUNCH_LIMIT,
      startYmd: toSingaporeYmd(bounds.startIso),
      endYmd: toSingaporeYmd(bounds.endIso),
      fetchedAt: new Date().toISOString(),
    };

    setListCache(cacheKey, payload, CACHE_TTL_MS);
    logResponseSize("workers/attendance-summary", payload);

    return res.status(200).json(payload);
  } catch (error) {
    console.error("Workers attendance-summary API error:", error);
    return res.status(500).json({
      error: error.message || "Unable to load attendance summary.",
    });
  }
}
