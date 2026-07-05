import sapService from "../../../lib/services/sapService";

/**
 * UDT field names must match SAP B1 exactly (User-Defined Fields on @JOB_INCENTIVES).
 * PDF/plan used U_WorkingHrs; older code used U_WorkingHs — if SL returns -1000 "invalid property",
 * override via env: SAP_JOB_INCENTIVES_SELECT_FIELDS=Code,Name,U_TechName,...
 */
function getSelectFields() {
  const fromEnv = (process.env.SAP_JOB_INCENTIVES_SELECT_FIELDS || "").trim();
  if (fromEnv) {
    return fromEnv;
  }
  return [
    "Code",
    "Name",
    "U_TechName",
    "U_Year",
    "U_JobMonth",
    "U_Income",
    "U_Expense",
    "U_WorkingHrs",
    "U_IncomePerHour",
    "U_IncomePerDollar",
    "U_SIncome",
    "U_SExpense",
    "U_SWorkingHrs",
    "U_SIncomePerHour",
    "U_SIncomePerDollar",
  ].join(",");
}

async function fetchUserTable(entityName, sessionCookies) {
  const select = getSelectFields();
  const endpoint = `${entityName}?$select=${select}&$top=100&$orderby=U_Year desc,U_JobMonth desc,Code`;
  const data = await sapService.makeRequest(endpoint, { quiet: true }, sessionCookies);
  return data?.value || [];
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With, Accept");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const sessionCookies = sapService.getSessionCookies(req);
  if (!sessionCookies) {
    return res.status(401).json({
      success: false,
      error: "SAP session required",
      rows: [],
    });
  }

  try {
    const rows = await fetchUserTable("U_JOB_INCENTIVES", sessionCookies);
    return res.status(200).json({ success: true, rows });
  } catch (error) {
    console.error("SAP incentives fetch error:", error);
    const raw = error?.message || "";
    let message = raw || "Failed to fetch SAP incentives";
    if (raw.includes("-1000") && /invalid/i.test(raw)) {
      message =
        "A field in the OData $select list does not exist on U_JOB_INCENTIVES in your company DB (SAP -1000). " +
        "Check UDF names on the UDT in SAP B1 and set SAP_JOB_INCENTIVES_SELECT_FIELDS to a comma-separated list that matches. Raw: " +
        raw;
    } else if (raw.includes("-1002") || /Service Not Found/i.test(raw)) {
      message =
        "SAP Service Layer could not find the incentive UDT (often code -1002). " +
        "Confirm in SAP B1 that the user-defined table exists (e.g. @JOB_INCENTIVES), is named to match this API (U_JOB_INCENTIVES in Service Layer), " +
        "and that you are logged into the same company database. Raw: " +
        raw;
    }
    return res.status(502).json({
      success: false,
      error: message,
      rows: [],
    });
  }
}
