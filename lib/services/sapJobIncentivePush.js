/**
 * Push FSM job/technician data required by the SAP Job Incentives add-on (@API_JOB_SCHEDULE, SCL5).
 * Entity names and SQL path can be tuned via environment variables.
 */

import sapService from "./sapService.js";
import { pickJobIncentiveRecontactDate } from "../utils/sapActivityTransform.js";
import {
  dateToSapScheduleIso,
  timeToSapHhmm,
  pickPrimaryScheduleRow,
} from "../utils/sapJobScheduleTransform.js";
import { listSapApiTechs } from "../utils/sapServiceCallTransform.js";

export { dateToSapScheduleIso, timeToSapHhmm, pickPrimaryScheduleRow } from "../utils/sapJobScheduleTransform.js";

function escapeSqlString(s) {
  return String(s ?? "").replace(/'/g, "''");
}

function odataKeyLiteral(s) {
  return String(s ?? "").replace(/'/g, "''");
}

export function getApiJobScheduleEntityName() {
  return (process.env.SAP_SL_UDT_API_JOB_SCHEDULE_ENTITY || "U_API_JOB_SCHEDULE").trim();
}

/**
 * GET by Name and/or U_JobNo. SAP assigns a numeric Code on POST, so looking
 * up Code eq '2026-000090__33547' never finds the row and causes duplicate POSTs.
 */
export function buildApiJobScheduleLookupEndpoint(entity, { name, jobNo } = {}) {
  const entityName = String(entity || "").trim() || "U_API_JOB_SCHEDULE";
  const clauses = [];
  const nameKey = String(name || "").trim();
  const jobKey = String(jobNo || "").trim();
  if (nameKey) clauses.push(`Name eq '${odataKeyLiteral(nameKey)}'`);
  if (jobKey) clauses.push(`U_JobNo eq '${odataKeyLiteral(jobKey)}'`);
  const filter = clauses.join(" or ") || `U_JobNo eq ''`;
  return `${entityName}?$filter=${encodeURIComponent(filter)}`;
}

/**
 * PATCH / GET key using SAP's Code. @API_JOB_SCHEDULE's Code is a numeric
 * Service Layer key: U_API_JOB_SCHEDULE(1293354) works, but the quoted
 * ('1293354') form is rejected with 203 "Error in query syntax". That made
 * every PATCH of an existing row fail, so U_JobTech was never updated.
 */
export function buildApiJobScheduleCodeEndpoint(entity, sapCode) {
  const entityName = String(entity || "").trim() || "U_API_JOB_SCHEDULE";
  const key = String(sapCode ?? "").trim();
  if (/^\d+$/.test(key)) return `${entityName}(${key})`;
  return `${entityName}('${odataKeyLiteral(key)}')`;
}

export function scheduleRowsFromPayload(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.value)) return payload.value.filter(Boolean);
  if (payload.Code != null && String(payload.Code).trim() !== "") return [payload];
  return [];
}

function rowJobTech(row) {
  return String(row?.U_JobTech ?? row?.u_JobTech ?? "").trim();
}

function hasScheduleCode(row) {
  return row?.Code != null && String(row.Code).trim() !== "";
}

