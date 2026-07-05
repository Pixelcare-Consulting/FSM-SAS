/**
 * Build FSM → SAP sync plan (dry-run / mapping audit). No SAP or DB writes.
 */

import { buildSAPActivityPayload, buildSAPActivityPatchPayload } from '../utils/sapActivityTransform.js';
import {
  buildApiJobSchedulePayload,
  getApiJobScheduleEntityName,
  pickPrimaryTechnicianJob,
  pickPrimaryScheduleRow,
} from './sapJobIncentivePush.js';
import { pickJobIncentiveRecontactDate } from '../utils/sapActivityTransform.js';
import {
  buildServiceCallActivityLine,
  buildServiceCallPatchBody,
} from '../utils/sapServiceCallTransform.js';
import {
  fetchSapJobStatuses,
  resolvePortalJobStatusToSap,
} from '../utils/sapJobStatusResolver.js';
import {
  loginSessionCookiesFromEnvironment,
  unwrapSapEnvironmentLogin,
} from './sapService.js';

const JOB_SELECT = `
  id,
  job_number,
  title,
  description,
  priority,
  status,
  scheduled_start,
  scheduled_end,
  customer_id,
  sap_activity_id,
  payment_qr_inv_number,
  sap_cm_number,
  sap_cm_status,
  sap_job_income,
  service_call:service_call_id(call_number, subject, customer_name_sap),
  sales_order:sales_order_id(document_number, document_status, document_total),
  technician_jobs(
    assignment_status,
    deleted_at,
    technician:technician_id(id, sap_tech_code, full_name)
  )
`;

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export async function loadJobSyncContext(supabase, jobId) {
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select(JOB_SELECT)
    .eq('id', jobId)
    .is('deleted_at', null)
    .single();

  if (jobError || !job) {
    return { error: jobError?.message || 'Job not found' };
  }

  const { data: scheduleRows, error: scheduleError } = await supabase
    .from('job_schedule')
    .select('jsdate, jedate, jstime, jetime, dur_type, dur, address')
    .eq('job_id', jobId);

  if (scheduleError) {
    console.warn(`job_schedule lookup:`, scheduleError.message);
  }

  const { data: customer, error: custError } = await supabase
    .from('customer')
    .select('id, customer_code, customer_name')
    .eq('id', job.customer_id)
    .is('deleted_at', null)
    .single();

  if (custError || !customer) {
    return { error: custError?.message || 'Customer not found' };
  }

  const { data: jobCategoryRow, error: jobCategoryError } = await supabase
    .from('job_category')
    .select('description')
    .eq('job_id', jobId)
    .maybeSingle();

  if (jobCategoryError && jobCategoryError.code !== 'PGRST116') {
    console.warn(`job_category lookup:`, jobCategoryError.message);
  }

  return {
    job,
    customer,
    scheduleRows: Array.isArray(scheduleRows) ? scheduleRows : [],
    jobCategory: jobCategoryRow?.description != null ? String(jobCategoryRow.description).trim() : null,
  };
}

function mapRow(fsmPath, sapField, fsmValue, sapValue) {
  return { fsmPath, sapField, fsmValue, sapValue };
}

function activityMappings(job, customer, payload) {
  return [
    mapRow('jobs.job_number', 'U_API_JobNumber', job.job_number, payload.U_API_JobNumber),
    mapRow('customer.customer_code', 'CardCode', customer.customer_code, payload.CardCode),
    mapRow('(fixed)', 'ActivityType', '-1', payload.ActivityType),
    mapRow('jobs.title', 'Details', job.title, payload.Details),
    mapRow('jobs.description', 'Notes', job.description, payload.Notes),
    mapRow('jobs.status', 'U_API_JobStatusID', job.status, payload.U_API_JobStatusID),
    mapRow('jobs.status → label', 'U_API_JobStatus', job.status, payload.U_API_JobStatus),
    mapRow('jobs.scheduled_start', 'StartDate', job.scheduled_start, payload.StartDate),
    mapRow('jobs.scheduled_start', 'StartTime', job.scheduled_start, payload.StartTime),
    mapRow('jobs.scheduled_end', 'EndDueDate', job.scheduled_end, payload.EndDueDate),
    mapRow('jobs.scheduled_end', 'EndTime', job.scheduled_end, payload.EndTime),
    mapRow('jobs.priority', 'Priority', job.priority, payload.Priority),
  ];
}

/**
 * @param {{ job: Object, customer: Object, scheduleRows: Array }} ctx
 */
