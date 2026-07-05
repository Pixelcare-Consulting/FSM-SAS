/* eslint-disable no-console */
/**
 * Inspect sample migration Excel files and print headers + sample rows.
 *
 * Usage:
 *   node scripts/inspect-sample-migration.js
 *   node scripts/inspect-sample-migration.js "public/sample-migration/Jobs - 2025-12-25 - 2026-12-31.xlsx"
 */

const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

function normalizeCellValue(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === "string") return v.trim();
  return v;
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const defaultFile = path.join(
    repoRoot,
    "public",
    "sample-migration",
    "Jobs - 2025-12-25 - 2026-12-31.xlsx"
  );

  const arg = process.argv[2];
  const filePath = arg ? path.resolve(repoRoot, arg) : defaultFile;

  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(1);
  }

  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    raw: false,
  });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
  });

  const headers = rows.length ? Object.keys(rows[0]) : [];

  console.log("=== Sample Migration Excel Inspection ===");
  console.log("File:", path.relative(repoRoot, filePath));
  console.log("Sheet:", sheetName);
  console.log("RowCount:", rows.length);
  console.log("Headers:", headers);

  const sample = rows.slice(0, 3).map((r) => {
    const o = {};
    for (const k of headers) o[k] = normalizeCellValue(r[k]);
    return o;
  });

  console.log("SampleRows(First3):");
  console.log(JSON.stringify(sample, null, 2));
}

main();

