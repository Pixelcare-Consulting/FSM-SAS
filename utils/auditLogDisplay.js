/**
 * Human-readable formatting for audit log UI.
 */

import {
  findJobStatusEntry,
  formatJobStatusDisplayLabel,
} from './jobStatusDefaults';

const ACTION_LABELS = {
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  LOGIN_FAILED: 'Sign-in failed',
  JOB_CREATE: 'Job created',
  JOB_UPDATE: 'Job updated',
  JOB_DELETE: 'Job deleted',
  JOB_SYNC_SAP: 'Job synced to SAP',
  WORKER_CREATE: 'Worker created',
  WORKER_UPDATE: 'Worker updated',
  CUSTOMER_CREATE: 'Customer created',
  CUSTOMER_UPDATE: 'Customer updated',
  MIGRATION_JOBS: 'Jobs migrated',
  MIGRATION_USERS: 'Users migrated',
  AIFM_IMPORT: 'AIFM import',
  SETTINGS_UPDATE: 'Settings updated',
  MEMO_CREATE: 'Memo created',
  MEMO_UPDATE: 'Memo updated',
  MEMO_DELETE: 'Memo deleted',
  EMAIL_JOB_COMPLETED: 'Job completion email',
  EMAIL_JOB_ASSIGNED: 'Job assignment email',
  EMAIL_DISPATCH: 'Email dispatched',
  SAP_UDT_HOURS_PUSH: 'SAP UDT hours push',
  SAP_CUSTOMER_SYNC: 'SAP customer sync',
  SAP_CUSTOMER_DELTA_SYNC: 'SAP customer delta import',
  WORKER_SAP_SNAPSHOT_SYNC: 'Worker SAP snapshot sync',
  WORKER_DELETE: 'Worker deleted',
  CUSTOMER_DELETE: 'Customer deleted',
  LEAD_CREATE: 'Lead created',
  LEAD_UPDATE: 'Lead updated',
  LEAD_DELETE: 'Lead deleted',
  LEAD_CONVERT: 'Lead converted',
  LEAD_SYNC: 'Leads synced',
  JOB_PDF_GENERATE: 'Job PDF generated',
  JOB_MEDIA_UPLOAD: 'Job media uploaded',
  JOB_MEDIA_DELETE: 'Job media deleted',
  FOLLOWUP_CREATE: 'Follow-up created',
  FOLLOWUP_UPDATE: 'Follow-up updated',
  FOLLOWUP_DELETE: 'Follow-up deleted',
  JOB_MESSAGE_CREATE: 'Job message sent',
  AIFM_ASSIGN_CUSTOMERS: 'AIFM customer assignment',
  AIFM_SYNC_ADDRESS: 'AIFM address sync',
};

const SOURCE_LABELS = {
  portal: 'Portal',
  api: 'API',
  system: 'System',
  cron: 'Scheduled task',
  migration: 'Migration',
};

const FIELD_LABELS = {
  schedule: 'Schedule',
  title: 'Job title',
  description: 'Job description',
  status: 'Status',
  priority: 'Priority',
  assignedWorkers: 'Assigned workers',
  location: 'Location',
  serviceCall: 'Service call',
  salesOrder: 'Sales order',
  taskCount: 'Task count',
  jobId: 'Job ID',
  templateKey: 'Email template',
  messageId: 'Message ID',
  payment_profile_id: 'Payment profile',
  addressName: 'Address name',
  addressType: 'Address type',
  addressNotes: 'Address notes',
  customerLocationId: 'Customer location',
  subAction: 'Action',
  contactPerson: 'Contact person',
  contactEmail: 'Contact email',
  contactPhone: 'Contact phone',
  customerName: 'Customer name',
  customerEmail: 'Customer email',
  customerPhone: 'Customer phone',
  customerAddress: 'Customer address',
  taskDescription: 'Task',
  taskName: 'Task name',
  isDone: 'Completed',
  isPriority: 'Priority task',
  type: 'Follow-up type',
  notes: 'Notes',
  mediaCount: 'Media count',
  mediaFile: 'Media file',
  mediaFilename: 'Media file',
  paymentQrUen: 'Payment QR UEN',
  paymentQrCompany: 'Payment QR company',
  paymentQrExpiry: 'Payment QR expiry',
  paymentQrInvNumber: 'Payment invoice number',
  paymentQrAmount: 'Payment QR amount',
  payment_status: 'Payment status',
  amount_cents: 'Payment amount (cents)',
  bank_reference: 'Bank reference',
  incentiveRate: 'Incentive rate',
  siteId: 'Site ID',
  addressStatus: 'Address status',
  phoneNumber: 'Phone',
  email: 'Email',
};