export function buildJobSyncSapPlan({ job, customer, scheduleRows, jobCategory }) {
  const scheduleOpts = {
    jobScheduleRows: scheduleRows,
    jobStatusId: job?.jobStatusId,
    jobStatusLabel: job?.jobStatusLabel,
    sapJobStatuses: job?.sapJobStatuses,
    jobCatID: jobCategory != null ? String(jobCategory).trim() : null,
  };
  const isUpdate = Boolean(job.sap_activity_id);
  const activityPayload = isUpdate
    ? buildSAPActivityPatchPayload(job, customer, scheduleOpts)
    : buildSAPActivityPayload(job, customer, scheduleOpts);

  const activityStep = {
    step: 1,
    name: 'Activities',
    method: isUpdate ? 'PATCH' : 'POST',
    endpoint: isUpdate
      ? `Activities(${job.sap_activity_id})`
      : 'Activities',
    payload: activityPayload,
    mappings: activityMappings(job, customer, activityPayload),
  };

  const warnings = [];
  const activityIdForPostSteps =
    job.sap_activity_id || '(assigned after POST Activities — ActivityCode from SAP)';

  const techRow = pickPrimaryTechnicianJob(job.technician_jobs);
  const sapTechCode = techRow?.technician?.sap_tech_code;
  const scheduleRow = pickPrimaryScheduleRow(scheduleRows);
  const serviceCallNumber = job?.service_call?.call_number ?? null;
  const poNumber = job?.sales_order?.document_number ?? null;

  let jobScheduleStep = {
    step: 2,
    name: 'U_API_JOB_SCHEDULE',
    skipped: true,
    reason: null,
    endpoint: null,
    postBody: null,
    patchBody: null,
    mappings: [],
  };

  if (!job.job_number) {
    jobScheduleStep.reason = 'missing job_number';
  } else if (!sapTechCode) {
    jobScheduleStep.reason = 'missing primary technician sap_tech_code';
    warnings.push('Assign a technician with sap_tech_code before schedule UDT sync.');
  } else if (!job.sap_activity_id) {
    jobScheduleStep.reason = 'sap_activity_id missing until Activities POST succeeds';
    const previewId = 'NEW_ACTIVITY_CODE';
    const built = buildApiJobSchedulePayload({
      jobNumber: job.job_number,
      sapActivityId: previewId,
      sapTechCode,
      serviceCallNumber,
      scheduleRow,
    });
    jobScheduleStep.skipped = false;
    jobScheduleStep.endpoint = `${getApiJobScheduleEntityName()} (POST then PATCH on duplicate)`;
    jobScheduleStep.postBody = built.postBody;
    jobScheduleStep.patchBody = built.patchBody;
    jobScheduleStep.mappings = buildScheduleMappings(
      job,
      serviceCallNumber,
      sapTechCode,
      scheduleRow,
      built.patchBody
    );
    jobScheduleStep.note = 'Preview uses placeholder ActivityCode; re-run dry-run after live sync for exact Code key.';
  } else {
    const built = buildApiJobSchedulePayload({
      jobNumber: job.job_number,
      sapActivityId: job.sap_activity_id,
      sapTechCode,
      serviceCallNumber,
      scheduleRow,
    });
    jobScheduleStep.skipped = false;
    jobScheduleStep.endpoint = `${getApiJobScheduleEntityName()}('${built.code}')`;
    jobScheduleStep.postBody = built.postBody;
    jobScheduleStep.patchBody = built.patchBody;
    jobScheduleStep.mappings = buildScheduleMappings(
      job,
      serviceCallNumber,
      sapTechCode,
      scheduleRow,
      built.patchBody
    );
  }

  let serviceCallStep = {
    step: 3,
    name: 'ServiceCalls',
    skipped: true,
    reason: null,
    method: 'PATCH',
    endpoint: null,
    payload: null,
    mappings: [],
  };

  if (!serviceCallNumber) {
    serviceCallStep.reason = 'no service_call.call_number on job';
  } else if (!job.sap_activity_id) {
    serviceCallStep.reason = 'sap_activity_id required (run Activities POST first)';
    const previewJob = { ...job, sap_activity_id: 'NEW_ACTIVITY_CODE' };
    const line = buildServiceCallActivityLine({
      job: previewJob,
      poNumber,
      technicianJobs: job.technician_jobs,
      lineNum: 0,
      jobStatus:
        job?.jobStatusId != null && job?.jobStatusLabel != null
          ? { jobStatusId: job.jobStatusId, jobStatusLabel: job.jobStatusLabel }
          : null,
      sapJobStatuses: job?.sapJobStatuses,
    });
    serviceCallStep.endpoint = `ServiceCalls(${serviceCallNumber})`;
    serviceCallStep.payload = buildServiceCallPatchBody(line);
    serviceCallStep.skipped = false;
    serviceCallStep.note = 'LineNum may change after GET existing ServiceCallActivities in live sync.';
    serviceCallStep.mappings = buildServiceCallMappings(job, poNumber, line);
  } else {
    const line = buildServiceCallActivityLine({
      job,
      poNumber,
      technicianJobs: job.technician_jobs,
      lineNum: 0,
      jobStatus:
        job?.jobStatusId != null && job?.jobStatusLabel != null
          ? { jobStatusId: job.jobStatusId, jobStatusLabel: job.jobStatusLabel }
          : null,
      sapJobStatuses: job?.sapJobStatuses,
    });
    serviceCallStep.skipped = false;
    serviceCallStep.endpoint = `ServiceCalls(${serviceCallNumber})`;
    serviceCallStep.payload = buildServiceCallPatchBody(line);
    serviceCallStep.mappings = buildServiceCallMappings(job, poNumber, line);
    serviceCallStep.note = 'Live sync GETs ServiceCalls first to merge LineNum if ActivityCode exists.';
  }

  const recontactDate = pickJobIncentiveRecontactDate(job, scheduleRows);
  const scl5Preview =
    job.sap_activity_id &&
    `UPDATE [SCL5] SET U_API_JobNumber, U_InvNumber, U_CMNumber, U_JobIncome, U_JobStatus, U_CMStatus WHERE ClgID = ${job.sap_activity_id}`;

  return {
    jobId: job.id,
    jobNumber: job.job_number,
    sapActivityId: job.sap_activity_id,
    customerCode: customer.customer_code,
    serviceCallNumber,
    salesOrderNumber: poNumber,
    action: isUpdate ? 'update' : 'create',
    activityIdForPostSteps,
    steps: {
      activity: activityStep,
      jobSchedule: jobScheduleStep,
      serviceCall: serviceCallStep,
    },
    sql: {
      scl5: { preview: scl5Preview || null, skipped: !job.sap_activity_id },
      oclg: {
        preview: recontactDate
          ? `UPDATE OCLG SET Recontact = '${recontactDate}' WHERE ClgCode = ${job.sap_activity_id || '?'}`
          : null,
        recontactDate,
        skipped: !job.sap_activity_id || !recontactDate,
      },
    },
    fsmSnapshot: {
      job: {
        id: job.id,
        job_number: job.job_number,
        status: job.status,
        priority: job.priority,
        sap_activity_id: job.sap_activity_id,
      },
      customer: { code: customer.customer_code, name: customer.customer_name },
      service_call: job.service_call,
      sales_order: job.sales_order,
      scheduleRows,
      technicians: (job.technician_jobs || [])
        .filter((t) => !t.deleted_at)
        .map((t) => ({
          sap_tech_code: t.technician?.sap_tech_code,
          full_name: t.technician?.full_name,
          assignment_status: t.assignment_status,
        })),
    },
    warnings,
  };
}

