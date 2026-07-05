import sapService from "../../../lib/services/sapService";
import { buildExecDocNumData } from "../../../lib/sap/jobIncentiveSpSql";

const SQL_PACK = () => (process.env.SAP_SQL_QUERIES_PACKAGE_ID || "sql01").trim();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With, Accept");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });

  const sessionCookies = sapService.getSessionCookies(req);
  if (!sessionCookies) {
    return res.status(401).json({ success: false, error: "SAP session required", rows: [] });
  }

  const q = req.query || {};
  const filterType = String(q.filterType || "M").slice(0, 1).toUpperCase() === "Q" ? "Q" : "M";
  const year = parseInt(String(q.year || new Date().getFullYear()), 10);
  const quarter = parseInt(String(q.quarter || Math.floor(new Date().getMonth() / 3) + 1), 10);
  const month = parseInt(String(q.month || new Date().getMonth() + 1), 10);
  const tech = q.tech != null ? String(q.tech) : "";

  if (!tech) {
    return res.status(400).json({ success: false, error: "tech (SAP technician code) is required", rows: [] });
  }

  const sql = buildExecDocNumData(filterType, year, quarter, month, tech);

  try {
    const data = await sapService.executeSQLQuery(SQL_PACK(), { SqlText: sql }, sessionCookies);
    const rows = data?.value ?? [];
    return res.status(200).json({ success: true, rows, meta: { tech, year, quarter, month, filterType } });
  } catch (error) {
    console.error("SAP _SPPXC_DocNum_Data error:", error);
    return res.status(502).json({
      success: false,
      error: error?.message || "Stored procedure query failed",
      rows: [],
    });
  }
}