const SUB_ACTION_LABELS = {
  create_address_details: 'Create address details',
  update_address_details: 'Update address details',
  delete_location: 'Delete service location',
  delete_contact: 'Delete contact',
  update_contact: 'Update contact',
  update_customer: 'Update customer',
  create_contact: 'Create contact',
};

const DETAIL_SKIP_KEYS = new Set([
  'updateSummary',
  'addedLeads',
  'addedLeadsTruncated',
  'addedLeadsTotal',
  'skippedExistingWithDiffs',
  'skippedDiffsTruncated',
  'skippedDiffsTotal',
  'restoredLeads',
  'restoredLeadsTruncated',
  'restoredLeadsTotal',
  'syncErrors',
]);

const STATUS_FIELD_KEYS = new Set(['status', 'jobStatus', 'job_status']);

function stripHtmlForAudit(value) {
  if (typeof value !== 'string' || !value) return value;
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function truncateForAuditDisplay(value, maxLen = 500) {
  if (typeof value !== 'string' || value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}…`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve SAP numeric IDs (e.g. 555) or legacy codes (CREATED) to display labels.
 * Display-only — does not change stored audit data.
 */
export function formatJobStatusForAudit(value, jobStatusesList) {
  if (value === null || value === undefined || value === '') return '—';
  const str = String(value).trim();

  if (jobStatusesList?.length) {
    const entry = findJobStatusEntry(str, jobStatusesList);
    if (entry?.name) return formatJobStatusDisplayLabel(entry.name);
  }

  return formatJobStatusDisplayLabel(str);
}

export function formatAuditChangeValue(field, value, { jobStatusesList } = {}) {
  if (field === 'subAction' && SUB_ACTION_LABELS[value]) {
    return SUB_ACTION_LABELS[value];
  }
  if (STATUS_FIELD_KEYS.has(field)) {
    return formatJobStatusForAudit(value, jobStatusesList);
  }
  if (field === 'description') {
    return formatAuditValue(truncateForAuditDisplay(stripHtmlForAudit(value)));
  }
  if (field === 'customerLocationId') {
    return formatAuditValue(
      value && typeof value === 'object' && value.label != null ? value.label : value,
    );
  }
  return formatAuditValue(value);
}

/**
 * Humanize summary lines like "Status: CREATED → 555".
 */
export function formatAuditDescription(description, jobStatusesList) {
  if (!description) return description;
  return description.replace(
    /Status:\s*([^→·]+?)\s*→\s*([^\s·]+)/,
    (_match, before, after) => {
      const b = formatJobStatusForAudit(before.trim(), jobStatusesList);
      const a = formatJobStatusForAudit(after.trim(), jobStatusesList);
      return `Status: ${b} → ${a}`;
    }
  );
}

export function formatAuditAction(action) {
  if (!action) return 'Unknown action';
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatAuditSource(source) {
  if (!source) return 'Portal';
  return SOURCE_LABELS[source] || source.charAt(0).toUpperCase() + source.slice(1);
}

export function formatFieldLabel(key) {
  if (!key) return '';
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return String(key)
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function formatAuditValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.map((item) => formatAuditValue(item)).join(', ');
  }
  if (typeof value === 'object') {
    if (value.label != null && value.id != null) return String(value.label);
    const entries = Object.entries(value);
    if (entries.length === 0) return '—';
    return entries.map(([k, v]) => `${formatFieldLabel(k)}: ${formatAuditValue(v)}`).join(' · ');
  }
  if (isUuid(value)) return value;
  return String(value);
}

export function parseUserAgent(ua) {
  if (!ua || typeof ua !== 'string') return null;

  let browser = 'Unknown browser';
  const firefox = ua.match(/Firefox\/(\d+)/i);
  const edge = ua.match(/Edg\/(\d+)/i);
  const chrome = ua.match(/Chrome\/(\d+)/i);
  const safari = ua.match(/Version\/(\d+).*Safari/i);

  if (firefox) browser = `Firefox ${firefox[1]}`;
  else if (edge) browser = `Edge ${edge[1]}`;
  else if (chrome && !/Edg/i.test(ua)) browser = `Chrome ${chrome[1]}`;
  else if (safari) browser = `Safari ${safari[1]}`;

  let os = 'Unknown OS';
  if (/Windows NT 10\.0/i.test(ua)) os = 'Windows';
  else if (/Windows NT 6\.3/i.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6\.1/i.test(ua)) os = 'Windows 7';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else {
    const android = ua.match(/Android (\d+)/i);
    if (android) os = `Android ${android[1]}`;
    else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
    else if (/Linux/i.test(ua)) os = 'Linux';
  }

  return { browser, os, summary: `${browser} on ${os}` };
}

/**
 * Normalize audit `changes` object into rows for comparison table.
 */
export function normalizeAuditChanges(changes) {
  if (!changes || typeof changes !== 'object') return [];

  return Object.entries(changes).map(([field, value]) => {
    if (value && typeof value === 'object' && ('before' in value || 'after' in value)) {
      return {
        field,
        label: formatFieldLabel(field),
        before: value.before,
        after: value.after,
      };
    }
    return {
      field,
      label: formatFieldLabel(field),
      before: null,
      after: value,
    };
  });
}

/**
 * Filter and format `details` for display (skip redundant keys).
 */
export function normalizeAuditDetails(
  details,
  { description = '', entityId = '', jobStatusesList, changes = null } = {},
) {
  if (!details || typeof details !== 'object') return [];

  const changeKeys = changes && typeof changes === 'object' ? new Set(Object.keys(changes)) : new Set();
  const legacyDetailToChange = {
    addressName: 'addressName',
    customerLocationId: 'customerLocationId',
    address_name: 'addressName',
  };

  return Object.entries(details)
    .filter(([key, value]) => {
      if (DETAIL_SKIP_KEYS.has(key)) return false;
      if (value === null || value === undefined || value === '') return false;
      if (changeKeys.has(key) || changeKeys.has(legacyDetailToChange[key])) return false;
      if (key === 'updateSummary' && description && String(value) === String(description)) {
        return false;
      }
      if (key === 'jobId' && entityId && String(value) === String(entityId)) return false;
      return true;
    })
    .map(([key, value]) => ({
      key,
      label: formatFieldLabel(key),
      value: formatAuditChangeValue(key, value, { jobStatusesList }),
      raw: value,
    }));
}

export function hasLeadSyncAuditDetails(details) {
  if (!details || typeof details !== 'object') return false;
  return (
    (Array.isArray(details.addedLeads) && details.addedLeads.length > 0) ||
    (Array.isArray(details.skippedExistingWithDiffs) && details.skippedExistingWithDiffs.length > 0) ||
    (Array.isArray(details.restoredLeads) && details.restoredLeads.length > 0)
  );
}

export function shouldHideAuditDetailsList(details, changes) {
  if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) {
    return false;
  }
  const items = normalizeAuditDetails(details, { changes });
  if (items.length === 0) return true;
  if (items.length === 1 && items[0].key === 'subAction') return true;
  return false;
}

export function hasTechnicalPayload(log, options = {}) {
  if (!log) return false;
  const changes = normalizeAuditChanges(log.changes);
  const details = normalizeAuditDetails(log.details, {
    description: log.description,
    entityId: log.entity_id,
  });
  return (
    changes.length > 0 ||
    details.length > 0 ||
    hasLeadSyncAuditDetails(log.details) ||
    Boolean(log.ip_address) ||
    Boolean(log.user_agent)
  );
}