function buildScheduleMappings(job, serviceCallNumber, sapTechCode, scheduleRow, body) {
  return [
    mapRow('jobs.job_number', 'U_JobNo', job.job_number, body.U_JobNo),
    mapRow('technicians.sap_tech_code (primary)', 'U_JobTech', sapTechCode, body.U_JobTech),
    mapRow('service_call.call_number', 'U_CallID', serviceCallNumber, body.U_CallID),
    mapRow('job_schedule.jsdate', 'U_JSDate', scheduleRow?.jsdate, body.U_JSDate),
    mapRow('job_schedule.jedate', 'U_JEDate', scheduleRow?.jedate, body.U_JEDate),
    mapRow('job_schedule.jstime', 'U_JSTime', scheduleRow?.jstime, body.U_JSTime),
    mapRow('job_schedule.jetime', 'U_JETime', scheduleRow?.jetime, body.U_JETime),
    mapRow('job_schedule.dur', 'U_Dur', scheduleRow?.dur, body.U_Dur),
    mapRow('job_schedule.address', 'U_Address', scheduleRow?.address, body.U_Address),
  ];
}

function buildServiceCallMappings(job, poNumber, line) {
  return [
    mapRow('jobs.sap_activity_id', 'ActivityCode', job.sap_activity_id, line.ActivityCode),
    mapRow('jobs.job_number', 'U_API_JobNumber', job.job_number, line.U_API_JobNumber),
    mapRow('jobs.status', 'U_API_JobStatusID', job.status, line.U_API_JobStatusID),
    mapRow('jobs.status → label', 'U_API_JobStatus', job.status, line.U_API_JobStatus),
    mapRow('sales_order.document_number', 'U_API_PONo', poNumber, line.U_API_PONo),
    mapRow('technician_jobs → U_API_Tech', 'U_API_Tech', '(see tech list)', line.U_API_Tech),
    mapRow('jobs.payment_qr_inv_number', 'U_InvNumber', job.payment_qr_inv_number, line.U_InvNumber),
  ];
}

