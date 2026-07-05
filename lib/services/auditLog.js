/**
 * Central audit logging service.
 * Writes to audit_logs table for full traceability (who / what / when / where).
 */

import { getSupabaseAdmin } from '../supabase/server';
import {
  JOB_SYNC_LIFECYCLE,
  SAP_UDT_PUSH_LIFECYCLE,
  formatJobSyncAuditDescription,
  formatSapUdtHoursAuditDescription,
  formatSapCustomerSyncAuditDescription,
} from './auditLogFormatters';

export {
  JOB_SYNC_LIFECYCLE,
  SAP_UDT_PUSH_LIFECYCLE,
  formatJobSyncAuditDescription,
  formatSapUdtHoursAuditDescription,
  formatSapCustomerSyncAuditDescription,
};

export const AUDIT_CATEGORIES = {
  AUTH: 'auth',
  JOB: 'job',
  WORKER: 'worker',
  CUSTOMER: 'customer',
  LEAD: 'lead',
  MIGRATION: 'migration',
  SAP: 'sap',
  SETTINGS: 'settings',
  MEMO: 'memo',
  EMAIL: 'email',
  CALENDAR: 'calendar',
  SYSTEM: 'system',
};

export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  SESSION_RESET: 'SESSION_RESET',
  JOB_CREATE: 'JOB_CREATE',
  JOB_UPDATE: 'JOB_UPDATE',
  JOB_DELETE: 'JOB_DELETE',
  JOB_SYNC_SAP: 'JOB_SYNC_SAP',
  WORKER_CREATE: 'WORKER_CREATE',
  WORKER_UPDATE: 'WORKER_UPDATE',
  CUSTOMER_CREATE: 'CUSTOMER_CREATE',
  CUSTOMER_UPDATE: 'CUSTOMER_UPDATE',
  MIGRATION_JOBS: 'MIGRATION_JOBS',
  MIGRATION_USERS: 'MIGRATION_USERS',
  AIFM_IMPORT: 'AIFM_IMPORT',
  SETTINGS_UPDATE: 'SETTINGS_UPDATE',
  MEMO_CREATE: 'MEMO_CREATE',
  MEMO_UPDATE: 'MEMO_UPDATE',
  MEMO_DELETE: 'MEMO_DELETE',
  EMAIL_JOB_COMPLETED: 'EMAIL_JOB_COMPLETED',
  EMAIL_JOB_ASSIGNED: 'EMAIL_JOB_ASSIGNED',
  EMAIL_DISPATCH: 'EMAIL_DISPATCH',
  SAP_UDT_HOURS_PUSH: 'SAP_UDT_HOURS_PUSH',
  SAP_CUSTOMER_SYNC: 'SAP_CUSTOMER_SYNC',
  SAP_CUSTOMER_DELTA_SYNC: 'SAP_CUSTOMER_DELTA_SYNC',
  WORKER_SAP_SNAPSHOT_SYNC: 'WORKER_SAP_SNAPSHOT_SYNC',
  WORKER_DELETE: 'WORKER_DELETE',
  CUSTOMER_DELETE: 'CUSTOMER_DELETE',
  LEAD_CREATE: 'LEAD_CREATE',
  LEAD_UPDATE: 'LEAD_UPDATE',
  LEAD_DELETE: 'LEAD_DELETE',
  LEAD_CONVERT: 'LEAD_CONVERT',
  LEAD_SYNC: 'LEAD_SYNC',
  JOB_PDF_GENERATE: 'JOB_PDF_GENERATE',
  JOB_MEDIA_UPLOAD: 'JOB_MEDIA_UPLOAD',
  JOB_MEDIA_DELETE: 'JOB_MEDIA_DELETE',
  FOLLOWUP_CREATE: 'FOLLOWUP_CREATE',
  FOLLOWUP_UPDATE: 'FOLLOWUP_UPDATE',
  FOLLOWUP_DELETE: 'FOLLOWUP_DELETE',
  JOB_MESSAGE_CREATE: 'JOB_MESSAGE_CREATE',
  JOB_PAYMENT_RECEIVED: 'JOB_PAYMENT_RECEIVED',
  AIFM_ASSIGN_CUSTOMERS: 'AIFM_ASSIGN_CUSTOMERS',
  AIFM_SYNC_ADDRESS: 'AIFM_SYNC_ADDRESS',
  CALENDAR_EVENT_CREATE: 'CALENDAR_EVENT_CREATE',
  CALENDAR_EVENT_UPDATE: 'CALENDAR_EVENT_UPDATE',
  CALENDAR_EVENT_DELETE: 'CALENDAR_EVENT_DELETE',
};

export const AUDIT_STATUS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  WARNING: 'warning',
  PENDING: 'pending',
};

export const AUDIT_SOURCE = {
  PORTAL: 'portal',
  API: 'api',
  SYSTEM: 'system',
  CRON: 'cron',
  MIGRATION: 'migration',
};