function sameTech(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export function buildJobScheduleCode(jobNumber, activityId) {
  const j = String(jobNumber || "").trim();
  const a = String(activityId || "").trim();
  const raw = `${j}__${a}`.replace(/[^A-Za-z0-9._-]/g, "_");
  return raw.slice(0, 100) || `JS_${a}`.slice(0, 100);
}

/**
 * Name for a tech's @API_JOB_SCHEDULE row. The first tech keeps the plain
 * job key (what single-tech jobs have always used); others get a tech suffix
 * so Names stay unique per job.
 */
export function buildJobScheduleRowName(baseName, tech, index) {
  if (index === 0) return baseName;
  const suffix = String(tech || "").trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return `${baseName}__${suffix || index + 1}`.slice(0, 100);
}

/**
 * Reconcile existing @API_JOB_SCHEDULE rows of a job with its techs so the
 * table holds exactly one row per tech. The Job Incentives SPs group by
 * U_JobTech and join U_JobTech to @JOB_INCENTIVES.U_TechName, so a combined
 * "TechA,TechB" value shows up as a team row with no expenses or hours.
 * SCL5.U_JobIncome is already the per-tech share, so one row per tech does
 * not double count.
 *
 * Rows already holding a tech are kept; leftover rows are repurposed before
 * anything is created, and only the surplus is deleted.
 *
 * @param {{ existingRows: object[], techs: string[], baseName: string }} input
 * @returns {{ patches: {code: *, tech: string}[], deletes: *[], posts: {name: string, tech: string}[] }}
 */
export function planApiJobScheduleRows({ existingRows, techs, baseName }) {
  const rows = (existingRows || []).filter(hasScheduleCode);
  const unusedRows = [...rows];
  const patches = [];
  const unmatchedTechs = [];

  for (const tech of techs) {
    const idx = unusedRows.findIndex((r) => sameTech(rowJobTech(r), tech));
    if (idx === -1) {
      unmatchedTechs.push(tech);
      continue;
    }
    patches.push({ code: unusedRows[idx].Code, tech });
    unusedRows.splice(idx, 1);
  }

  const posts = [];
  const usedNames = new Set(rows.map((r) => String(r.Name ?? "")));
  for (const tech of unmatchedTechs) {
    const reusable = unusedRows.shift();
    if (reusable) {
      patches.push({ code: reusable.Code, tech });
      continue;
    }
    let name = buildJobScheduleRowName(baseName, tech, techs.indexOf(tech));
    for (let n = 2; usedNames.has(name); n++) name = `${baseName}__${n}`.slice(0, 100);
    usedNames.add(name);
    posts.push({ name, tech });
  }

  return { patches, deletes: unusedRows.map((r) => r.Code), posts };
}

export function pickPrimaryTechnicianJob(technicianJobs) {
  const rows = (technicianJobs || []).filter((tj) => !tj.deleted_at);
  if (!rows.length) return null;
  const order = ["COMPLETED", "STARTED", "ASSIGNED"];
  for (const st of order) {
    const hit = rows.find((r) => String(r.assignment_status || "").toUpperCase() === st);
    if (hit) return hit;
  }
  return rows[0];
}

/** Portal never invoices; Document Automation owns I / U_InvNumber. */
export function deriveScl5JobStatus(_job, _technicianJob) {
  return "NI";
}

/**
 * Techs that each get their own @API_JOB_SCHEDULE row: every assigned tech
 * (same list as SCL5.U_API_Tech), else the single sapTechCode for callers
 * that don't pass the assignments.
 */
export function resolveApiJobScheduleTechs({ technicianJobs, sapTechCode }) {
  const techs = technicianJobs ? listSapApiTechs(technicianJobs) : [];
  if (techs.length) return techs;
  const single = String(sapTechCode || "").trim();
  return single ? [single] : [];
}

/**
 * Build U_API_JOB_SCHEDULE bodies, one per tech (no SAP call).
 * postBody / patchBody are the first tech's, kept for the sync preview.
 */
export function buildApiJobSchedulePayload({
  jobNumber,
  sapActivityId,
  sapTechCode,
  technicianJobs,
  serviceCallNumber,
  scheduleRow,
}) {
  const entity = getApiJobScheduleEntityName();
  const code = buildJobScheduleCode(jobNumber, sapActivityId);
  const techs = resolveApiJobScheduleTechs({ technicianJobs, sapTechCode });
  const sharedBody = buildApiJobScheduleSharedBody({ jobNumber, serviceCallNumber, scheduleRow });

  const rows = techs.map((tech, index) => {
    const patchBody = { ...sharedBody, U_JobTech: tech };
    const name = buildJobScheduleRowName(code, tech, index);
    return { tech, name, postBody: { Name: name, ...patchBody }, patchBody };
  });
  const first = rows[0] || { postBody: { Name: code, ...sharedBody }, patchBody: sharedBody };

  return {
    entity,
    code,
    techs,
    sharedBody,
    rows,
    postBody: first.postBody,
    patchBody: first.patchBody,
  };
}

/** Job / schedule fields shared by every tech row of a job. */
function buildApiJobScheduleSharedBody({ jobNumber, serviceCallNumber, scheduleRow }) {
  const callRaw = String(serviceCallNumber ?? "").trim();
  const callParsed = parseInt(callRaw.replace(/'/g, ""), 10);
  const uCallId = Number.isFinite(callParsed) ? callParsed : undefined;

  const sched = scheduleRow || {};
  const body = { U_JobNo: String(jobNumber) };
  if (uCallId != null) body.U_CallID = uCallId;

  const jsIso = dateToSapScheduleIso(sched.jsdate);
  const jeIso = dateToSapScheduleIso(sched.jedate || sched.jsdate);
  if (jsIso) body.U_JSDate = jsIso;
  if (jeIso) body.U_JEDate = jeIso;

  const jStart = timeToSapHhmm(sched.jstime);
  const jEnd = timeToSapHhmm(sched.jetime);
  if (jStart) body.U_JSTime = jStart;
  if (jEnd) body.U_JETime = jEnd;

  if (sched.dur != null && String(sched.dur).trim() !== "") {
    body.U_DurType = sched.dur_type || "Hours";
    body.U_Dur = String(sched.dur);
  }

  if (sched.address) body.U_Address = String(sched.address).slice(0, 254);

  return body;
}

/**
 * Sync @API_JOB_SCHEDULE (Service Layer entity e.g. U_API_JOB_SCHEDULE) to one
 * row per assigned tech: PATCH kept rows, DELETE surplus rows, POST missing ones.
 */
export async function upsertApiJobScheduleRow(
  sessionCookies,
  { jobNumber, sapActivityId, sapTechCode, technicianJobs, serviceCallNumber, scheduleRow }
) {
  // Techs come from the full assignment list; sapTechCode is only a fallback.
  // Guarding on the primary tech's sap_tech_code alone used to skip the whole
  // write and blank the Tech column in Document Automation.
  const techs = resolveApiJobScheduleTechs({ technicianJobs, sapTechCode });

  if (!sessionCookies || !jobNumber || !sapActivityId || !techs.length) {
    return {
      ok: false,
      skipped: true,
      reason: "missing_job_number_activity_or_tech",
      missing: {
        sessionCookies: !sessionCookies,
        jobNumber: !jobNumber,
        sapActivityId: !sapActivityId,
        tech: !techs.length,
      },
    };
  }
  const { entity, code, sharedBody } = buildApiJobSchedulePayload({
    jobNumber,
    sapActivityId,
    sapTechCode,
    technicianJobs,
    serviceCallNumber,
    scheduleRow,
  });
  const lookupUrl = buildApiJobScheduleLookupEndpoint(entity, { name: code, jobNo: jobNumber });
  let existingRows = [];
  try {
    const listed = await sapService.makeRequest(lookupUrl, {}, sessionCookies);
    existingRows = scheduleRowsFromPayload(listed);
  } catch (lookupErr) {
    return { ok: false, error: lookupErr?.message || String(lookupErr), entity, code };
  }

  const plan = planApiJobScheduleRows({ existingRows, techs, baseName: code });
  const errors = [];
  const patchedCodes = [];
  const deletedCodes = [];
  const createdCodes = [];

  for (const { code: rowCode, tech } of plan.patches) {
    try {
      await sapService.makeRequest(
        buildApiJobScheduleCodeEndpoint(entity, rowCode),
        { method: "PATCH", body: { ...sharedBody, U_JobTech: tech } },
        sessionCookies
      );
      patchedCodes.push(rowCode);
    } catch (err) {
      errors.push(`PATCH ${rowCode} (${tech}): ${err?.message || String(err)}`);
    }
  }

  for (const rowCode of plan.deletes) {
    try {
      await sapService.makeRequest(
        buildApiJobScheduleCodeEndpoint(entity, rowCode),
        { method: "DELETE" },
        sessionCookies
      );
      deletedCodes.push(rowCode);
    } catch (err) {
      errors.push(`DELETE ${rowCode}: ${err?.message || String(err)}`);
    }
  }

  for (const { name, tech } of plan.posts) {
    try {
      const created = await sapService.makeRequest(
        entity,
        { method: "POST", body: { Name: name, ...sharedBody, U_JobTech: tech } },
        sessionCookies
      );
      createdCodes.push(created?.Code ?? name);
    } catch (err) {
      errors.push(`POST ${name} (${tech}): ${err?.message || String(err)}`);
    }
  }

  if (errors.length) {
    console.error(`@API_JOB_SCHEDULE sync for job ${jobNumber} had errors:`, errors);
  }
  const result = {
    ok: errors.length === 0,
    action: plan.posts.length && !plan.patches.length ? "post" : "patch",
    code,
    entity,
    techs,
    patchedCodes,
    deletedCodes,
    createdCodes,
    ...(errors.length ? { error: errors.join("; ") } : {}),
  };
  return attachStoredJobSchedule(sessionCookies, result, entity, { name: code, jobNo: jobNumber });
}

/**
 * GET U_API_JOB_SCHEDULE after the sync so the audit shows what SAP stored.
 */
async function attachStoredJobSchedule(sessionCookies, result, entity, { name, jobNo } = {}) {
  try {
    const stored = await sapService.makeRequest(
      buildApiJobScheduleLookupEndpoint(entity, { name, jobNo }),
      {},
      sessionCookies
    );
    const rows = scheduleRowsFromPayload(stored);
    return {
      ...result,
      scheduleRowCount: rows.length,
      U_JobTech: rows.map(rowJobTech).filter(Boolean).join(" | ") || null,
    };
  } catch (getErr) {
    return {
      ...result,
      scheduleRowCount: null,
      U_JobTech: null,
      getError: getErr?.message || String(getErr),
    };
  }
}

/**
 * Build the SCL5 UPDATE. U_CMNumber, U_JobIncome and U_CMStatus are owned by
 * SAP / Document Automation — the portal has no UI for them (jobs.sap_job_income
 * is always the default 0) — so they are never written here. U_JobStatus never
 * reverts a line Document Automation already invoiced ('I').
 * Returns null for a bad ClgID.
 */
export function buildScl5IncentiveUpdateSql({ clgId, uApiJobNumber, uJobStatus }) {
  const clg = parseInt(String(clgId), 10);
  if (!Number.isFinite(clg)) return null;

  const esc = escapeSqlString;
  const sets = [`[U_API_JobNumber] = N'${esc(uApiJobNumber)}'`];

  const jobStatus = String(uJobStatus ?? "").trim();
  if (jobStatus) {
    sets.push(
      `[U_JobStatus] = CASE WHEN [U_JobStatus] = N'I' THEN [U_JobStatus] ELSE N'${esc(jobStatus)}' END`
    );
  }

  return `UPDATE [SCL5] SET ${sets.join(", ")} WHERE [ClgID] = ${clg}`;
}

/**
 * Update SCL5 user-defined fields via generic SQL (requires SAP sql01 / permissions).
 */
export async function updateScl5IncentiveLineSql(sessionCookies, fields) {
  const disabled = (process.env.SAP_JOB_INCENTIVE_SCL5_SQL || "1").trim() === "0";
  if (disabled) {
    return { ok: false, skipped: true, reason: "scl5_sql_disabled" };
  }
  const sql = buildScl5IncentiveUpdateSql(fields);
  if (!sql) {
    return { ok: false, skipped: true, reason: "invalid_clgid" };
  }
  try {
    const rows = await sapService.executeCustomSQL("sql01", sql, sessionCookies);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Set OCLG.Recontact via SQL (not writable on Activities POST/PATCH in this SAP build).
 */
export async function updateOclgRecontactSql(sessionCookies, { clgCode, recontactDate }) {
  const disabled = (process.env.SAP_JOB_INCENTIVE_OCLG_SQL || "1").trim() === "0";
  if (disabled || !clgCode || !recontactDate) {
    return { ok: false, skipped: true, reason: "oclg_sql_disabled_or_missing_fields" };
  }
  const clg = parseInt(String(clgCode), 10);
  if (!Number.isFinite(clg)) {
    return { ok: false, skipped: true, reason: "invalid_clg_code" };
  }
  const date = String(recontactDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, skipped: true, reason: "invalid_recontact_date" };
  }
  const sql = `UPDATE OCLG SET Recontact = '${date}' WHERE ClgCode = ${clg}`;
  try {
    const rows = await sapService.executeCustomSQL("sql01", sql, sessionCookies);
    return { ok: true, rows, recontact: date };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * After Activity sync: push @API_JOB_SCHEDULE and best-effort SCL5 UDFs.
 */
export async function pushJobIncentiveSapData({ sessionCookies, job, jobScheduleRows = [] }) {
  if (!sessionCookies || !job) {
    return { schedule: { ok: false, skipped: true }, scl5: { ok: false, skipped: true }, oclg: { ok: false, skipped: true } };
  }
  const activityId = job.sap_activity_id;
  const jobNumber = job.job_number;
  const techRow = pickPrimaryTechnicianJob(job.technician_jobs);
  const sapTechCode = techRow?.technician?.sap_tech_code;
  const recontactDate = pickJobIncentiveRecontactDate(job, jobScheduleRows);

  const scheduleRow = pickPrimaryScheduleRow(jobScheduleRows);
  const serviceCallNumber = job?.service_call?.call_number ?? null;

  const scheduleResult = await upsertApiJobScheduleRow(sessionCookies, {
    jobNumber,
    sapActivityId: activityId,
    sapTechCode,
    technicianJobs: job.technician_jobs,
    serviceCallNumber,
    scheduleRow,
  });

  const uJobStatus = deriveScl5JobStatus(job, techRow);

  const scl5Result = await updateScl5IncentiveLineSql(sessionCookies, {
    clgId: activityId,
    uApiJobNumber: jobNumber,
    uJobStatus,
  });

  const oclgResult = await updateOclgRecontactSql(sessionCookies, {
    clgCode: activityId,
    recontactDate,
  });

  return { schedule: scheduleResult, scl5: scl5Result, oclg: oclgResult };
}