/**
 * Human-readable log for CLI / API dry-run.
 */
export function formatJobSyncSapPlanLog(plan) {
  if (plan.error) return `ERROR: ${plan.error}\n`;

  const lines = [];
  const hr = '─'.repeat(72);

  lines.push('');
  lines.push('═'.repeat(72));
  lines.push('FSM → SAP JOB SYNC DRY RUN (no SAP calls, no DB writes)');
  lines.push('═'.repeat(72));
  lines.push(`Job:        ${plan.jobNumber} (${plan.jobId})`);
  lines.push(`Customer:   ${plan.customerCode}`);
  lines.push(`Action:     ${plan.action.toUpperCase()} Activities`);
  lines.push(`SAP Act ID: ${plan.sapActivityId || '(none — will CREATE)'}`);
  lines.push(`ServiceCall: ${plan.serviceCallNumber || '—'}`);
  lines.push(`Sales Order: ${plan.salesOrderNumber || '—'}`);
  if (plan.warnings?.length) {
    lines.push('');
    lines.push('Warnings:');
    plan.warnings.forEach((w) => lines.push(`  ⚠ ${w}`));
  }

  for (const key of ['activity', 'jobSchedule', 'serviceCall']) {
    const step = plan.steps[key];
    lines.push('');
    lines.push(hr);
    lines.push(`Step ${step.step}: ${step.name} — ${step.method || ''} ${step.endpoint || ''}`.trim());
    if (step.skipped) {
      lines.push(`  SKIPPED: ${step.reason}`);
      continue;
    }
    if (step.note) lines.push(`  Note: ${step.note}`);
    lines.push('');
    lines.push('  Field mapping (FSM → SAP):');
    lines.push('  ' + 'FSM source'.padEnd(36) + 'SAP field'.padEnd(22) + 'SAP value');
    lines.push('  ' + '-'.repeat(70));
    for (const m of step.mappings || []) {
      const fsm = String(m.fsmPath).slice(0, 34);
      const sapF = String(m.sapField).slice(0, 20);
      const val = truncate(m.sapValue, 40);
      lines.push(`  ${fsm.padEnd(36)}${sapF.padEnd(22)}${val}`);
    }
    lines.push('');
    lines.push('  Request JSON:');
    lines.push(JSON.stringify(step.payload || step.postBody || step.patchBody, null, 2)
      .split('\n')
      .map((l) => '  ' + l)
      .join('\n'));
    if (step.patchBody && step.postBody) {
      lines.push('');
      lines.push('  PATCH body (on duplicate):');
      lines.push(JSON.stringify(step.patchBody, null, 2)
        .split('\n')
        .map((l) => '  ' + l)
        .join('\n'));
    }
  }

  lines.push('');
  lines.push(hr);
  lines.push('Step 4: SQL (SCL5 / OCLG — after Activity sync)');
  if (plan.sql.scl5.skipped) lines.push('  SCL5: skipped (no sap_activity_id)');
  else lines.push(`  SCL5: ${plan.sql.scl5.preview}`);
  if (plan.sql.oclg.skipped) lines.push('  OCLG: skipped');
  else lines.push(`  OCLG: ${plan.sql.oclg.preview}`);

  lines.push('');
  lines.push('═'.repeat(72));
  return lines.join('\n');
}

function truncate(val, max) {
  const s = val == null ? '' : String(val);
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

/**
 * Dry-run entry: load job + build plan.
 */
export async function previewJobSyncToSAP({ jobId, supabase, sessionCookies }) {
  const ctx = await loadJobSyncContext(supabase, jobId);
  if (ctx.error) return { success: false, error: ctx.error };
  let cookies = sessionCookies;
  if (!cookies) {
    const envLogin = unwrapSapEnvironmentLogin(await loginSessionCookiesFromEnvironment());
    cookies = envLogin;
  }
  if (!cookies) {
    return {
      success: false,
      error: 'SAP session required to resolve job status (provide cookies or SAP_B1_* env vars)',
    };
  }

  const sapJobStatuses = await fetchSapJobStatuses(cookies);
  const resolved = resolvePortalJobStatusToSap(ctx.job?.status, sapJobStatuses);
  const plan = buildJobSyncSapPlan({
    ...ctx,
    job: {
      ...ctx.job,
      jobStatusId: resolved.jobStatusId,
      jobStatusLabel: resolved.jobStatusLabel,
      sapJobStatuses,
    },
  });
  return {
    success: true,
    dryRun: true,
    plan,
    log: formatJobSyncSapPlanLog(plan),
  };
}
