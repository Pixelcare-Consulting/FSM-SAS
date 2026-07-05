/**
 * Match FSM technicians to SAP incentive summary rows (from _SPPXC_Job_Incentive_Data).
 * Column names vary by SP version — we try common aliases.
 */

export function summaryRowTechCode(row) {
  if (!row || typeof row !== "object") return "";
  const v =
    row.Tech ??
    row.tech ??
    row.U_JobTech ??
    row.TECH ??
    row.TechnicianCode ??
    row.technicianCode ??
    "";
  return String(v).trim();
}

export function summaryRowIsAggregate(row) {
  const rt = String(row?.RowType ?? row?.rowType ?? "").toUpperCase();
  return rt === "G";
}

/** Working hours column from _SPPXC_Job_Incentive_Data (addon grid). */
export function summaryRowWorkingHrs(row) {
  if (!row || typeof row !== "object") return null;
  const keys = [
    "WorkingHrs",
    "workingHrs",
    "WorkingHours",
    "workingHours",
    "U_WorkingHrs",
    "U_WorkingHs",
    "WORKINGHRS",
  ];
  for (const k of keys) {
    const v = Number(row[k]);
    if (Number.isFinite(v)) return v;
  }
  for (const [k, v] of Object.entries(row)) {
    if (/working.*hrs?|working.*hours/i.test(k)) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * Find technician summary row from _SPPXC_Job_Incentive_Data for a SAP tech code.
 */
export function findSummaryRowForSapTech(summaryRows, sapTechCode) {
  const code = String(sapTechCode || "").trim();
  if (!code) return null;
  const rows = Array.isArray(summaryRows) ? summaryRows : [];
  for (const row of rows) {
    if (summaryRowIsAggregate(row)) continue;
    if (summaryRowTechCode(row) === code) return row;
  }
  return null;
}

export function summaryRowNameHints(row) {
  const hints = [];
  const preferredKeys = [
    "TechName",
    "techName",
    "TechnicianName",
    "technicianName",
    "Technician",
    "technician",
    "U_TechName",
    "EmployeeName",
    "employeeName",
    "Name",
  ];
  for (const k of preferredKeys) {
    const v = row[k];
    if (v != null && String(v).trim()) hints.push(String(v).trim());
  }
  for (const [k, v] of Object.entries(row)) {
    if (v == null || v === "") continue;
    if (/^__/u.test(k)) continue;
    if (/^(Tech|tech|TECH|U_JobTech|TechnicianCode|technicianCode)$/u.test(k)) continue;
    if (/RowType|rowType|Filter|Year|Quarter|Month|DocDate|DocEntry|DocNum|^__/iu.test(k)) continue;
    if (/name|technician|employee/i.test(k) && String(v).length < 160) hints.push(String(v).trim());
  }
  return [...new Set(hints)];
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MIN_HINT_MATCH_LEN = 3;

/** Compare after norm; also treat 0 vs O as equivalent (common in tech codes / display names). */
function hintMatchesWorkerName(wn, we, hnRaw) {
  const hn = norm(hnRaw);
  if (!hn || hn.length < MIN_HINT_MATCH_LEN) return false;

  const tryPair = (a, b, minLen = MIN_HINT_MATCH_LEN) => {
    if (!a || !b) return false;
    if (b === a) return true;
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    if (shorter.length < minLen) return false;
    if (longer.includes(shorter)) return true;
    const aLoose = a.replace(/0/g, "o");
    const bLoose = b.replace(/0/g, "o");
    if (bLoose === aLoose) return true;
    const shorterLoose = aLoose.length <= bLoose.length ? aLoose : bLoose;
    const longerLoose = aLoose.length <= bLoose.length ? bLoose : aLoose;
    if (shorterLoose.length >= minLen && longerLoose.includes(shorterLoose)) return true;
    return false;
  };

  const wnTokens = wn.split(/\s+/).filter(Boolean);
  const hnTokens = hn.split(/\s+/).filter(Boolean);
  if (wnTokens.length >= 2 && hnTokens.length >= 2) {
    const wFirst = wnTokens[0];
    const wLast = wnTokens[wnTokens.length - 1];
    const hFirst = hnTokens[0];
    const hLast = hnTokens[hnTokens.length - 1];
    if (tryPair(wFirst, hFirst) && tryPair(wLast, hLast)) return true;
  }

  if (tryPair(wn, hn)) return true;
  if (we && we.length >= MIN_HINT_MATCH_LEN && tryPair(we, hn)) return true;

  /** Portal often has spaced names; SAP UDT Technician is often one run-on token. */
  const wnC = wn.replace(/\s+/g, "");
  const hnC = hn.replace(/\s+/g, "");
  if (wnC.length >= MIN_HINT_MATCH_LEN && hnC.length >= MIN_HINT_MATCH_LEN && tryPair(wnC, hnC)) return true;
  if (we && we.length >= MIN_HINT_MATCH_LEN && hnC.length >= MIN_HINT_MATCH_LEN) {
    const weC = we.replace(/\s+/g, "");
    if (tryPair(weC, hnC)) return true;
  }
  return false;
}

/**
 * @returns {string|null} SAP tech code if exactly one match; null if none or ambiguous
 */
export function matchWorkerToSummaryTech(worker, summaryRows) {
  const rows = Array.isArray(summaryRows) ? summaryRows : [];
  const wn = norm(worker.full_name);
  const we = norm((worker.email || "").split("@")[0]);
  if (!wn && !we) return null;

  const codes = new Set();
  for (const row of rows) {
    if (summaryRowIsAggregate(row)) continue;
    const code = summaryRowTechCode(row);
    if (!code) continue;
    let hit = false;
    for (const h of summaryRowNameHints(row)) {
      if (hintMatchesWorkerName(wn, we, h)) {
        hit = true;
        break;
      }
    }
    if (hit) codes.add(code);
  }
  if (codes.size === 1) return [...codes][0];
  return null;
}

/**
 * @returns {Record<string, string>} workerId -> suggested sap tech code (only unambiguous)
 */
export function suggestSapTechCodesForWorkers(workers, summaryRows) {
  const out = {};
  for (const w of workers || []) {
    const id = w?.id;
    if (!id) continue;
    const code = matchWorkerToSummaryTech(w, summaryRows);
    if (code) out[id] = code;
  }
  return out;
}

/** Labels on a U_JOB_INCENTIVES row used to match a portal worker. */
export function udtRowNameHints(row) {
  if (!row || typeof row !== "object") return [];
  const hints = [];
  const techName = row.U_TechName ?? row.u_TechName;
  if (techName != null && String(techName).trim()) hints.push(String(techName).trim());
  const name = row.Name;
  if (name != null && String(name).trim()) hints.push(String(name).trim());
  return [...new Set(hints)];
}

/**
 * All U_JOB_INCENTIVES rows that match this worker (name/email vs U_TechName / Name).
 * Usually multiple rows per person (different months) — callers pick latest or aggregate rates.
 */
export function collectMatchingUdtRows(worker, udtRows) {
  const rows = Array.isArray(udtRows) ? udtRows : [];
  const wn = norm(worker.full_name);
  const we = norm((worker.email || "").split("@")[0]);
  if (!wn && !we) return [];

  const hits = [];
  for (const row of rows) {
    let hit = false;
    for (const h of udtRowNameHints(row)) {
      if (hintMatchesWorkerName(wn, we, h)) {
        hit = true;
        break;
      }
    }
    if (hit) hits.push(row);
  }
  return hits;
}

function udtRowPeriodSortKey(row) {
  const y = parseInt(String(row?.U_Year ?? row?.u_Year ?? 0), 10) || 0;
  const mRaw = row?.U_JobMonth ?? row?.u_JobMonth;
  const m = parseInt(String(mRaw ?? 0), 10) || 0;
  return y * 100 + m;
}

/** Prefer latest period when SAP sends one row per month/quarter. */
export function pickLatestUdtRow(rows) {
  const list = Array.isArray(rows) ? [...rows] : [];
  if (!list.length) return null;
  list.sort((a, b) => udtRowPeriodSortKey(b) - udtRowPeriodSortKey(a));
  return list[0];
}

/**
 * Month-scoped UDT rows for a worker. Prefers sap_tech_code when set; falls back to name match.
 */
export function collectUdtRowsForWorkerMonth(worker, udtRows, year, month) {
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return [];

  const rows = Array.isArray(udtRows) ? udtRows : [];
  const sapCode = String(worker?.sap_tech_code || "").trim();

  if (sapCode) {
    const byCode = rows.filter(
      (row) => udtRowMatchesCalendarMonth(row, y, m) && udtRowMatchesSapTechCode(row, sapCode)
    );
    if (byCode.length) return byCode;
  }

  return collectMatchingUdtRows(worker, rows).filter((row) => udtRowMatchesCalendarMonth(row, y, m));
}

/**
 * All U_JOB_INCENTIVES rows for a worker in a specific SAP year/month.
 * @deprecated Prefer collectUdtRowsForWorkerMonth (sap_tech_code-first matching).
 */
export function collectUdtRowsForCalendarMonth(worker, udtRows, year, month) {
  return collectUdtRowsForWorkerMonth(worker, udtRows, year, month);
}

/**
 * When SAP has multiple UDT lines for the same person/month, pick one row to receive FSM hours.
 */
export function pickCanonicalUdtRowForMonth(monthRows, worker) {
  const list = Array.isArray(monthRows) ? monthRows : [];
  if (!list.length) return null;

  const sapCode = String(worker?.sap_tech_code || "").trim();
  if (sapCode) {
    const byTech = list.find((r) => udtRowMatchesSapTechCode(r, sapCode));
    if (byTech) return byTech;
  }

  const withCode = list.find((r) => udtRowODataKey(r));
  if (withCode) return withCode;

  return list[0];
}

/** Sum U_WorkingHrs on matched month rows (how SAP addon often displays totals). */
export function sumUdtWorkingHrsForRows(rows) {
  let total = 0;
  for (const row of rows || []) {
    const h = Number(row?.U_WorkingHrs ?? row?.U_WorkingHs);
    if (Number.isFinite(h)) total += h;
  }
  return Math.round(total * 100) / 100;
}

/**
 * U_JOB_INCENTIVES row for a worker in a specific SAP year/month (for PATCH by Code).
 * @returns {object|null}
 */
export function pickUdtRowForCalendarMonth(worker, udtRows, year, month) {
  const monthRows = collectUdtRowsForCalendarMonth(worker, udtRows, year, month);
  return pickCanonicalUdtRowForMonth(monthRows, worker);
}

function normCode(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function udtRowMatchesCalendarMonth(row, year, month) {
  const ry = parseInt(String(row?.U_Year ?? row?.u_Year ?? ""), 10);
  const rmRaw = row?.U_JobMonth ?? row?.u_JobMonth;
  const rm = parseInt(String(rmRaw ?? ""), 10);
  return ry === year && rm === month;
}

function udtRowMatchesSapTechCode(row, sapCode) {
  const c = normCode(sapCode);
  if (!c) return false;
  const fields = [row?.Code, row?.code, row?.Name, row?.name, row?.U_TechName, row?.u_TechName];
  for (const f of fields) {
    const v = normCode(f);
    if (!v) continue;
    if (v === c || v.includes(c) || c.includes(v)) return true;
    const vLoose = v.replace(/0/g, "o");
    const cLoose = c.replace(/0/g, "o");
    if (vLoose === cLoose || vLoose.includes(cLoose) || cLoose.includes(vLoose)) return true;
  }
  return false;
}

/** Display / table label (Code, else Name). */
export function udtRowCode(row) {
  const codeRaw = row?.Code ?? row?.code ?? row?.Name ?? row?.name;
  return codeRaw != null && codeRaw !== "" ? String(codeRaw).trim() : "";
}

/** OData PATCH key — Code only (Name is not the Service Layer key). */
export function udtRowODataKey(row) {
  const codeRaw = row?.Code ?? row?.code;
  return codeRaw != null && codeRaw !== "" ? String(codeRaw).trim() : "";
}

/** Human-readable SAP period from a UDT row, e.g. "11 2025". */
export function udtRowPeriodLabel(row) {
  if (!row) return null;
  const y = row.U_Year ?? row.u_Year;
  const m = row.U_JobMonth ?? row.u_JobMonth;
  if (y == null || m == null) return null;
  const ms = String(m).trim();
  const ys = String(y).trim();
  if (!ms || !ys) return null;
  return `${ms} ${ys}`;
}

/** Parse snapshot label from portal (e.g. "11 2025") into calendar month/year. */
export function parseSapPeriodLabel(label) {
  if (label == null || label === "") return null;
  const parts = String(label).trim().split(/\s+/);
  if (parts.length < 2) return null;
  const month = parseInt(parts[0], 10);
  const year = parseInt(parts[parts.length - 1], 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;
  return { month, year };
}

/**
 * Diagnostic: UDT rows in a month matched by more than one portal worker (fuzzy-match leak).
 */
export function findUdtRowsMatchedByMultipleWorkers(workers, udtRows, year, month) {
  const rowKeyToWorkers = new Map();
  for (const worker of workers || []) {
    const rows = collectUdtRowsForWorkerMonth(worker, udtRows, year, month);
    for (const row of rows) {
      const key = udtRowODataKey(row) || udtRowCode(row) || udtRowPeriodLabel(row);
      if (!key) continue;
      if (!rowKeyToWorkers.has(key)) rowKeyToWorkers.set(key, []);
      rowKeyToWorkers.get(key).push({
        id: worker.id,
        name: worker.full_name || worker.email,
        sap_tech_code: worker.sap_tech_code,
      });
    }
  }
  const conflicts = [];
  for (const [rowKey, matchedWorkers] of rowKeyToWorkers) {
    const uniqueIds = new Set(matchedWorkers.map((w) => w.id));
    if (uniqueIds.size > 1) {
      conflicts.push({ rowKey, workers: matchedWorkers });
    }
  }
  return conflicts;
}

/**
 * Resolve U_JOB_INCENTIVES row for push: name + month, else SAP tech code + month.
 * @returns {{ row: object|null, matchKind: string|null, hits: object[] }}
 */
export function pickUdtRowForPush(worker, udtRows, year, month) {
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  const hits = collectMatchingUdtRows(worker, udtRows);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    return { row: null, matchKind: null, hits, monthRows: [] };
  }

  const monthRows = collectUdtRowsForWorkerMonth(worker, udtRows, y, m);
  const sapCode = String(worker?.sap_tech_code || "").trim();

  const row = pickCanonicalUdtRowForMonth(monthRows, worker);
  if (!row) {
    return { row: null, matchKind: null, hits, monthRows: [] };
  }

  const matchKind =
    sapCode && udtRowMatchesSapTechCode(row, sapCode) ? "code-period" : "name-period";

  return { row, matchKind, hits, monthRows };
}

/** OData keys for other month rows to zero so SAP addon sum equals FSM total. */
export function duplicateUdtODataKeysForMonth(monthRows, canonicalRow) {
  const canonicalKey = udtRowODataKey(canonicalRow);
  const keys = new Set();
  for (const row of monthRows || []) {
    if (row === canonicalRow) continue;
    const k = udtRowODataKey(row);
    if (k && k !== canonicalKey) keys.add(k);
  }
  return [...keys];
}

/**
 * Best positive rate across all matching UDT lines (e.g. multiple periods).
 * @returns {number|null}
 */
export function hourlyRateFromUdtRows(rows) {
  let best = null;
  for (const row of rows || []) {
    const v = hourlyRateFromUdtRow(row);
    if (v == null) continue;
    if (best == null || v > best) best = v;
  }
  return best;
}

/**
 * Sum income and working hours across matched UDT rows; period label from latest row by SAP year/month.
 * @returns {{ income: number, workingHrs: number, periodLabel: string|null }}
 */
export function udtTotalsFromRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let income = 0;
  let workingHrs = 0;
  for (const row of list) {
    const i = Number(row?.U_Income);
    if (Number.isFinite(i)) income += i;
    const h = Number(row?.U_WorkingHrs ?? row?.U_WorkingHs);
    if (Number.isFinite(h)) workingHrs += h;
  }
  const latest = pickLatestUdtRow(list);
  let periodLabel = null;
  if (latest) {
    const y = latest.U_Year ?? latest.u_Year;
    const m = latest.U_JobMonth ?? latest.u_JobMonth;
    if (y != null && m != null) {
      const ms = String(m).trim();
      const ys = String(y).trim();
      if (ms && ys) periodLabel = `${ms} ${ys}`;
    }
  }
  return { income, workingHrs, periodLabel };
}

/**
 * @returns {object|null} Representative UDT row for this worker, or null. Multiple period rows → latest period.
 */
export function matchWorkerToSingleUdtRow(worker, udtRows) {
  const hits = collectMatchingUdtRows(worker, udtRows);
  if (hits.length === 0) return null;
  return pickLatestUdtRow(hits);
}

/**
 * Prefer SP Tech code; else UDT Code/Name when non-numeric; else UDT technician field (often the SAP display code).
 */
export function sapTechFromUdtAndSp(udtRow, spTechCode) {
  const fromSp = spTechCode != null ? String(spTechCode).trim() : "";
  if (fromSp) return fromSp;
  if (!udtRow) return "";
  const rawName = udtRow.Name;
  if (rawName != null) {
    const s = String(rawName).trim();
    if (s && !/^\d+$/u.test(s)) return s;
  }
  const techName = udtRow.U_TechName ?? udtRow.u_TechName;
  if (techName != null) {
    const t = String(techName).trim();
    if (t) return t;
  }
  return "";
}

/**
 * @returns {number|null} Positive incentive rate/hour from UDT if present; null to mean "do not overwrite".
 */
export function hourlyRateFromUdtRow(row) {
  if (!row) return null;
  const a = Number(row.U_IncomePerHour);
  const b = Number(row.U_SIncomePerHour);
  const vals = [a, b].filter((n) => Number.isFinite(n) && n > 0);
  if (!vals.length) return null;
  return Math.max(...vals);
}
