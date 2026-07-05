/**
 * Build EXEC statements for Pixelcare SAP Job Incentives add-on stored procedures.
 * @see public/job-incentives/FSM_SAP_JobIncentives_Mapping.pdf
 */

function escLiteral(s) {
  return String(s ?? "").replace(/'/g, "''");
}

/**
 * @param {string} filterType 'M' | 'Q'
 * @param {number|string} year
 * @param {number|string} quarter
 * @param {number|string} month
 */
export function buildExecJobIncentiveData(filterType, year, quarter, month) {
  const ft = escLiteral(filterType);
  const y = parseInt(String(year), 10) || 0;
  const q = parseInt(String(quarter), 10) || 0;
  const m = parseInt(String(month), 10) || 0;
  return `EXEC _SPPXC_Job_Incentive_Data '${ft}', ${y}, ${q}, ${m}`;
}

/**
 * @param {object} p
 */
export function buildExecTechnicianData(p) {
  const {
    filterType,
    year,
    quarter,
    month,
    tech,
    filterCategory = "ALL",
    docType = "",
    docNumFrom = "",
    docNumTo = "",
    dateFrom = "",
    dateTo = "",
  } = p;
  const ft = escLiteral(filterType);
  const y = parseInt(String(year), 10) || 0;
  const q = parseInt(String(quarter), 10) || 0;
  const m = parseInt(String(month), 10) || 0;
  return (
    "EXEC _SPPXC_Technician_Data '" +
    ft +
    "', " +
    y +
    ", " +
    q +
    ", " +
    m +
    ", '" +
    escLiteral(tech) +
    "', '" +
    escLiteral(filterCategory) +
    "', '" +
    escLiteral(docType) +
    "', '" +
    escLiteral(docNumFrom) +
    "', '" +
    escLiteral(docNumTo) +
    "', '" +
    escLiteral(dateFrom) +
    "', '" +
    escLiteral(dateTo) +
    "'"
  );
}

export function buildExecDocNumData(filterType, year, quarter, month, tech) {
  const ft = escLiteral(filterType);
  const y = parseInt(String(year), 10) || 0;
  const q = parseInt(String(quarter), 10) || 0;
  const m = parseInt(String(month), 10) || 0;
  return `EXEC _SPPXC_DocNum_Data '${ft}', ${y}, ${q}, ${m}, '${escLiteral(tech)}'`;
}
