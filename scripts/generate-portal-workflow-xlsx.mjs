#!/usr/bin/env node
/**
 * Generate Portal Current Workflow Excel in docs/
 * Run: node scripts/generate-portal-workflow-xlsx.mjs
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'docs', 'Portal-Current-Workflow.xlsx');
const generatedDate = new Date().toISOString().slice(0, 10);

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
  ['SAS & ME Field Service Management Portal — Current Workflow'],
  ['Document', 'Generated from codebase (SAS-FSM-v2)'],
  ['Generated', generatedDate],
  ['Stack', 'Next.js 16 + Supabase (PostgreSQL) + SAP Business One Service Layer'],
  ['Purpose', 'End-to-end operational workflows used in the portal today'],
  [],
  ['System Integrations'],
  ['Integration', 'Direction', 'Purpose'],
  ['Google Forms', 'Inbound → Portal', 'Customer lead intake via manual sync'],
  ['AIFM Open API', 'Inbound → Portal', 'Field job import, customer directory, delta sync'],
  ['SAP Business One', 'Bidirectional', 'Customers (BP), Activities (jobs), Service Calls, Job Incentives UDT'],
  ['Supabase', 'Portal database', 'Customers, jobs, technicians, leads, masterlist, audit logs'],
  [],
  ['Primary User Journeys'],
  ['Journey', 'Entry Point', 'Outcome'],
  ['Lead intake', '/customer-leads', 'Google Form response → lead → optional job + SAP BP'],
  ['SAP customer management', '/customers', 'Browse/edit portal customers; delta sync from AIFM+SAP'],
  ['SAP leads (AIFM)', '/leads/sap-api', 'View AIFM/SAP-aligned lead records from masterlist'],
  ['Job operations', '/jobs', 'Create, edit, assign technicians, sync to SAP Activities'],
  ['Technician scheduling', '/scheduler', 'Drag-and-drop assignment; updates job_schedule + technician_jobs'],
  ['Follow-ups', '/follow-ups', 'Track pending follow-up tasks linked to jobs/customers'],
  ['Reports', '/dashboard/reports', 'Hours, fleet, inventory, product categories, monthly charts'],
]);

addSheet('Navigation', [
  ['Menu Item', 'URL (short)', 'Page / Component', 'Auth', 'Notes'],
  ['Dashboard', '/dashboard', 'pages/dashboard/overview', 'Yes', 'Landing after sign-in'],
  ['Portal Customers (Leads)', '/customer-leads', 'pages/customer-leads/index.js', 'Yes', 'Google Forms leads'],
  ['SAP Customers', '/customers', 'pages/dashboard/customers/list.js', 'Yes', 'Portal customer masterlist'],
  ['SAP Customers (API list)', '/customers/sap-api', 'pages/dashboard/customers/list-sap-api.js', 'Yes', 'SAP Service Layer browse'],
  ['SAP Customer detail', '/customers/sap-view/:id', 'pages/dashboard/customers/sap-view/[id].js', 'Yes', 'SAP BP detail view'],
  ['SAP Leads', '/leads', 'pages/dashboard/leads/list.js', 'Yes', 'Portal leads list'],
  ['SAP Leads (API)', '/leads/sap-api', 'pages/dashboard/leads/list-sap-api.js', 'Yes', 'Masterlist leads'],
  ['Lead detail', '/leads/view/:leadCode', 'pages/dashboard/leads/view/[leadCode].js', 'Yes', 'Single lead view'],
  ['Technicians', '/workers', 'pages/dashboard/workers/list.js', 'Yes', 'Technician roster'],
  ['Create Technician', '/workers/create', 'pages/dashboard/workers/create-worker.js', 'Yes', 'Add technician'],
  ['Technician Scheduler', '/scheduler', 'pages/dashboard/scheduling/workers/scheduler', 'Yes', 'Timeline scheduler UI'],
  ['Jobs', '/jobs', 'pages/dashboard/jobs/list-jobs.js', 'Yes', 'Main jobs grid + bulk SAP sync'],
  ['Create Job', '/jobs/create', 'sub-components/dashboard/jobs/CreateJobs.js', 'Yes', 'New job form'],
  ['Edit Job', '/jobs/edit-jobs/:id', 'sub-components/dashboard/jobs/EditJobs.js', 'Yes', 'Edit existing job'],
  ['Job detail', '/jobs/view/:jobId', 'pages/dashboard/jobs/[jobId].js', 'Yes', 'Read-only job view'],
  ['Follow-Ups', '/follow-ups', 'pages/dashboard/follow-ups/index.js', 'Yes', 'Follow-up task board'],
  ['Company Memos', '/dashboard/company-memos', 'pages/dashboard/company-memos/index.js', 'Admin', 'Internal announcements'],
  ['Reports', '/dashboard/reports', 'pages/dashboard/reports/index.js', 'Yes', 'Report hub'],
  ['Settings', '/dashboard/settings', 'pages/dashboard/settings.js', 'Yes', 'Email, Google Forms, job statuses, SMTP'],
  ['AIFM Jobs Preview', '/dashboard/integrations/aifm-jobs', 'AIFM import preview UI', 'Yes', 'Preview/import AIFM jobs'],
  ['Sign In', '/sign-in', 'pages/authentication/sign-in.js', 'No', 'Portal authentication'],
]);

addSheet('Auth & SAP Session', [
  ['Step', 'Action', 'Component / API', 'Result'],
  ['1', 'User signs in to portal', 'pages/authentication/sign-in.js', 'Supabase session (requireSession)'],
  ['2', 'User logs in to SAP B1 via portal', 'SAP login flow in portal', 'Cookies: B1SESSION + ROUTEID'],
  ['3', 'Protected API routes validate session', 'lib/auth/requireSession.js', '401 if not authenticated'],
  ['4', 'SAP-dependent operations use cookies', 'sapService.js, job sync, customer sync', 'SAP Service Layer calls'],
  ['5', 'Cron/background sync (optional)', 'SYNC_DELTA_CRON_SECRET header', 'Bypasses user session for sync-delta'],
  ['6', 'Technical SAP login (scripts)', 'loginSessionCookiesFromEnvironment()', 'SAP_B1_* env vars for unattended ops'],
  [],
  ['Session requirements by feature'],
  ['Feature', 'Portal session', 'SAP session', 'Notes'],
  ['View jobs/customers', 'Required', 'Optional', 'Read from Supabase'],
  ['Create/edit job', 'Required', 'Optional for save', 'SAP sync triggered after save if cookies present'],
  ['Sync job to SAP', 'Required', 'Required', 'POST /api/jobs/sync-to-sap'],
  ['Bulk SAP job sync', 'Required', 'Required', 'POST /api/jobs/sync-hourly (SSE stream)'],
  ['SAP customer browse', 'Required', 'Required', 'Direct SAP Service Layer queries'],
  ['Customer delta sync', 'Required (or cron secret)', 'Recommended', 'Enriches masterlist with SAP BP data'],
  ['AIFM job import', 'Required', 'Optional', 'CardCode resolution needs SAP cookies'],
]);

addSheet('Leads Workflow', [
  ['Step', 'Actor', 'Action', 'API / File', 'Data Change', 'Next Step'],
  ['1', 'Customer', 'Submits Google Form', 'External Google Forms', 'Response stored in Google', 'Wait for sync'],
  ['2', 'Admin', 'Configure form URLs', 'Settings → Google Forms tab', 'google_forms table', 'Enable sync'],
  ['3', 'User', 'Click Sync & Refresh', 'pages/customer-leads/index.js', '—', 'Trigger sync'],
  ['4', 'System', 'Fetch & map responses', 'POST /api/leads/sync', 'New rows in leads table', 'Display leads'],
  ['4a', 'System', 'Duplicate check', 'sync.js', 'Skip if response_id or email+timestamp dup', '—'],
  ['5', 'User', 'View / Edit / Delete lead', 'Leads UI modals', 'CRUD on leads', 'Manage pipeline'],
  ['6', 'User', 'Create Job from Lead', 'POST /api/leads/:leadId/create-job', 'See conversion steps', 'Job created'],
  [],
  ['Lead → Job conversion (step 6 detail)'],
  ['Sub-step', 'Condition', 'Action', 'Table', 'Fields'],
  ['6.1', 'No customer for email', 'Create customer', 'customer', 'customer_code=LEAD-{prefix}-{ts}'],
  ['6.2', 'Customer exists', 'Reuse customer', 'customer', 'Match by email'],
  ['6.3', '—', 'Create/find location', 'locations', 'block, unit, address from lead'],
  ['6.4', '—', 'Create job', 'jobs', 'job_number, schedule from service dates + time_slot'],
  ['6.5', 'SAP session available', 'Sync customer to SAP BP', 'POST /api/customers/sync-to-sap', 'BusinessPartner in SAP'],
  ['6.6', '—', 'Sync job to SAP Activity', 'syncJobToSAP()', 'jobs.sap_activity_id set'],
  ['6.7', '—', 'Update lead', 'leads', 'status=CONVERTED, customer_id linked'],
  ['6.8', '—', 'Redirect user', 'UI', 'Job edit page'],
  [],
  ['Lead statuses'],
  ['Status', 'Meaning'],
  ['PENDING', 'New lead, not yet contacted'],
  ['CONTACTED', 'Lead has been contacted'],
  ['CONVERTED', 'Converted to customer/job'],
  ['REJECTED', 'Lead rejected'],
  ['COMPLETED', 'Service completed'],
]);

addSheet('Customers Workflow', [
  ['Step', 'Actor', 'Action', 'API / File', 'Outcome'],
  ['1', 'User', 'Browse SAP Customers list', '/customers', 'Portal masterlist customers'],
  ['2', 'User', 'Open customer detail', '/customers/view/:id', 'History, addresses, jobs, notes'],
  ['3', 'User', 'Browse SAP API customers', '/customers/sap-api', 'Live SAP BusinessPartners'],
  ['4', 'User', 'View SAP BP detail', '/customers/sap-view/:id', 'SAP-side customer data'],
  ['5', 'User', 'Run Delta Sync (full or targeted)', 'POST /api/customers/sync-delta', 'AIFM+SAP → masterlist+jobs'],
  ['6', 'System (hourly cron)', 'Scheduled delta sync', 'scripts/run-hourly-delta-sync.mjs', 'Same as step 5 unattended'],
  ['7', 'User', 'Manual SAP BP sync', 'POST /api/customers/sync-to-sap', 'Portal customer → SAP BusinessPartner'],
  [],
  ['Delta sync pipeline (POST /api/customers/sync-delta)'],
  ['Order', 'Pass', 'Service', 'What it does'],
  ['1', 'Authorize AIFM', 'aifmApiClient.authorizeAifmBearer', 'Get Bearer token from AIFM_API_TOKEN'],
  ['2', 'Fetch AIFM jobs', 'fetchAllAifmJobsInRange', 'Jobs in date range (default last 14 days)'],
  ['3', 'Fetch customer directory', 'fetchAifmCustomersDirectory', 'Skipped in targeted mode (customerCode)'],
  ['4', 'SAP env login', 'loginSessionCookiesFromEnvironment', 'For BP phone/email/address enrichment'],
  ['5', 'Build SAP hits', 'syncSapHitsToMasterlist', 'Upsert masterlist customers + leads'],
  ['6', 'Import jobs', 'runAifmImportBatch', 'Create/update portal jobs from AIFM payloads'],
  ['7', 'Address sync', 'runAifmAddressSyncPass', 'Resolve [ADDRESS:] tags to location_id'],
  ['8', 'Customer assignment', 'runAifmCustomerAssignmentPass', 'Link unassigned jobs to customers'],
  ['9', 'Location enrichment', 'runAifmLinkedJobsLocationEnrichmentPass', 'Full delta only; linked job locations'],
  [],
  ['Delta sync modes'],
  ['Mode', 'Trigger', 'Scope'],
  ['delta', 'No customerCode in body', 'All customers from job scan + directory (max 50 AIFM pages)'],
  ['targeted', 'customerCode in body/query', 'Filter jobs by CardCode; max 5 AIFM pages; skip location enrichment pass'],
]);

addSheet('Jobs Workflow', [
  ['Step', 'Actor', 'Action', 'Location', 'DB / SAP Effect'],
  ['1', 'User', 'Create job manually', '/jobs/create → CreateJobs.js', 'INSERT jobs + related tables'],
  ['2', 'User', 'Edit job', '/jobs/edit-jobs/:id → EditJobs.js', 'UPDATE jobs + schedules + assignments'],
  ['3', 'User', 'Assign technician(s)', 'Job form or Scheduler', 'INSERT/UPDATE technician_jobs, job_schedule'],
  ['4', 'User', 'Set job status', 'Job form / status dropdown', 'UPDATE jobs.status'],
  ['5', 'System', 'Auto SAP sync on save', 'POST /api/jobs/sync-to-sap', 'CREATE/PATCH SAP Activity'],
  ['6', 'User', 'Bulk sync unsynced jobs', 'Jobs list → Sync to SAP', 'POST /api/jobs/sync-hourly (SSE)'],
  ['7', 'User', 'View job history', 'Customer HistoryTab / job detail', 'Read audit + status log'],
  ['8', 'User', 'Generate job PDF', 'POST /api/jobs/[jobId]/generate-pdf', 'PDF export'],
  ['9', 'User', 'Email job completed', 'POST /api/email/job-completed', 'Notification email'],
  [],
  ['Job creation sources'],
  ['Source', 'Entry', 'Notes'],
  ['Manual', '/jobs/create', 'Full form: customer, location, schedule, technicians, SC/SO links'],
  ['From lead', 'Customer Leads → Create Job', 'POST /api/leads/:id/create-job'],
  ['AIFM import', 'Delta sync or AIFM preview import', 'Idempotency via [AIFM:<id>] in description'],
  ['Migration upload', 'Jobs migration tool on list-jobs', 'Excel upload → /api/jobs/migration/*'],
  [],
  ['Job status (portal defaults)'],
  ['Value', 'Display Name'],
  ['CREATED', 'Created'],
  ['UNCONFIRMED', 'Unconfirmed'],
  ['CONFIRMED', 'Confirmed'],
  ['IN_PROGRESS', 'In Progress'],
  ['COMPLETED', 'Completed'],
  ['SCHEDULED', 'Scheduled'],
  ['RESCHEDULED', 'Rescheduled'],
  ['CANCELLED', 'Cancelled'],
  [],
  ['Technician assignment statuses'],
  ['ASSIGNED', 'Technician assigned, not started'],
  ['STARTED', 'Work in progress'],
  ['COMPLETED', 'Assignment completed'],
  ['CANCELLED', 'Assignment cancelled'],
]);

addSheet('SAP Job Sync', [
  ['Reference', 'See also: public/SAP-Job-Sync-Workflow.xlsx for full field-level detail'],
  [],
  ['Trigger', 'When', 'API'],
  ['Create job', 'After successful save', 'POST /api/jobs/sync-to-sap'],
  ['Edit job', 'After successful update', 'POST /api/jobs/sync-to-sap'],
  ['Lead → job', 'Server-side in create-job handler', 'syncJobToSAP() direct'],
  ['Bulk (UI)', 'Jobs list Sync to SAP button', 'POST /api/jobs/sync-hourly { stream, syncAll }'],
  ['Dry run', 'CLI or API dryRun:true', 'previewJobSyncToSAP — no SAP writes'],
  [],
  ['Sync marker', 'jobs.sap_activity_id NULL = unsynced; populated = synced to SAP Activity'],
  ['Audit', 'job_sync_logs + audit_log (JOB_SYNC_SAP)'],
  [],
  ['SAP sync sequence per job'],
  ['Step', 'SAP Target', 'Purpose'],
  ['1', 'Activities (POST/PATCH)', 'Create or update job as SAP Activity'],
  ['2', 'U_API_JOB_SCHEDULE UDT', 'Job Incentives schedule row (tech, dates, address)'],
  ['3', 'SCL5 SQL', 'Invoice, CM, income, status UDFs on activity'],
  ['4', 'OCLG SQL', 'Recontact date update'],
  ['5', 'ServiceCalls PATCH', 'Link Activity to Service Call line (if SC linked)'],
  [],
  ['Prerequisites'],
  ['Requirement', 'Why'],
  ['SAP session cookies', 'All Service Layer calls'],
  ['Customer with valid customer_code', 'Activity.CardCode = SAP BP'],
  ['Technician sap_tech_code', 'Required for schedule UDT push'],
  ['Service call (optional)', 'Links job to SAP Service Call'],
]);

addSheet('AIFM Integration', [
  ['Step', 'Action', 'API / Script', 'Notes'],
  ['1', 'Preview AIFM jobs', 'POST /api/integrations/aifm/jobs', 'Date range; optional SAP CardCode resolution'],
  ['2', 'Import batch', 'POST /api/integrations/aifm/import-jobs', 'Upsert jobs; link SC/SO identifiers'],
  ['3', 'Assign customers', 'POST /api/integrations/aifm/assign-customers', 'Match AIFM accounts to portal customers'],
  ['4', 'Delta sync (combined)', 'POST /api/customers/sync-delta', 'Masterlist + import + address + assignment'],
  ['5', 'Backfill SC/SO', 'pnpm aifm:backfill-sc-so', 'personal_job_id → service_call; job_po_number → sales_order'],
  ['6', 'Enrich from SAP', 'pnpm aifm:enrich-sc-so-sap', 'sql10/sql05 queries into Supabase'],
  ['7', 'Masterlist migration', 'pnpm migrate:aifm-masterlist', 'Excel → customers masterlist'],
  ['8', 'SAP name sync', 'pnpm aifm:sync-sap-masterlist', 'Sync SAP names to masterlist'],
  [],
  ['AIFM → Portal key field mappings'],
  ['AIFM field', 'Portal target', 'SAP link'],
  ['id', '[AIFM:<id>] in jobs.description', 'Idempotency key'],
  ['personal_job_id', 'service_call.call_number', 'ServiceCalls PATCH, U_CallID'],
  ['job_po_number', 'sales_order.document_number', 'U_API_PONo on SC line'],
  ['id_customer / names', 'customer_id, [CUSTOMER:…] tag', 'CardCode resolution'],
  ['assigned_teches', 'technician_jobs', 'Technician assignment'],
  ['job_start_date/time', 'scheduled_start, job_schedule', 'Schedule UDT source'],
  ['status', 'jobs.status', 'Often SAP numeric status ID string'],
  [],
  ['Recommended import order'],
  ['1', 'Resolve/create customer (masterlist or assign-customers)'],
  ['2', 'Import job via AIFM (identifiers linked automatically)'],
  ['3', 'Sync to SAP via POST /api/jobs/sync-to-sap or Jobs list bulk sync'],
]);

addSheet('Scheduler Workflow', [
  ['Step', 'Actor', 'Action', 'Service', 'DB Changes'],
  ['1', 'User', 'Open Technicians Scheduler', '/scheduler', 'Load technician_jobs + job_schedule'],
  ['2', 'User', 'Drag job to technician timeline', 'TimelineScheduler UI', '—'],
  ['3', 'System', 'Assign technician to job', 'assignTechnicianToJob()', 'INSERT technician_jobs'],
  ['4', 'System', 'Upsert schedule', 'ensureScheduleRecord()', 'INSERT/UPDATE job_schedule'],
  ['5', 'System', 'Update job times', 'jobs UPDATE', 'scheduled_start, scheduled_end'],
  ['6', 'System', 'Notify assignee', 'emitJobStakeholderNotifications', 'In-app notification'],
  ['7', 'System', 'Email assignment', 'emitJobAssignmentEmails', 'Email to technician'],
  ['8', 'System', 'Refresh labor hours', 'refreshTechnicianHoursForJobId', 'technician_hours table'],
  [],
  ['Scheduler operations'],
  ['Operation', 'Function', 'Preserves schedule times?'],
  ['New assignment', 'assignTechnicianToJob', 'No — sets start/end from drag'],
  ['Reassign tech', 'reassignTechnician', 'Yes — only changes technician_id'],
  ['Reschedule', 'updateTechnicianSchedule', 'No — updates start/end + location'],
  ['Update tech color', 'updateTechnicianColor', 'N/A — UI display only'],
  [],
  ['Data loaded by scheduler API'],
  ['Endpoint', 'POST /api/scheduler/technician-data'],
  ['Returns', 'Technicians, assignments, job_schedule rows, conflict hints'],
]);

addSheet('Follow-Ups & Memos', [
  ['Area', 'URL', 'Purpose', 'Key behavior'],
  ['Follow-Ups', '/follow-ups', 'Track follow-up tasks', 'Filtered board by follow-up type and status'],
  ['Quick Menu', 'Header quick menu', 'Surface follow-ups + appointments', 'Global search includes followUp type'],
  ['Stakeholder notifications', 'API', 'Job follow-up alerts', 'POST /api/notifications/follow-up-stakeholders'],
  ['Company Memos', '/dashboard/company-memos', 'Internal announcements', 'Admin-only; header ticker via /api/company-memos/header-ticker'],
  [],
  ['Follow-up workflow (typical)'],
  ['Step', 'Action'],
  ['1', 'Job reaches follow-up status (e.g. FOLLOW_UP_REPAIR, FOLLOW_UP_APPT_CONTRACT)'],
  ['2', 'Follow-up appears on /follow-ups board and Quick Menu'],
  ['3', 'User actions follow-up (call, reschedule, create new job)'],
  ['4', 'Status updated on job; may trigger SAP sync on next save'],
]);

addSheet('Reports & Settings', [
  ['Reports area', 'Route', 'Content'],
  ['Reports hub', '/dashboard/reports', 'Index of available reports'],
  ['Hours by employee', '/dashboard/reports/hours-by-employee', 'Technician labor hours rollup'],
  ['Monthly charts', '/dashboard/reports/monthly-charts', 'Trend charts'],
  ['Fleet', '/dashboard/reports/fleet', 'Fleet report'],
  ['Inventory', '/dashboard/reports/inventory', 'Inventory report'],
  ['Product categories', '/dashboard/reports/product-categories', 'Product category breakdown'],
  ['Audit logs', '/dashboard/audit-logs', 'System audit trail'],
  [],
  ['Settings areas', 'Panel', 'Purpose'],
  ['Email settings', 'EmailSettingsPanel', 'SMTP configuration, test email'],
  ['Email templates', 'EmailTemplateBodyEditor', 'Job notification templates'],
  ['Notifications', 'NotificationsSettingsPanel', 'Notification preferences'],
  ['Google Forms', 'Settings → Google tab', 'Form URLs for lead sync'],
  ['Job statuses', 'Settings → Job Statuses', 'Custom status colors/labels (cached in browser)'],
  ['FSM labor hours', '/api/settings/fsm-labor-hours', 'Labor hour calculation settings'],
  ['Company logo', '/api/upload-company-logo', 'Branding upload'],
]);

addSheet('API Endpoints', [
  ['Domain', 'Endpoint', 'Method', 'Purpose'],
  ['Leads', '/api/leads/sync', 'POST', 'Sync Google Form responses to leads table'],
  ['Leads', '/api/leads/:leadId/create-job', 'POST', 'Convert lead to customer + job + SAP sync'],
  ['Leads', '/api/leads', 'GET/POST', 'List/create leads'],
  ['Customers', '/api/customers/sync-delta', 'POST', 'AIFM+SAP delta sync pipeline'],
  ['Customers', '/api/customers/sync-to-sap', 'POST', 'Portal customer → SAP BusinessPartner'],
  ['Customers', '/api/customers/create', 'POST', 'Create portal customer'],
  ['Customers', '/api/customers/masterlist/:cardCode', 'GET', 'Masterlist customer bundle'],
  ['Jobs', '/api/jobs/sync-to-sap', 'POST', 'Sync single job to SAP Activity'],
  ['Jobs', '/api/jobs/sync-hourly', 'POST', 'Bulk sync unsynced jobs (SSE supported)'],
  ['Jobs', '/api/jobs/migration/upload', 'POST', 'Upload jobs Excel for migration'],
  ['Jobs', '/api/jobs/migration/apply', 'POST', 'Apply parsed migration rows'],
  ['Jobs', '/api/jobs/resolve-addresses', 'POST', 'Batch address resolution'],
  ['AIFM', '/api/integrations/aifm/jobs', 'POST', 'Preview/fetch AIFM jobs'],
  ['AIFM', '/api/integrations/aifm/import-jobs', 'POST', 'Import AIFM job batch'],
  ['AIFM', '/api/integrations/aifm/assign-customers', 'POST', 'Assign customers to AIFM jobs'],
  ['Scheduler', '/api/scheduler/technician-data', 'POST', 'Scheduler timeline data'],
  ['Search', '/api/search/global-customers', 'GET', 'Global customer search'],
  ['Search', '/api/search/global-masterlist', 'GET', 'Masterlist search'],
  ['Notifications', '/api/notifications/job-stakeholders', 'POST', 'Job stakeholder alerts'],
  ['Email', '/api/email/job-completed', 'POST', 'Job completion email'],
  ['Audit', '/api/audit-logs', 'GET', 'Audit log query'],
  ['SAP', '/api/sap/incentive-udt-working-hrs', 'GET', 'SAP incentive UDT data'],
]);

addSheet('Data Flow Summary', [
  ['Flow', 'Source', 'Portal tables', 'SAP objects', 'Trigger'],
  ['Google Form → Lead', 'Google Forms API', 'leads', '—', 'Manual sync button'],
  ['Lead → Customer', 'leads', 'customer, locations', 'BusinessPartners (OCRD)', 'Create job from lead'],
  ['Lead → Job', 'leads', 'jobs, job_schedule, technician_jobs', 'Activities (OCLG)', 'Create job from lead'],
  ['Manual job CRUD', 'UI forms', 'jobs + related', 'Activities + UDT + SC', 'Save + auto sync'],
  ['AIFM → Job', 'AIFM Open API', 'jobs, service_call, sales_order', 'Activities (after sync)', 'Delta sync / import'],
  ['AIFM → Masterlist', 'AIFM + SAP BP', 'masterlist customers/leads', 'BusinessPartners', 'Delta sync'],
  ['Scheduler assign', 'Scheduler UI', 'technician_jobs, job_schedule, jobs', '— (sync on next SAP push)', 'Drag-and-drop'],
  ['Bulk SAP sync', 'Jobs list', 'jobs.sap_activity_id', 'Activities, UDT, SCL5, SC', 'Sync to SAP button'],
  [],
  ['Key idempotency / linking markers'],
  ['Marker', 'Location', 'Purpose'],
  ['[AIFM:<id>]', 'jobs.description', 'Prevent duplicate AIFM imports'],
  ['[CUSTOMER:…]', 'jobs.description', 'AIFM customer account reference'],
  ['[ADDRESS:…]', 'jobs.description', 'Pending address resolution tag'],
  ['sap_activity_id', 'jobs column', 'Portal ↔ SAP Activity link'],
  ['google_form_response_id', 'leads column', 'Google Form deduplication'],
]);

try {
  XLSX.writeFile(wb, outPath);
  console.log('Created:', outPath);
} catch (err) {
  if (err?.code === 'EBUSY') {
    const altPath = path.join(__dirname, '..', 'docs', `Portal-Current-Workflow-${generatedDate}.xlsx`);
    XLSX.writeFile(wb, altPath);
    console.log('Original file locked — created:', altPath);
  } else {
    throw err;
  }
}
