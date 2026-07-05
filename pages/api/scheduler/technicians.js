import { getSupabaseAdmin } from "../../../lib/supabase/server";
import { fetchSchedulerTechnicians } from "../../../lib/scheduler/schedulerQueries";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");

  try {
    const supabase = getSupabaseAdmin();
    const { technicians, error } = await fetchSchedulerTechnicians(supabase);
    if (error) throw error;

    return res.status(200).json({
      technicians,
      stats: { totalTechnicians: technicians.length },
    });
  } catch (error) {
    console.error("Scheduler technicians API error", error);
    return res.status(500).json({
      error: error.message || "Unable to load technicians.",
    });
  }
}
