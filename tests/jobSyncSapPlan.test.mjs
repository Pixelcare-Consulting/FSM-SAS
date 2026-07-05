import assert from 'node:assert/strict';
import { buildJobSyncSapPlan, formatJobSyncSapPlanLog } from '../lib/services/jobSyncSapPlan.js';

const plan = buildJobSyncSapPlan({
  job: {
    id: 'job-uuid',
    job_number: '2026-000099',
    title: 'Test Job',
    description: 'Notes here',
    priority: 'MEDIUM',
    status: '554',
    jobStatusId: '554',
    jobStatusLabel: 'Unconfirmed',
    scheduled_start: '2026-05-06T08:00:00.000Z',
    scheduled_end: '2026-05-06T10:00:00.000Z',
    sap_activity_id: '15492',
    payment_qr_inv_number: null,
    sap_cm_number: null,
    sap_job_income: null,
    service_call: { call_number: '15050' },
    sales_order: { document_number: '3004252' },
    technician_jobs: [
      {
        deleted_at: null,
        assignment_status: 'ASSIGNED',
        technician: { sap_tech_code: 'TECH01', full_name: 'Tech One' },
      },
    ],
  },
  customer: { customer_code: 'C001079', customer_name: 'Test Customer' },
  scheduleRows: [
    {
      jsdate: '2026-05-06',
      jedate: '2026-05-06',
      jstime: '08:00:00',
      jetime: '10:00:00',
      dur: '2',
      address: '48 SUMANG WALK',
    },
  ],
});

assert.equal(plan.action, 'update');
assert.equal(plan.steps.activity.method, 'PATCH');
assert.equal(plan.steps.serviceCall.endpoint, 'ServiceCalls(15050)');
assert.ok(plan.steps.jobSchedule.patchBody.U_CallID === 15050);

const log = formatJobSyncSapPlanLog(plan);
assert.ok(log.includes('FSM → SAP JOB SYNC DRY RUN'));
assert.ok(log.includes('U_API_PONo'));

console.log('jobSyncSapPlan.test.mjs: ok');
