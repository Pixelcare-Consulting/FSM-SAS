import { getSupabaseAdmin } from "../../../../lib/supabase/server";

/**
 * POST /api/jobs/migration/preview
 * Returns filtered rows by date range (Job Start DateTime) for verification.
 * Body: { uploadId, dateStart?, dateEnd? }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { uploadId, dateStart = null, dateEnd = null } = req.body || {};

    if (!uploadId) {
      return res.status(400).json({ error: "Missing uploadId" });
    }

    const supabase = getSupabaseAdmin();
    const { data: upload, error: fetchErr } = await supabase
      .from("job_migration_upload")
      .select("id, filename, rows")
      .eq("id", uploadId)
      .single();

    if (fetchErr) {
      return res.status(404).json({ error: fetchErr.message });
    }

    let rows = Array.isArray(upload.rows) ? upload.rows : [];
    const totalBeforeFilter = rows.length;

    // Same filter logic as apply.js
    if (dateStart || dateEnd) {
      const startDate = dateStart ? new Date(dateStart) : null;
      const endDate = dateEnd ? new Date(dateEnd) : null;
      if (endDate) endDate.setHours(23, 59, 59, 999);
      if (startDate || endDate) {
        rows = rows.filter((row) => {
          const jobStartStr = (row["Job Start DateTime"] || "").toString().trim();
          if (!jobStartStr) return false;
          const jobStart = new Date(jobStartStr);
          if (isNaN(jobStart.getTime())) return false;
          if (startDate && jobStart < startDate) return false;
          if (endDate && jobStart > endDate) return false;
          return true;
        });
      }
    }

    const headers = rows.length ? Object.keys(rows[0]) : [];
    const sampleRows = rows.slice(0, 20);

    return res.status(200).json({
      success: true,
      dateStart: dateStart || null,
      dateEnd: dateEnd || null,
      totalBeforeFilter,
      filteredCount: rows.length,
      excludedCount: totalBeforeFilter - rows.length,
      headers,
      sampleRows,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Preview failed" });
  }
}