/** List/grid select — omits heavy JSONB and request metadata (load via detail API). */
export const AUDIT_LOG_LIST_SELECT =
  'id, user_id, user_email, user_name, action, category, entity_type, entity_id, entity_label, description, status, source, created_at';

/**
 * Write one JOB_SYNC_SAP audit row (non-throwing; safe to call without await).
 */
export function writeJobSyncAuditFromRequest(req, fields) {
  return writeAuditLogFromRequest(req, {
    action: AUDIT_ACTIONS.JOB_SYNC_SAP,
    category: AUDIT_CATEGORIES.SAP,
    source: AUDIT_SOURCE.API,
    ...fields,
  });
}

/**
 * Write one SAP_UDT_HOURS_PUSH audit row (non-throwing).
 */
export function writeSapUdtHoursAuditFromRequest(req, fields) {
  return writeAuditLogFromRequest(req, {
    action: AUDIT_ACTIONS.SAP_UDT_HOURS_PUSH,
    category: AUDIT_CATEGORIES.SAP,
    source: AUDIT_SOURCE.API,
    ...fields,
  });
}

/**
 * Write one SAP_CUSTOMER_SYNC audit row (non-throwing).
 */
export function writeSapCustomerSyncAuditFromRequest(req, fields) {
  return writeAuditLogFromRequest(req, {
    action: AUDIT_ACTIONS.SAP_CUSTOMER_SYNC,
    category: AUDIT_CATEGORIES.SAP,
    source: AUDIT_SOURCE.API,
    ...fields,
  });
}

/**
 * Build incentive schedule summary for JOB_SYNC_SAP details.
 */
function buildIncentiveScheduleDetails(incentiveResult) {
  if (!incentiveResult) return null;
  const schedule = incentiveResult.schedule ?? incentiveResult;
  if (!schedule || typeof schedule !== 'object') return null;
  return {
    ok: schedule.ok ?? null,
    error: schedule.error ?? null,
    scheduleRowCount: schedule.scheduleRowCount ?? schedule.rowCount ?? null,
    skipped: schedule.skipped ?? null,
    reason: schedule.reason ?? null,
  };
}

/**
 * Centralized JOB_SYNC_SAP audit for all sync callers.
 */
export function logJobSyncResult({
  req,
  jobId,
  jobNumber = null,
  result = {},
  source = AUDIT_SOURCE.API,
  userName = null,
} = {}) {
  const jn = result.job_number ?? jobNumber ?? jobId ?? 'n/a';
  const incentiveSchedule = buildIncentiveScheduleDetails(result.incentiveResult);

  const details = {
    job_number: result.job_number ?? jobNumber ?? null,
    sap_activity_id: result.sap_activity_id ?? null,
    serviceCallNo: result.serviceCallNo ?? null,
    serviceCallMerged: result.serviceCallMerged ?? false,
    syncAction: result.syncAction ?? null,
    serviceCall: result.serviceCall ?? null,
    error: result.error ?? null,
    source: source || AUDIT_SOURCE.API,
  };
  if (incentiveSchedule) {
    details.incentiveSchedule = incentiveSchedule;
  }

  return writeAuditLogFromRequest(req, {
    action: AUDIT_ACTIONS.JOB_SYNC_SAP,
    category: AUDIT_CATEGORIES.SAP,
    source: source || AUDIT_SOURCE.API,
    userName,
    entityType: 'job',
    entityId: jobId,
    entityLabel: jn,
    description: formatJobSyncAuditDescription({ result, jobNumber: jn, jobId }),
    details,
    status: result.success ? AUDIT_STATUS.SUCCESS : AUDIT_STATUS.FAILURE,
  });
}

/**
 * Audit one transactional job email attempt (sent, skipped, or failed).
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} [opts.supabase]
 * @param {import('next').NextApiRequest} [opts.req]
 * @param {string} opts.jobId
 * @param {string | null} [opts.jobNumber]
 * @param {'jobCompleted' | 'jobAssigned'} opts.templateKey
 * @param {string} [opts.to]
 * @param {string[]} [opts.cc]
 * @param {{ ok?: boolean, skipped?: boolean, reason?: string, error?: string, messageId?: string }} opts.result
 */
