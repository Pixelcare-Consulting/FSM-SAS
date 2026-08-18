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
import { formatSapApiTechList, hasRealSapInvoiceNumber } from "../utils/sapServiceCallTransform.js";

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
 * GET by $filter so hyphenated Code values (e.g. 2026-000090__33547) are not
 * sent as U_API_JOB_SCHEDULE('...') — SAP Service Layer treats that as invalid OData.
 */
export function buildApiJobScheduleGetEndpoint(entity, code) {
  const name = String(entity || "").trim() || "U_API_JOB_SCHEDULE";
  const filter = `Code eq '${odataKeyLiteral(code)}'`;
  return `${name}?$filter=${encodeURIComponent(filter)}`;
}

function pickJobTechFromSapPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const direct = payload.U_JobTech ?? payload.u_JobTech;
  if (direct != null && String(direct).trim() !== "") return direct;
  const row = Array.isArray(payload.value) ? payload.value[0] : null;
  const nested = row?.U_JobTech ?? row?.u_JobTech;
  if (nested != null && String(nested).trim() !== "") return nested;
  return null;
}

export function buildJobScheduleCode(jobNumber, activityId) {
  const j = String(jobNumber || "").trim();
  const a = String(activityId || "").trim();
  const raw = `${j}__${a}`.replace(/[^A-Za-z0-9._-]/g, "_");
  return raw.slice(0, 100) || `JS_${a}`.slice(0, 100);
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

function deriveScl5JobStatus(job, technicianJob) {
  const st = String(job?.status || "").toUpperCase();
  const assign = String(technicianJob?.assignment_status || "").toUpperCase();
  const completed = st.includes("COMPLET") || assign === "COMPLETED";
  if (completed && hasRealSapInvoiceNumber(job)) return "I";
  if (completed) return "NI";
  return "";
}

/**
 * Build U_API_JOB_SCHEDULE POST/PATCH bodies (no SAP call).
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

  const callRaw = String(serviceCallNumber ?? "").trim();
  const callParsed = parseInt(callRaw.replace(/'/g, ""), 10);
  const uCallId = Number.isFinite(callParsed)
    ? callParsed
    : callRaw || parseInt(String(sapActivityId), 10);

  const sched = scheduleRow || {};
  // All assigned techs, comma-joined with no space (tech1,tech2,tech3) —
  // matches formatSapApiTechList used for SCL5.U_API_Tech. Falls back to a
  // single sapTechCode for callers that don't pass the full list.
  const techList = technicianJobs ? formatSapApiTechList(technicianJobs) : "";
  const body = {
    U_JobNo: String(jobNumber),
    U_JobTech: techList || String(sapTechCode || "").trim(),
    U_CallID: uCallId,
  };

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

  return {
    entity,
    code,
    postBody: { Code: code, Name: code, ...body },
    patchBody: body,
  };
}

/**
 * Upsert row in SAP UDT @API_JOB_SCHEDULE (Service Layer entity e.g. U_API_JOB_SCHEDULE).
 */
export async function upsertApiJobScheduleRow(
  sessionCookies,
  { jobNumber, sapActivityId, sapTechCode, technicianJobs, serviceCallNumber, scheduleRow }
) {
  if (!sessionCookies || !jobNumber || !sapActivityId || !sapTechCode) {
    return { ok: false, skipped: true, reason: "missing_job_number_activity_or_tech_code" };
  }
  const { entity, code, postBody: fullPost, patchBody: body } = buildApiJobSchedulePayload({
    jobNumber,
    sapActivityId,
    sapTechCode,
    technicianJobs,
    serviceCallNumber,
    scheduleRow,
  });
  const key = odataKeyLiteral(code);
  let result;
  let createdBody = null;
  try {
    createdBody = await sapService.makeRequest(entity, { method: "POST", body: fullPost }, sessionCookies);
    result = { ok: true, action: "post", code, entity };
  } catch (err) {
    const msg = err?.message || String(err);
    const tryPatch =
      /400|409|already exists|duplicate|unique/i.test(msg) ||
      msg.includes("already") ||
      msg.includes("-2035");
    if (!tryPatch) {
      return { ok: false, error: msg, entity, code };
    }
    try {
      await sapService.makeRequest(`${entity}('${key}')`, { method: "PATCH", body }, sessionCookies);
      result = { ok: true, action: "patch", code, entity };
    } catch (err2) {
      return { ok: false, error: err2?.message || String(err2), entity, code };
    }
  }
  return attachStoredJobSchedule(sessionCookies, result, entity, code, createdBody);
}

/**
 * GET U_API_JOB_SCHEDULE after upsert so audit can show stored U_JobTech.
 */
async function attachStoredJobSchedule(sessionCookies, result, entity, code, createdBody) {
  const fromPost = pickJobTechFromSapPayload(createdBody);
  if (fromPost != null) {
    return {
      ...result,
      scheduleRowCount: 1,
      U_JobTech: fromPost,
    };
  }
  try {
    const stored = await sapService.makeRequest(
      buildApiJobScheduleGetEndpoint(entity, code),
      {},
      sessionCookies
    );
    return {
      ...result,
      scheduleRowCount: 1,
      U_JobTech: pickJobTechFromSapPayload(stored),
    };
  } catch (getErr) {
    return {
      ...result,
      scheduleRowCount: 1,
      U_JobTech: null,
      getError: getErr?.message || String(getErr),
    };
  }
}

/**
 * Update SCL5 user-defined fields via generic SQL (requires SAP sql01 / permissions).
 */
export async function updateScl5IncentiveLineSql(sessionCookies, fields) {
  const disabled = (process.env.SAP_JOB_INCENTIVE_SCL5_SQL || "1").trim() === "0";
  if (disabled) {
    return { ok: false, skipped: true, reason: "scl5_sql_disabled" };
  }
  const {
    clgId,
    uApiJobNumber,
    uInvNumber,
    uCmNumber,
    uJobIncome,
    uJobStatus,
    uCmStatus,
  } = fields;
  const esc = escapeSqlString;
  const income = Number(uJobIncome);
  const incomeSql = Number.isFinite(income) ? income : 0;
  const clg = parseInt(String(clgId), 10);
  if (!Number.isFinite(clg)) {
    return { ok: false, skipped: true, reason: "invalid_clgid" };
  }
  const sql = `UPDATE [SCL5] SET [U_API_JobNumber] = N'${esc(uApiJobNumber)}', [U_InvNumber] = N'${esc(
    uInvNumber
  )}', [U_CMNumber] = N'${esc(uCmNumber)}', [U_JobIncome] = ${incomeSql}, [U_JobStatus] = N'${esc(
    uJobStatus
  )}', [U_CMStatus] = N'${esc(uCmStatus)}' WHERE [ClgID] = ${clg}`;
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
  const cmStatus = String(job.sap_cm_status || "").trim().toUpperCase() || "";

  const scl5Result = await updateScl5IncentiveLineSql(sessionCookies, {
    clgId: activityId,
    uApiJobNumber: jobNumber,
    uInvNumber: hasRealSapInvoiceNumber(job) ? String(job.payment_qr_inv_number).trim() : "",
    uCmNumber: job.sap_cm_number || "",
    uJobIncome: job.sap_job_income,
    uJobStatus,
    uCmStatus: cmStatus,
  });

  const oclgResult = await updateOclgRecontactSql(sessionCookies, {
    clgCode: activityId,
    recontactDate,
  });

  return { schedule: scheduleResult, scl5: scl5Result, oclg: oclgResult };
}
