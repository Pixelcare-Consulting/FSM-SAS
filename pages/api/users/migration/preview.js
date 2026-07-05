import { getSupabaseAdmin } from "../../../../lib/supabase/server";

/**
 * POST /api/users/migration/preview
 * Returns rows from user migration upload for verification.
 * Body: { uploadId }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { uploadId } = req.body || {};

    if (!uploadId) {
      return res.status(400).json({ error: "Missing uploadId" });
    }

    const supabase = getSupabaseAdmin();
    const { data: upload, error: fetchErr } = await supabase
      .from("user_migration_upload")
      .select("id, filename, rows")
      .eq("id", uploadId)
      .single();

    if (fetchErr) {
      return res.status(404).json({ error: fetchErr.message });
    }

    const rows = Array.isArray(upload.rows) ? upload.rows : [];
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const sampleRows = rows.slice(0, 20);

    return res.status(200).json({
      success: true,
      totalCount: rows.length,
      headers,
      sampleRows,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Preview failed" });
  }
}