export function writeJobEmailAudit({
  supabase,
  req,
  jobId,
  jobNumber = null,
  templateKey,
  to = '',
  cc = [],
  result = {},
}) {
  const action =
    templateKey === 'jobAssigned'
      ? AUDIT_ACTIONS.EMAIL_JOB_ASSIGNED
      : AUDIT_ACTIONS.EMAIL_JOB_COMPLETED;

  let status = AUDIT_STATUS.SUCCESS;
  if (result.skipped) {
    status = AUDIT_STATUS.WARNING;
  } else if (!result.ok) {
    status = AUDIT_STATUS.FAILURE;
  }

  const toLabel = to ? String(to).trim() : '';
  let description;
  if (result.skipped) {
    description = `Job email skipped (${result.reason || 'unknown'})`;
  } else if (result.ok) {
    description = toLabel
      ? `Job email sent to ${toLabel}`
      : 'Job email sent successfully';
  } else {
    description = `Job email failed: ${result.error || 'unknown error'}`;
  }

  const fields = {
    supabase,
    action,
    category: AUDIT_CATEGORIES.EMAIL,
    entityType: 'job',
    entityId: jobId,
    entityLabel: jobNumber != null && String(jobNumber).trim() !== '' ? String(jobNumber) : jobId,
    description,
    details: {
      templateKey,
      to: toLabel || null,
      cc: Array.isArray(cc) ? cc : [],
      reason: result.reason || null,
      messageId: result.messageId || null,
      error: result.error || null,
      skipped: Boolean(result.skipped),
    },
    status,
    source: AUDIT_SOURCE.API,
  };

  if (req) {
    return writeAuditLogFromRequest(req, fields);
  }
  return writeAuditLog(fields);
}

function cleanObject(obj) {
  if (!obj || typeof obj !== 'object') return {};
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value !== undefined) acc[key] = value;
    return acc;
  }, {});
}

/**
 * Extract actor + request metadata from an API request.
 */
export function getUserContextFromRequest(req) {
  const uid = req?.cookies?.uid || null;
  const email = req?.cookies?.email || null;
  const fullName = req?.cookies?.fullName || null;
  const ip =
    req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req?.socket?.remoteAddress ||
    null;
  const userAgent = req?.headers?.['user-agent'] || null;

  return { userId: uid, userEmail: email, userName: fullName, ipAddress: ip, userAgent };
}

/**
 * Write a single audit log entry (non-throwing).
 */
export async function writeAuditLog({
  supabase: supabaseClient,
  userId = null,
  userEmail = null,
  userName = null,
  action,
  category = AUDIT_CATEGORIES.SYSTEM,
  entityType = null,
  entityId = null,
  entityLabel = null,
  description = null,
  details = {},
  changes = null,
  ipAddress = null,
  userAgent = null,
  status = AUDIT_STATUS.SUCCESS,
  source = AUDIT_SOURCE.API,
} = {}) {
  if (!action) return { ok: false, error: 'action is required' };

  try {
    const supabase = supabaseClient || getSupabaseAdmin();
    const row = {
      user_id: userId && userId !== 'SYSTEM' ? userId : null,
      user_email: userEmail || null,
      user_name: userName || null,
      action,
      category,
      entity_type: entityType,
      entity_id: entityId != null ? String(entityId) : null,
      entity_label: entityLabel,
      description,
      details: cleanObject(details),
      changes: changes || null,
      ip_address: ipAddress,
      user_agent: userAgent,
      status,
      source,
    };

    const { data, error } = await supabase.from('audit_logs').insert(row).select('id').single();
    if (error) throw error;
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[auditLog] Failed to write:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Convenience: write audit log using request context.
 */
export async function writeAuditLogFromRequest(req, fields) {
  const ctx = getUserContextFromRequest(req);
  return writeAuditLog({
    ...ctx,
    userId: fields?.userId ?? ctx.userId,
    userEmail: fields?.userEmail ?? ctx.userEmail,
    userName: fields?.userName ?? ctx.userName,
    ipAddress: fields?.ipAddress ?? ctx.ipAddress,
    userAgent: fields?.userAgent ?? ctx.userAgent,
    ...fields,
  });
}

/**
 * Query audit logs with filters and pagination.
 */
export async function queryAuditLogs({
  supabase: supabaseClient,
  page = 1,
  limit = 25,
  category = null,
  action = null,
  status = null,
  entityType = null,
  entityId = null,
  userId = null,
  search = null,
  dateFrom = null,
  dateTo = null,
} = {}) {
  const supabase = supabaseClient || getSupabaseAdmin();
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  let query = supabase
    .from('audit_logs')
    .select(AUDIT_LOG_LIST_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (category && category !== 'all') query = query.eq('category', category);
  if (action && action !== 'all') query = query.eq('action', action);
  if (status && status !== 'all') query = query.eq('status', status);
  if (entityType && entityType !== 'all') query = query.eq('entity_type', entityType);
  if (entityId) query = query.eq('entity_id', String(entityId));
  if (userId) query = query.eq('user_id', userId);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);

  if (search && search.trim()) {
    const term = `%${search.trim().replace(/[,%.]/g, ' ')}%`;
    query = query.or(
      [
        `description.ilike.${term}`,
        `entity_label.ilike.${term}`,
        `user_email.ilike.${term}`,
        `user_name.ilike.${term}`,
        `action.ilike.${term}`,
      ].join(',')
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    logs: data || [],
    total: count ?? 0,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil((count ?? 0) / safeLimit) || 1,
  };
}

/**
 * Build a changes object from before/after snapshots (only differing keys).
 */
export function buildChanges(before = {}, after = {}) {
  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    const b = before?.[key];
    const a = after?.[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[key] = { before: b ?? null, after: a ?? null };
    }
  }
  return Object.keys(changes).length ? changes : null;
}
