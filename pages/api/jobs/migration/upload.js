import formidable from "formidable";
import * as XLSX from "xlsx";
import { getSupabaseAdmin } from "../../../../lib/supabase/server";

export const config = {
  api: {
    bodyParser: false,
  },
};

function parseForm(req) {
  const form = formidable({
    multiples: false,
    maxFileSize: 25 * 1024 * 1024, // 25MB
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

function safeTrim(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  return v;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = await parseForm(req);
    const file = files?.file;

    if (!file) {
      return res.status(400).json({ error: 'Missing file field "file"' });
    }

    // formidable v3 can return array for files; normalize
    const f = Array.isArray(file) ? file[0] : file;
    const originalFilename = f.originalFilename || f.newFilename || "upload.xlsx";

    const workbook = XLSX.readFile(f.filepath, { cellDates: true, raw: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      raw: false,
    });

    // Normalize values (trim strings, keep nulls)
    const normalizedRows = rows.map((r) => {
      const o = {};
      for (const k of Object.keys(r)) o[k] = safeTrim(r[k]);
      return o;
    });

    const headers = normalizedRows.length ? Object.keys(normalizedRows[0]) : [];
    const expectedSomeOf = ["SAP ID", "Job Start DateTime", "Job Description", "ID", "Customer FirstName", "Customer Service Location ID"];
    const hasExpectedHeader = headers.some((h) => expectedSomeOf.some((e) => String(h).trim() === e));
    const formatWarning = !hasExpectedHeader && headers.length > 0
      ? "First row does not look like the expected header (e.g. SAP ID, Job Start DateTime). Use an Excel with a header row matching the sample format."
      : null;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("job_migration_upload")
      .insert({
        filename: originalFilename,
        status: "PENDING",
        rows: normalizedRows,
      })
      .select("id, filename, status, uploaded_at")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      upload: data,
      sheet: sheetName,
      rowCount: normalizedRows.length,
      headers,
      sampleRows: normalizedRows.slice(0, 3),
      formatWarning,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Upload failed" });
  }
}

