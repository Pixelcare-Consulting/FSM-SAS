#!/usr/bin/env node
/**
 * Generate SAP Job Sync Workflow Excel in public/
 * Run: node scripts/generate-sap-job-sync-workflow-xlsx.mjs
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'public', 'SAP-Job-Sync-Workflow.xlsx');

const wb = XLSX.utils.book_new();

function addSheet(name, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const colWidths =
    rows[0]?.map((_, i) => {
      let max = 10;
      for (const row of rows) {
        const len = String(row[i] ?? '').length;
        if (len > max) max = Math.min(len + 2, 80);
      }
      return { wch: max };
    }) || [];
  ws['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

addSheet('Overview', [
  ['SAP Job Sync Workflow — FSM Portal to SAP Business One'],
  ['Document', 'Generated from codebase (SAS-FSM-v2)'],
  ['Purpose', 'Sync portal jobs to SAP Activities and related entities for Job Incentives / Service Calls'],
  ['Sync marker', 'jobs.sap_activity_id — NULL = unsynced; populated = synced to SAP Activity'],
  ['Last sync timestamp', 'jobs.last_synced_at updated on successful Activity create/update'],
  ['Audit trail', 'job_sync_logs table (direction=to_sap) + audit_log (JOB_SYNC_SAP)'],
  ['Auth requirement', 'Valid SAP B1 session cookies (B1SESSION, ROUTEID) from portal SAP login'],
  [],
  ['High-Level Flow'],
  ['Step', 'Description'],
  ['1', 'Job exists in FSM portal (Supabase jobs table) with linked customer'],
  ['2', 'Sync triggered manually, on create/edit, from lead conversion, or bulk from Jobs list'],
  ['3', 'Load job + customer + job_schedule + technician_jobs from Supabase'],
  ['4', 'Create or PATCH SAP Activity (POST Activities or PATCH Activities(id))'],
  ['5', 'Store ActivityCode in jobs.sap_activity_id'],
  ['6', 'Post-activity push: U_API_JOB_SCHEDULE UDT, SCL5 SQL, OCLG SQL, ServiceCalls PATCH'],
  ['7', 'Log results to job_sync_logs; audit log written for API calls'],
]);

addSheet('Sync Triggers', [
  ['Trigger', 'Location', 'API / Method', 'When', 'Notes'],
  [
    'Create Job',
    'sub-components/dashboard/jobs/CreateJobs.js',
    'POST /api/jobs/sync-to-sap',
    'After job saved successfully',
    'Fire-and-forget; uses SAP session cookies',
  ],
  [
    'Edit Job',
    'sub-components/dashboard/jobs/EditJobs.js',
    'POST /api/jobs/sync-to-sap',
    'After job updated successfully',
    'Updates existing Activity if sap_activity_id set',
  ],
  [
    'Lead to Job',
    'pages/api/leads/[leadId]/create-job.js',
    'syncJobToSAP() direct',
    'When job created from lead',
    'Server-side after job insert',
  ],
  [
    'Single job (API)',
    'pages/api/jobs/sync-to-sap.js',
    'POST { jobId, dryRun? }',
    'Manual / programmatic',
    'dryRun=true returns plan only (no SAP/DB writes)',
  ],
  [
    'Bulk sync (UI)',
    'pages/dashboard/jobs/list-jobs.js',
    'POST /api/jobs/sync-hourly',
    'Jobs list Sync to SAP button',
    'SSE stream; syncAll=true; optional date filter',
  ],
  [
    'Bulk sync (API/cron)',
    'pages/api/jobs/sync-hourly.js',
    'POST { limit?, syncAll?, preview?, stream? }',
    'Scheduled or scripted batch',
    'Default limit 50; max 200; concurrency from SAP_JOB_SYNC_CONCURRENCY (default 2)',
  ],
  [
    'Dry-run CLI',
    'scripts/dry-run-job-sync-to-sap.mjs',
    'pnpm job:sync-sap:dry',
    'Pre-sync validation',
    'No SAP calls; shows field mapping plan',
  ],
  [
    'Reset sync state',
    'scripts/reset-jobs-sap-sync.mjs',
    'pnpm job:reset-sap-sync',
    'Clear sap_activity_id for re-sync',
    'WARNING: next sync creates NEW Activities, not PATCH',
  ],
]);

addSheet('Sync Steps Detail', [
  ['Step', 'SAP Target', 'HTTP', 'Service / File', 'Condition', 'On Success', 'On Failure'],
  [
    '0 Validate',
    'Supabase',
    'SELECT',
    'lib/services/jobSyncToSap.js',
    'jobId + supabase + sessionCookies required',
    'Proceed',
    'Return error: missing params / job not found / customer not found',
  ],
  [
    '1 Activity',
    'Activities',
    'POST or PATCH',
    'sapService.createActivity / updateActivity',
    'sap_activity_id NULL POST; else PATCH',
    'Set jobs.sap_activity_id + last_synced_at; log create/update',
    'Log failure to job_sync_logs; return error',
  ],
  [
    '2 Job Schedule UDT',
    'U_API_JOB_SCHEDULE',
    'POST then PATCH on duplicate',
    'lib/services/sapJobIncentivePush.js',
    'Requires job_number, sap_activity_id, primary technician sap_tech_code',
    'Schedule row upserted',
    'Skipped if missing tech code; error logged',
  ],
  [
    '3 SCL5 SQL',
    'SCL5 table',
    'SQL via sql01',
    'updateScl5IncentiveLineSql',
    'sap_activity_id present; SAP_JOB_INCENTIVE_SCL5_SQL != 0',
    'U_API_JobNumber, U_InvNumber, U_CMNumber, U_JobIncome, U_JobStatus, U_CMStatus updated',
    'Skipped if disabled or invalid ClgID',
  ],
  [
    '4 OCLG SQL',
    'OCLG (Activities)',
    'SQL via sql01',
    'updateOclgRecontactSql',
    'Recontact date derivable from job/schedule',
    'Recontact field updated',
    'Skipped if no date',
  ],
  [
    '5 Service Call',
    'ServiceCalls',
    'GET then PATCH',
    'lib/services/sapServiceCallJobAssign.js',
    'Job has service_call.call_number + sap_activity_id',
    'Activity line added/merged on ServiceCallActivities',
    'Skipped if no SC; logged to job_sync_logs as service_call_assign',
  ],
]);

addSheet('Field Mappings', [
  ['FSM Source', 'SAP Field', 'SAP Entity', 'Notes'],
  ['jobs.job_number', 'U_API_JobNumber', 'Activities', 'Portal job reference on SAP Activity'],
  ['customer.customer_code', 'CardCode', 'Activities', 'SAP Business Partner code'],
  ['(fixed)', 'ActivityType', 'Activities', 'Value: -1'],
  ['jobs.title', 'Details', 'Activities', 'HTML stripped before send'],
  ['jobs.description', 'Notes', 'Activities', 'HTML stripped before send'],
  ['jobs.status', 'U_API_JobStatusID', 'Activities', 'Mapped via mapPortalJobStatusToSap()'],
  ['jobs.status label', 'U_API_JobStatus', 'Activities', 'Human-readable SAP status label'],
  ['jobs.scheduled_start', 'StartDate / StartTime', 'Activities', 'Split date/time for SAP'],
  ['jobs.scheduled_end', 'EndDueDate / EndTime', 'Activities', 'Split date/time for SAP'],
  ['jobs.priority', 'Priority', 'Activities', 'Portal priority mapped to SAP'],
  ['jobs.job_number', 'U_JobNo', 'U_API_JOB_SCHEDULE', 'Schedule UDT key component'],
  ['technicians.sap_tech_code', 'U_JobTech', 'U_API_JOB_SCHEDULE', 'Primary: COMPLETED > STARTED > ASSIGNED'],
  ['service_call.call_number', 'U_CallID', 'U_API_JOB_SCHEDULE', 'Parsed as integer when possible'],
  [
    'job_schedule fields',
    'U_JSDate, U_JEDate, U_JSTime, U_JETime, U_Dur, U_Address',
    'U_API_JOB_SCHEDULE',
    'From primary schedule row',
  ],
  ['jobs.sap_activity_id', 'ActivityCode', 'ServiceCallActivities', 'Links job to Service Call line'],
  ['jobs.job_number', 'U_API_JobNumber', 'ServiceCallActivities', 'On ServiceCalls PATCH'],
  ['sales_order.document_number', 'U_API_PONo', 'ServiceCallActivities', 'PO number on SC line'],
  ['jobs.payment_qr_inv_number', 'U_InvNumber', 'ServiceCallActivities / SCL5', 'Invoice reference'],
  ['jobs.sap_cm_number', 'U_CMNumber', 'SCL5', 'Credit memo number'],
  ['jobs.sap_job_income', 'U_JobIncome', 'SCL5', 'Numeric job income'],
  ['jobs.sap_cm_status', 'U_CMStatus', 'SCL5', 'Credit memo status'],
]);

addSheet('API Reference', [
  ['Endpoint', 'Method', 'Body Parameters', 'Response', 'Auth'],
  [
    '/api/jobs/sync-to-sap',
    'POST',
    'jobId (required); dryRun (optional boolean)',
    'success, sap_activity_id, or plan+log if dryRun',
    'SAP session cookies required',
  ],
  [
    '/api/jobs/sync-hourly',
    'POST',
    'preview:true — counts only',
    'totalJobs, syncedJobs, unsyncedJobs, message',
    'No SAP session for preview only',
  ],
  [
    '/api/jobs/sync-hourly',
    'POST',
    'limit (1-200, default 50); dateFrom/dateTo optional',
    'synced, failed, errors[], remainingUnsynced',
    'SAP session required',
  ],
  [
    '/api/jobs/sync-hourly',
    'POST',
    'stream:true, syncAll:true — SSE live sync',
    'text/event-stream: start, progress, log, done events',
    'SAP session required',
  ],
  [
    'Core function',
    'N/A',
    'syncJobToSAP({ jobId, supabase, sessionCookies })',
    'lib/services/jobSyncToSap.js',
    'Used by all sync paths',
  ],
  [
    'Dry-run plan',
    'N/A',
    'previewJobSyncToSAP({ jobId, supabase })',
    'lib/services/jobSyncSapPlan.js',
    'No SAP or DB writes',
  ],
]);

addSheet('Prerequisites', [
  ['Requirement', 'Why', 'How to verify'],
  [
    'SAP B1 login in portal',
    'Session cookies B1SESSION + ROUTEID required for Service Layer calls',
    'Log in via portal SAP login; retry sync if 401 SAP session required',
  ],
  ['Customer synced to SAP', 'Activity CardCode must exist', 'Customer has valid customer_code linked to SAP BP'],
  ['Job not soft-deleted', 'deleted_at must be NULL', 'Job visible in portal list'],
  [
    'Technician with sap_tech_code',
    'Required for U_API_JOB_SCHEDULE sync',
    'Assign technician with SAP tech code before schedule UDT push',
  ],
  [
    'Service Call (optional)',
    'Links Activity to SC via PATCH ServiceCalls',
    'Job linked to service_call_id with call_number',
  ],
  ['Sales Order (optional)', 'PO number on Service Call activity line', 'Job linked to sales_order_id'],
  [
    'Env: SAP_JOB_SYNC_CONCURRENCY',
    'Parallel workers for bulk sync (default 2, max 8)',
    'Set in .env to tune batch throughput',
  ],
  [
    'Env: SAP_SL_UDT_API_JOB_SCHEDULE_ENTITY',
    'UDT entity name (default U_API_JOB_SCHEDULE)',
    'Match SAP UDT configuration',
  ],
  ['Env: SAP_JOB_INCENTIVE_SCL5_SQL', 'Set to 0 to disable SCL5 SQL step', 'Default enabled (1)'],
]);

addSheet('Bulk Sync UI Flow', [
  ['UI Step', 'Action', 'Backend'],
  ['1', 'User clicks Sync to SAP on Jobs list', 'openSyncSapConfirm()'],
  ['2', 'Preview loads counts', 'POST /api/jobs/sync-hourly { preview: true }'],
  ['3', 'Optional date filter (preset or custom)', 'Refetches preview with dateFrom/dateTo on jobs.created_at'],
  ['4', 'User confirms sync', 'runSyncToSap()'],
  ['5', 'SSE stream opens', 'POST { stream: true, syncAll: true, dateFrom?, dateTo? }'],
  ['6', 'Live feed shows per-job progress', 'Events: start, log (running/success/error), progress, done'],
  ['7', 'Result modal', 'Shows synced/failed counts and error sample'],
  [
    'Unsynced criteria',
    'jobs.sap_activity_id IS NULL AND deleted_at IS NULL',
    'Ordered by created_at ascending',
  ],
]);

addSheet('Troubleshooting', [
  ['Symptom', 'Likely Cause', 'Resolution'],
  [
    '401 SAP session required',
    'SAP cookies expired or missing',
    'Re-login to SAP in portal; ensure credentials include on fetch',
  ],
  ['Customer not found', 'customer_id invalid or customer deleted', 'Fix job customer link'],
  [
    'SAP did not return ActivityCode',
    'SAP POST Activities failed silently',
    'Check job_sync_logs response_payload; verify SAP payload',
  ],
  [
    'Schedule UDT skipped',
    'Missing sap_tech_code on assigned technician',
    'Assign technician with SAP code; re-sync job',
  ],
  [
    'Service call assign skipped',
    'No service_call on job or SC not in SAP',
    'Link SC; verify call_number exists in SAP',
  ],
  [
    'Bulk sync timeouts',
    'Too many parallel SAP calls',
    'Lower SAP_JOB_SYNC_CONCURRENCY; use date filter',
  ],
  [
    'Need to re-sync all jobs',
    'Reset sap_activity_id then bulk sync',
    'pnpm job:reset-sap-sync (WARNING: creates new Activities)',
  ],
  [
    'Preview mapping before live sync',
    'Validate field mapping',
    'pnpm job:sync-sap:dry --job-number=YYYY-NNNNNN or API dryRun:true',
  ],
  ['Check sync history', 'Per-job audit', 'Query job_sync_logs WHERE job_id = ? AND direction = to_sap'],
  ['Bulk audit', 'Batch operations', 'Query audit_log WHERE action = JOB_SYNC_SAP'],
]);

addSheet('Database Tables', [
  ['Table', 'Key Fields', 'Role in Sync'],
  [
    'jobs',
    'id, job_number, sap_activity_id, last_synced_at, customer_id, service_call_id, sales_order_id, status',
    'Source record; sap_activity_id marks sync state',
  ],
  ['customer', 'id, customer_code, customer_name', 'CardCode for SAP Activity'],
  ['job_schedule', 'job_id, jsdate, jedate, jstime, jetime, dur, address', 'Schedule fields for U_API_JOB_SCHEDULE'],
  ['technician_jobs', 'technician_id, assignment_status', 'Primary technician sap_tech_code for schedule UDT'],
  [
    'job_sync_logs',
    'job_id, direction, action, status, request_payload, response_payload, error_message',
    'Per-sync operation log',
  ],
  ['service_calls (via FK)', 'call_number', 'ServiceCalls PATCH target'],
  ['sales_orders (via FK)', 'document_number', 'PO on Service Call activity line'],
]);

addSheet('SAP Side Overview', [
  ['What Happens in SAP Business One During Job Sync'],
  [],
  ['Transport', 'SAP Service Layer REST API (B1S) — base URL from SAP_SERVICE_LAYER_BASE_URL'],
  ['Authentication', 'Portal SAP login sets B1SESSION + ROUTEID cookies; passed on every SL call'],
  ['Primary outcome', 'Each portal job becomes (or updates) an SAP Activity — stored as ActivityCode / ClgCode in OCLG'],
  ['Portal stores', 'ActivityCode returned by SAP → jobs.sap_activity_id in Supabase'],
  [],
  ['SAP-side sequence per job sync'],
  ['Order', 'SAP object', 'Action', 'Purpose'],
  ['1', 'Activities (OCLG)', 'POST or PATCH', 'Create/update the job record in SAP CRM Activities'],
  ['2', 'U_API_JOB_SCHEDULE UDT', 'POST or PATCH', 'Job Incentives add-on: technician schedule row keyed by job# + activity'],
  ['3', 'SCL5 (Activity UDF table)', 'SQL UPDATE via sql01', 'Push invoice, CM, income, job status UDFs on activity line'],
  ['4', 'OCLG', 'SQL UPDATE via sql01', 'Set Recontact date (not writable via Activities PATCH on this SAP build)'],
  ['5', 'ServiceCalls (OSCL + child lines)', 'GET then PATCH', 'Link Activity to existing Service Call as ServiceCallActivities line'],
  [],
  ['Important SAP behaviour'],
  ['Topic', 'Detail'],
  ['New vs update', 'If portal has no sap_activity_id → POST Activities (new ClgCode). If set → PATCH Activities(id).'],
  ['Duplicate schedule row', 'POST U_API_JOB_SCHEDULE on duplicate key falls back to PATCH same Code'],
  ['Service Call merge', 'GET ServiceCalls first; if ActivityCode already on SC, reuses LineNum; else appends new line'],
  ['POST retry limit', 'Activities POST retries capped at 1 to reduce duplicate Activity risk on timeout'],
  ['SQL path', 'Custom SQL runs through SQLQueries(sql01)/List — requires SAP sql01 package + permissions'],
]);

addSheet('SAP Objects & Tables', [
  ['SAP Object', 'Service Layer Entity', 'DB Table(s)', 'Key Field', 'What sync writes'],
  [
    'Activity (Job)',
    'Activities',
    'OCLG (+ SCL5 UDF extension)',
    'ActivityCode / ClgCode',
    'Job header: CardCode, dates, status UDFs, portal job number',
  ],
  [
    'Job Schedule UDT',
    'U_API_JOB_SCHEDULE (configurable)',
    '@API_JOB_SCHEDULE user table',
    'Code = {job_number}__{activity_id}',
    'Technician, call ID, schedule dates/times, duration, address',
  ],
  [
    'Activity incentive UDFs',
    '(via SQL, not SL entity)',
    'SCL5',
    'ClgID = ActivityCode',
    'U_API_JobNumber, U_InvNumber, U_CMNumber, U_JobIncome, U_JobStatus, U_CMStatus',
  ],
  [
    'Activity recontact',
    '(via SQL)',
    'OCLG',
    'ClgCode = ActivityCode',
    'Recontact date from earliest job_schedule.jsdate or scheduled_start',
  ],
  [
    'Service Call',
    'ServiceCalls',
    'OSCL + OSC6 (ServiceCallActivities)',
    'CallID / ServiceCallID',
    'One ServiceCallActivities line per job ActivityCode',
  ],
  [
    'Business Partner',
    '(referenced, not created by job sync)',
    'OCRD',
    'CardCode',
    'Must already exist — Activity.CardCode = customer.customer_code',
  ],
]);

addSheet('SAP Service Layer Calls', [
  ['Step', 'HTTP', 'Endpoint', 'When', 'Request body (summary)', 'SAP response used'],
  [
    '1a Create Activity',
    'POST',
    '/b1s/v1/Activities',
    'jobs.sap_activity_id is NULL',
    'U_API_JobNumber, CardCode, ActivityType=-1, Details, Notes, status UDFs, dates, Priority',
    'ActivityCode → stored as sap_activity_id',
  ],
  [
    '1b Update Activity',
    'PATCH',
    '/b1s/v1/Activities({ActivityCode})',
    'jobs.sap_activity_id already set',
    'Same fields as create (partial PATCH — undefined fields omitted)',
    'Confirms update; ActivityCode unchanged',
  ],
  [
    '2a Create schedule UDT',
    'POST',
    '/b1s/v1/U_API_JOB_SCHEDULE',
    'After Activity sync; tech code present',
    'Code, Name, U_JobNo, U_JobTech, U_CallID, U_JSDate, U_JEDate, U_JSTime, U_JETime, U_Dur, U_Address',
    'New schedule row; on duplicate → step 2b',
  ],
  [
    '2b Update schedule UDT',
    'PATCH',
    "/b1s/v1/U_API_JOB_SCHEDULE('{Code}')",
    'POST failed with duplicate / already exists',
    'Same U_ fields without Code/Name',
    'Schedule row updated in place',
  ],
  [
    '3 SCL5 update',
    'POST',
    "/b1s/v1/SQLQueries('sql01')/List",
    'After Activity sync; SAP_JOB_INCENTIVE_SCL5_SQL != 0',
    'SqlText: UPDATE SCL5 SET U_API_JobNumber, U_InvNumber, U_CMNumber, U_JobIncome, U_JobStatus, U_CMStatus WHERE ClgID = ?',
    'Row count / SQL result (best-effort)',
  ],
  [
    '4 OCLG Recontact',
    'POST',
    "/b1s/v1/SQLQueries('sql01')/List",
    'Recontact date available; SAP_JOB_INCENTIVE_OCLG_SQL != 0',
    "SqlText: UPDATE OCLG SET Recontact = 'YYYY-MM-DD' WHERE ClgCode = ?",
    'Recontact set for Job Incentives reporting',
  ],
  [
    '5a Read Service Call',
    'GET',
    '/b1s/v1/ServiceCalls({call_number})',
    'Job linked to service_call.call_number',
    '(none)',
    'Existing ServiceCallActivities[] — find LineNum for ActivityCode',
  ],
  [
    '5b Link to Service Call',
    'PATCH',
    '/b1s/v1/ServiceCalls({call_number})',
    'After GET; sap_activity_id present',
    '{ ServiceCallActivities: [{ LineNum, ActivityCode, U_API_JobNumber, status UDFs, U_API_PONo, U_API_Tech, U_InvNumber, ... }] }',
    'Activity appears on Service Call; merged if same ActivityCode exists',
  ],
]);

addSheet('SAP Activity Fields', [
  ['Service Layer field', 'SAP table.column (typical)', 'Portal source', 'Notes'],
  ['ActivityCode', 'OCLG.ClgCode', '(SAP-generated on POST)', 'Returned to portal as sap_activity_id'],
  ['CardCode', 'OCLG.CardCode', 'customer.customer_code', 'BP must exist in OCRD'],
  ['ActivityType', 'OCLG.CntctType', '(fixed -1)', 'Activity type for portal jobs'],
  ['Details', 'OCLG.Details', 'jobs.title', 'Plain text, max 254, HTML stripped'],
  ['Notes', 'OCLG.Notes', 'jobs.description', 'Plain text, max 254, HTML stripped'],
  ['U_API_JobNumber', 'OCLG UDF', 'jobs.job_number', 'Portal job reference in SAP'],
  ['U_API_JobStatusID', 'OCLG UDF', 'jobs.status → mapped ID', 'Numeric SAP status ID (UDT U_API_JOB_STATUS)'],
  ['U_API_JobStatus', 'OCLG UDF', 'jobs.status → mapped label', 'Display label e.g. Confirmed, Job Done'],
  ['StartDate / StartTime', 'OCLG.Recontact / time fields', 'jobs.scheduled_start', 'UTC split to date + HH:mm:ss'],
  ['EndDueDate / EndTime', 'OCLG end fields', 'jobs.scheduled_end', 'UTC split to date + HH:mm:ss'],
  ['Priority', 'OCLG.Priority', 'jobs.priority', 'LOW→pr_Low, MEDIUM→pr_Normal, HIGH/URGENT→pr_High'],
  ['Recontact', 'OCLG.Recontact', 'job_schedule.jsdate (earliest) or scheduled_start', 'Set via SQL only — not on Activities PATCH'],
]);

addSheet('SAP Schedule UDT Fields', [
  ['UDT field', 'Portal source', 'Notes'],
  ['Code', 'buildJobScheduleCode(job_number, activity_id)', 'Key: {job_number}__{activity_id}, sanitized, max 100 chars'],
  ['Name', 'Same as Code', 'UDT display name'],
  ['U_JobNo', 'jobs.job_number', 'Portal job number'],
  ['U_JobTech', 'Primary technician sap_tech_code', 'Priority: COMPLETED > STARTED > ASSIGNED assignment'],
  ['U_CallID', 'service_call.call_number or activity_id', 'Integer when parseable'],
  ['U_JSDate / U_JEDate', 'job_schedule.jsdate / jedate', 'ISO date for job start/end dates'],
  ['U_JSTime / U_JETime', 'job_schedule.jstime / jetime', 'HHmm format'],
  ['U_DurType / U_Dur', 'job_schedule.dur_type / dur', 'Duration type default Hours'],
  ['U_Address', 'job_schedule.address', 'Max 254 chars'],
  ['Entity name override', 'Env SAP_SL_UDT_API_JOB_SCHEDULE_ENTITY', 'Default: U_API_JOB_SCHEDULE'],
]);

addSheet('SAP Service Call Line', [
  ['ServiceCallActivities field', 'Portal source', 'Notes'],
  ['LineNum', 'Existing line for ActivityCode, or next available', 'GET ServiceCalls first to merge'],
  ['ActivityCode', 'jobs.sap_activity_id', 'Links SC line to OCLG activity'],
  ['U_API_JobNumber', 'jobs.job_number', 'Portal job ref on SC line'],
  ['U_API_JobStatusID / U_API_JobStatus', 'jobs.status (mapped)', 'Same mapping as Activity'],
  ['U_API_PONo', 'sales_order.document_number', 'Only if sales order linked'],
  ['U_API_Tech', 'All assigned technicians', 'Comma-separated sap_tech_code or full_name, no spaces after comma'],
  ['U_InvNumber', 'jobs.payment_qr_inv_number', 'Invoice / QR inv reference'],
  ['U_CMNumber', 'jobs.sap_cm_number', 'Credit memo number if set'],
  ['U_JobIncome', 'jobs.sap_job_income', 'Numeric income on SC line'],
  ['U_JobStatus / U_CMStatus', '(null on SC line)', 'Set on SCL5 via SQL instead'],
]);

addSheet('SAP Status Mapping', [
  ['Portal jobs.status', 'Resolution rule', 'Result'],
  [
    'Numeric string (e.g. "555")',
    'Accepted only if the ID exists in SAP U_API_JOB_STATUS list fetched at runtime',
    'Uses SAP label for U_API_JobStatus',
  ],
  [
    'Legacy string (e.g. "Confirmed")',
    'Normalized match against SAP U_API_JOB_STATUS.U_JobStatus (case/punct insensitive)',
    'Returns the matched { U_JobStatusID, U_JobStatus }',
  ],
  [
    'Unknown value',
    'No match found',
    'Sync fails explicitly (no silent fallback mapping)',
  ],
  ['SCL5 U_JobStatus', 'Derived', 'I when job complete AND payment_qr_inv_number set; else empty'],
]);

addSheet('SAP Env & Config', [
  ['Environment variable', 'Default', 'SAP-side effect'],
  ['SAP_SERVICE_LAYER_BASE_URL', '(required)', 'B1 Service Layer root e.g. https://host:50000/b1s/v1/'],
  ['SAP_SERVICE_LAYER_TIMEOUT_MS', '90000', 'GET/read timeout'],
  ['SAP_SERVICE_LAYER_WRITE_TIMEOUT_MS', '120000', 'POST/PATCH/SQL write timeout'],
  ['SAP_SERVICE_LAYER_MAX_RETRIES', '3', 'Retries on 502/503/504/timeout (POST capped at 1)'],
  ['SAP_JOB_SYNC_CONCURRENCY', '2', 'Parallel jobs hitting SAP in bulk sync'],
  ['SAP_SL_UDT_API_JOB_SCHEDULE_ENTITY', 'U_API_JOB_SCHEDULE', 'Service Layer entity for @API_JOB_SCHEDULE UDT'],
  ['SAP_JOB_INCENTIVE_SCL5_SQL', '1 (enabled)', 'Set 0 to skip SCL5 SQL UPDATE'],
  ['SAP_JOB_INCENTIVE_OCLG_SQL', '1 (enabled)', 'Set 0 to skip OCLG Recontact SQL UPDATE'],
  ['sql01 SQL package', 'Must exist in SAP', 'Required for SCL5 and OCLG direct SQL updates'],
]);

try {
  XLSX.writeFile(wb, outPath);
  console.log('Created:', outPath);
} catch (err) {
  if (err?.code === 'EBUSY') {
    const altPath = path.join(__dirname, '..', 'public', 'SAP-Job-Sync-Workflow-latest.xlsx');
    XLSX.writeFile(wb, altPath);
    console.log('Original file locked — created:', altPath);
  } else {
    throw err;
  }
}
