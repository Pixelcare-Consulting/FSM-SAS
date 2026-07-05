import sapService from "../../../lib/services/sapService";
import { syncUdtWorkingHrsForMonth } from "../../../lib/sap/udtOData";
import {
  AUDIT_STATUS,
  formatSapUdtHoursAuditDescription,
  writeSapUdtHoursAuditFromRequest,
} from "../../../lib/services/auditLog";

const UDT_ENTITY = "U_JOB_INCENTIVES";

function workingHrsFieldName() {
  return (process.env.SAP_JOB_INCENTIVES_WORKING_HRS_FIELD || "U_WorkingHrs").trim();
}

function auditContextFromBody(bodyIn) {
  return {
    technicianId: bodyIn.technicianId ?? null,
    technicianName: bodyIn.technicianName ?? null,
    sapTechCode: bodyIn.sapTechCode ?? null,
    bulkBatchId: bodyIn.bulkBatchId ?? null,
    bulkIndex: bodyIn.bulkIndex ?? null,
    bulkTotal: bodyIn.bulkTotal ?? null,
  };
}

function writeUdtAudit(req, fields) {
  return writeSapUdtHoursAuditFromRequest(req, {
    entityType: "technician",
    ...fields,
  });
}

/**
 * PATCH a single U_JOB_INCENTIVES row (Service Layer) — typically to sync portal-computed hours.
 * Body: { code: string | number, workingHrs: number }
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With, Accept");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const sessionCookies = sapService.getSessionCookies(req);
  if (!sessionCookies) {
    writeUdtAudit(req, {
      entityId: null,
      entityLabel: "SAP UDT",
      description: formatSapUdtHoursAuditDescription({ error: "SAP session required" }),
      details: { error: "SAP session required" },
      status: AUDIT_STATUS.FAILURE,
    });
    return res.status(401).json({ success: false, error: "SAP session required" });
  }

  const bodyIn = req.body && typeof req.body === "object" ? req.body : {};
  const ctx = auditContextFromBody(bodyIn);
  const code = bodyIn.code != null && bodyIn.code !== "" ? String(bodyIn.code).trim() : "";
  const name = bodyIn.name != null && bodyIn.name !== "" ? String(bodyIn.name).trim() : "";
  const year = bodyIn.year;
  const month = bodyIn.month;
  const hrs = Number(bodyIn.workingHrs);

  const entityId = ctx.technicianId || code || name || null;
  const entityLabel = ctx.technicianName || ctx.sapTechCode || code || name || "SAP UDT";

  if (!code && !name) {
    writeUdtAudit(req, {
      entityId,
      entityLabel,
      description: formatSapUdtHoursAuditDescription({
        workerName: ctx.technicianName,
        year,
        month,
        error: "code or name (UDT row key) is required",
      }),
      details: { ...ctx, year, month, error: "code or name (UDT row key) is required" },
      status: AUDIT_STATUS.FAILURE,
    });
    return res.status(400).json({ success: false, error: "code or name (UDT row key) is required" });
  }
  if (!Number.isFinite(hrs) || hrs < 0) {
    writeUdtAudit(req, {
      entityId,
      entityLabel,
      description: formatSapUdtHoursAuditDescription({
        workerName: ctx.technicianName,
        year,
        month,
        code,
        error: "workingHrs must be a non-negative number",
      }),
      details: { ...ctx, year, month, udtCode: code || name, error: "workingHrs must be a non-negative number" },
      status: AUDIT_STATUS.FAILURE,
    });
    return res.status(400).json({ success: false, error: "workingHrs must be a non-negative number" });
  }

  const field = workingHrsFieldName();
  const zeroCodes = Array.isArray(bodyIn.zeroCodes)
    ? bodyIn.zeroCodes.map((c) => String(c).trim()).filter(Boolean)
    : [];

  try {
    const result = await syncUdtWorkingHrsForMonth(sapService, sessionCookies, UDT_ENTITY, {
      code,
      name,
      year,
      month,
      workingHrs: hrs,
      zeroCodes,
      field,
    });

    const zeroedDuplicateCodes = result.zeroed || [];
    writeUdtAudit(req, {
      entityId,
      entityLabel,
      description: formatSapUdtHoursAuditDescription({
        workerName: ctx.technicianName,
        year,
        month,
        workingHrs: hrs,
        code: result.key || code,
        zeroedCount: zeroedDuplicateCodes.length,
      }),
      details: {
        ...ctx,
        year,
        month,
        udtCode: result.key || code,
        workingHrs: hrs,
        field,
        zeroedDuplicateCodes,
      },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(200).json({
      success: true,
      code: result.key,
      field,
      workingHrs: hrs,
      zeroedDuplicateCodes,
    });
  } catch (error) {
    console.error("SAP U_JOB_INCENTIVES PATCH error:", error);
    const raw = error?.message || String(error);
    let message = raw || "Failed to update SAP incentive row";
    if (/query syntax|\b203\b/i.test(raw)) {
      message =
        "SAP rejected the UDT row key (OData syntax). The portal will use Code from SAP; if Code is empty, " +
        "ensure the incentive row exists for that month and refresh UDT. Raw: " +
        raw;
    } else if (raw.includes("-1000") && /invalid/i.test(raw)) {
      message =
        "SAP rejected the field name or value (-1000). Confirm the working-hours UDF on @JOB_INCENTIVES " +
        `(try SAP_JOB_INCENTIVES_WORKING_HRS_FIELD, default U_WorkingHrs). Raw: ${raw}`;
    }

    writeUdtAudit(req, {
      entityId,
      entityLabel,
      description: formatSapUdtHoursAuditDescription({
        workerName: ctx.technicianName,
        year,
        month,
        code,
        error: message,
      }),
      details: {
        ...ctx,
        year,
        month,
        udtCode: code || name,
        workingHrs: hrs,
        field,
        zeroedDuplicateCodes: zeroCodes,
        error: message,
      },
      status: AUDIT_STATUS.FAILURE,
    });

    return res.status(502).json({ success: false, error: message });
  }
}
