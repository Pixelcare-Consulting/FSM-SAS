import assert from 'node:assert/strict';

import { calculateTechnicianJobIncentive, assignmentPeriodAnchorMs, isJobStatusCompletedForLabor } from '../lib/supabase/reports.js';
import {
  collectMatchingUdtRows,
  collectUdtRowsForCalendarMonth,
  collectUdtRowsForWorkerMonth,
  hourlyRateFromUdtRow,
  hourlyRateFromUdtRows,
  matchWorkerToSingleUdtRow,
  pickUdtRowForCalendarMonth,
  duplicateUdtODataKeysForMonth,
  pickCanonicalUdtRowForMonth,
  findSummaryRowForSapTech,
  pickUdtRowForPush,
  parseSapPeriodLabel,
  sapTechFromUdtAndSp,
  summaryRowWorkingHrs,
  sumUdtWorkingHrsForRows,
  udtRowCode,
  udtRowODataKey,
  udtRowPeriodLabel,
  udtTotalsFromRows,
} from '../lib/sap/jobIncentiveMatch.js';
import { getFsmPeriodRangeMs } from '../lib/supabase/technicianHours.js';
import { buildUdtEntityKeyPath } from '../lib/sap/udtOData.js';
import {
  buildSAPActivityPayload,
  buildSAPActivityPatchPayload,
  mapPortalJobStatusToSap,
  pickJobIncentiveRecontactDate,
} from '../lib/utils/sapActivityTransform.js';

const sapJobStatuses = [
  { U_JobStatusID: '554', U_JobStatus: 'Unconfirmed' },
  { U_JobStatusID: '555', U_JobStatus: 'Confirmed' },
  { U_JobStatusID: '-1', U_JobStatus: 'Job Done' },
  { U_JobStatusID: '612', U_JobStatus: 'Quotation Sent' },
  { U_JobStatusID: '616', U_JobStatus: 'Cancelled' },
];

const completedJob = {
  started_at: '2026-05-12T01:00:00.000Z',
  completed_at: '2026-05-12T03:30:00.000Z',
  assignment_status: 'COMPLETED',
  technician: {
    job_incentive_hourly_rate: '120.50',
  },
};

const incentive = calculateTechnicianJobIncentive(completedJob);

assert.equal(incentive.laborHours, 2.5);
assert.equal(incentive.incentiveRate, 120.5);
assert.equal(incentive.incentiveAmount, 301.25);

const incompleteJob = calculateTechnicianJobIncentive({
  started_at: '2026-05-12T01:00:00.000Z',
  completed_at: null,
  technician: { job_incentive_hourly_rate: 90 },
});

assert.equal(incompleteJob.laborHours, 0);
assert.equal(incompleteJob.incentiveAmount, 0);

const anchorSched = {
  started_at: null,
  completed_at: null,
  job: { scheduled_start: '2025-05-14T09:00:00.000Z' },
};
assert.equal(assignmentPeriodAnchorMs(anchorSched), new Date('2025-05-14T09:00:00.000Z').getTime());

const anchorStart = {
  started_at: '2025-05-15T01:00:00.000Z',
  completed_at: null,
  job: { scheduled_start: '2025-05-14T09:00:00.000Z' },
};
assert.equal(assignmentPeriodAnchorMs(anchorStart), new Date('2025-05-15T01:00:00.000Z').getTime());

const anchorDone = {
  started_at: '2025-05-10T01:00:00.000Z',
  completed_at: '2025-05-12T03:00:00.000Z',
  assignment_status: 'COMPLETED',
  job: { scheduled_start: '2025-05-09T09:00:00.000Z', scheduled_end: '2025-05-12T03:00:00.000Z' },
};
assert.equal(assignmentPeriodAnchorMs(anchorDone), new Date('2025-05-12T03:00:00.000Z').getTime());
assert.equal(calculateTechnicianJobIncentive(anchorDone).laborHours, 48);

const lateCompletionJob = {
  assignment_status: 'COMPLETED',
  started_at: '2026-05-08T05:00:00.000Z',
  completed_at: '2026-06-15T05:00:00.000Z',
  job: {
    scheduled_start: '2026-05-08T05:00:00.000Z',
    scheduled_end: '2026-05-08T08:00:00.000Z',
  },
};
assert.equal(calculateTechnicianJobIncentive(lateCompletionJob).laborHours, 3);
assert.equal(
  assignmentPeriodAnchorMs(lateCompletionJob),
  new Date('2026-05-08T08:00:00.000Z').getTime()
);

const jobDoneAssigned = {
  started_at: null,
  completed_at: null,
  assignment_status: 'ASSIGNED',
  job: {
    status: 'JOB_DONE',
    scheduled_start: '2026-05-08T06:00:00+00:00',
    scheduled_end: '2026-05-08T08:00:00+00:00',
  },
};
assert.equal(calculateTechnicianJobIncentive(jobDoneAssigned).laborHours, 2);
assert.equal(isJobStatusCompletedForLabor('JOB_DONE_TO_INVOICE'), true);
assert.equal(isJobStatusCompletedForLabor('CONFIRMED'), false);

const staleStartedCompleted = {
  assignment_status: 'COMPLETED',
  started_at: '2025-05-08T05:00:00.000Z',
  completed_at: '2025-06-15T05:00:00.000Z',
  job: {
    scheduled_start: '2026-05-08T05:00:00.000Z',
    scheduled_end: '2026-05-08T08:00:00.000Z',
  },
};
assert.equal(calculateTechnicianJobIncentive(staleStartedCompleted).laborHours, 3);

const inProgressStrayComplete = {
  assignment_status: 'STARTED',
  started_at: '2026-06-02T01:00:00.000Z',
  completed_at: '2026-06-10T01:00:00.000Z',
  job: { status: 'IN_PROGRESS', scheduled_start: '2026-06-02T01:00:00.000Z', scheduled_end: '2026-06-02T04:00:00.000Z' },
};
assert.equal(calculateTechnicianJobIncentive(inProgressStrayComplete).laborHours, 0);

const recontact = pickJobIncentiveRecontactDate(
  { scheduled_start: '2026-03-15T00:00:00.000Z' },
  [{ jsdate: '2026-02-10' }, { jsdate: '2026-01-05' }]
);
assert.equal(recontact, '2026-01-05');

const activityPayload = buildSAPActivityPayload(
  { job_number: '2026-000005', title: 'Test', scheduled_start: '2026-03-15T00:00:00.000Z' },
  { customer_code: 'C000226' },
  { jobScheduleRows: [{ jsdate: '2026-02-10' }], jobStatusId: '554', jobStatusLabel: 'Unconfirmed' }
);
assert.equal(activityPayload.Recontact, undefined);
assert.equal(activityPayload.RemindDate, undefined);
assert.equal(activityPayload.U_API_JobStatusID, '554');
assert.equal(activityPayload.U_API_JobStatus, 'Unconfirmed');

assert.deepEqual(mapPortalJobStatusToSap('555', sapJobStatuses), {
  jobStatusId: '555',
  jobStatusLabel: 'Confirmed',
});
assert.deepEqual(mapPortalJobStatusToSap('Confirmed', sapJobStatuses), {
  jobStatusId: '555',
  jobStatusLabel: 'Confirmed',
});
assert.deepEqual(mapPortalJobStatusToSap('Job Done', sapJobStatuses), {
  jobStatusId: '-1',
  jobStatusLabel: 'Job Done',
});
assert.throws(() => mapPortalJobStatusToSap('IN_PROGRESS', sapJobStatuses));

const patchPayload = buildSAPActivityPatchPayload(
  { job_number: '2026-001748', title: 'Patch', status: 'CONFIRMED' },
  { customer_code: 'C000226' },
  { jobStatusId: '555', jobStatusLabel: 'Confirmed' }
);
assert.equal(patchPayload.U_API_JobStatusID, '555');
assert.equal(patchPayload.U_API_JobStatus, 'Confirmed');

const workerAligned = { full_name: '0AAA Selvaraj.', email: 'selvaraj@sas.com' };
const udtRows = [
  { Name: '544', U_TechName: '0AAA Selvaraj.', U_IncomePerHour: 0, U_SIncomePerHour: 0 },
  { Name: 'TechFromName', U_TechName: 'Other Person', U_IncomePerHour: 10, U_SIncomePerHour: 5 },
];
assert.equal(matchWorkerToSingleUdtRow(workerAligned, udtRows)?.Name, '544');
assert.equal(
  matchWorkerToSingleUdtRow({ full_name: 'Nobody', email: 'x@y.com' }, udtRows),
  null
);
const multiPeriodUdt = [
  { Name: '1', U_TechName: 'Same Name', U_IncomePerHour: 1, U_Year: 2025, U_JobMonth: 10 },
  { Name: '2', U_TechName: 'Same Name', U_IncomePerHour: 5, U_Year: 2025, U_JobMonth: 11 },
];
assert.equal(
  matchWorkerToSingleUdtRow({ full_name: 'Same Name', email: 'a@b.com' }, multiPeriodUdt)?.Name,
  '2'
);
assert.equal(
  hourlyRateFromUdtRows(collectMatchingUdtRows({ full_name: 'Same Name', email: 'a@b.com' }, multiPeriodUdt)),
  5
);

const wMulti = { full_name: 'Same Name', email: 'a@b.com' };
assert.equal(pickUdtRowForCalendarMonth(wMulti, multiPeriodUdt, 2025, 10)?.Name, '1');
assert.equal(pickUdtRowForCalendarMonth(wMulti, multiPeriodUdt, 2025, 11)?.Name, '2');
assert.equal(pickUdtRowForCalendarMonth(wMulti, multiPeriodUdt, 2024, 11), null);

const totalsRows = [
  { U_Income: 100, U_WorkingHrs: 2.5, U_Year: 2025, U_JobMonth: 11 },
  { U_Income: 50, U_WorkingHrs: 1, U_Year: 2025, U_JobMonth: 10 },
];
const tot = udtTotalsFromRows(totalsRows);
assert.equal(tot.income, 150);
assert.equal(tot.workingHrs, 3.5);
assert.equal(tot.periodLabel, '11 2025');

const workerOLetter = { full_name: 'OAAA Selvaraj.', email: 'selvaraj@sas.com' };
const udtWithZero = [{ Name: 'CODE1', U_TechName: '0AAA Selvaraj.', U_IncomePerHour: 0, U_SIncomePerHour: 0 }];
assert.ok(matchWorkerToSingleUdtRow(workerOLetter, udtWithZero));

assert.equal(hourlyRateFromUdtRow(udtRows[0]), null);
assert.equal(hourlyRateFromUdtRow(udtRows[1]), 10);

assert.equal(sapTechFromUdtAndSp(udtRows[0], 'SP99'), 'SP99');
assert.equal(sapTechFromUdtAndSp(udtRows[0], ''), '0AAA Selvaraj.');
assert.equal(sapTechFromUdtAndSp(udtRows[1], ''), 'TechFromName');

const spacedVsCompact = { full_name: '0AAA Selvaraj .', email: 'selvaraj@sas.com' };
const udtCompactTech = [{ Name: '544', U_TechName: '0AAASelvaraj.', U_IncomePerHour: 0 }];
assert.ok(matchWorkerToSingleUdtRow(spacedVsCompact, udtCompactTech));
assert.equal(sapTechFromUdtAndSp(matchWorkerToSingleUdtRow(spacedVsCompact, udtCompactTech), ''), '0AAASelvaraj.');

const workerForPush = { full_name: '0AAA Selvaraj .', email: 'selvaraj@sas.com', sap_tech_code: '0AAASelvar' };
const udtPeriodRows = [
  { Code: 'A1', U_TechName: '0AAA Selvaraj.', U_Year: 2025, U_JobMonth: 11, U_WorkingHrs: 10 },
  { Code: 'A2', U_TechName: '0AAA Selvaraj.', U_Year: 2026, U_JobMonth: 5, U_WorkingHrs: 0 },
];
const pushHit = pickUdtRowForPush(workerForPush, udtPeriodRows, 2025, 11);
assert.equal(pushHit.matchKind, 'code-period');
assert.equal(udtRowCode(pushHit.row), 'A1');

const dupMonthRows = [
  { Code: 'D1', U_TechName: '0AAA Selvaraj.', U_Year: 2025, U_JobMonth: 11, U_WorkingHrs: 1.41 },
  { Code: 'D2', U_TechName: '0AAA Selvaraj.', U_Year: 2025, U_JobMonth: 11, U_WorkingHrs: 1.41 },
  { Code: 'D3', U_TechName: '0AAA Selvaraj.', U_Year: 2025, U_JobMonth: 11, U_WorkingHrs: 1.41 },
];
assert.equal(sumUdtWorkingHrsForRows(dupMonthRows), 4.23);
const canonical = pickCanonicalUdtRowForMonth(dupMonthRows, workerForPush);
assert.equal(udtRowODataKey(canonical), 'D1');
assert.deepEqual(duplicateUdtODataKeysForMonth(dupMonthRows, canonical), ['D2', 'D3']);
assert.equal(collectUdtRowsForCalendarMonth(workerForPush, dupMonthRows, 2025, 11).length, 3);

const workerA1 = { full_name: 'A1 Sin Kiat Lee', email: 'a1@sas.com', sap_tech_code: 'TECH_A1' };
const workerA2 = { full_name: 'A2 Mazlan', email: 'a2@sas.com', sap_tech_code: 'TECH_A2' };
const sharedUdtRows = [
  { Code: 'TECH_A1', U_TechName: 'Lee', U_Year: 2026, U_JobMonth: 6, U_WorkingHrs: 100, U_Income: 500 },
  { Code: 'TECH_A2', U_TechName: 'Mazlan', U_Year: 2026, U_JobMonth: 6, U_WorkingHrs: 80, U_Income: 400 },
  { Code: 'SHARED', U_TechName: 'Lee', U_Year: 2026, U_JobMonth: 6, U_WorkingHrs: 999, U_Income: 0 },
];
assert.equal(collectUdtRowsForWorkerMonth(workerA1, sharedUdtRows, 2026, 6).length, 1);
assert.equal(collectUdtRowsForWorkerMonth(workerA1, sharedUdtRows, 2026, 6)[0].Code, 'TECH_A1');
assert.equal(collectUdtRowsForWorkerMonth(workerA2, sharedUdtRows, 2026, 6)[0].Code, 'TECH_A2');
assert.equal(collectMatchingUdtRows(workerA1, sharedUdtRows).length, 2);

const juneSg = getFsmPeriodRangeMs('M', 2026, 6, 1, 'Asia/Singapore');
assert.ok(juneSg.startMs > 0);
assert.ok(juneSg.endMs > juneSg.startMs);
assert.equal(juneSg.timeZone, 'Asia/Singapore');

const pushMiss = pickUdtRowForPush(workerForPush, udtPeriodRows, 2026, 6);
assert.equal(pushMiss.row, null);
assert.equal(pushMiss.hits.length, 2);

const workerCodeOnly = { full_name: 'Unknown Person', email: 'x@y.com', sap_tech_code: '0AAASelvar' };
const pushByCode = pickUdtRowForPush(workerCodeOnly, udtPeriodRows, 2025, 11);
assert.equal(pushByCode.matchKind, 'code-period');

assert.deepEqual(parseSapPeriodLabel('11 2025'), { month: 11, year: 2025 });
assert.equal(udtRowPeriodLabel(udtPeriodRows[0]), '11 2025');

assert.equal(buildUdtEntityKeyPath('U_JOB_INCENTIVES', '544'), 'U_JOB_INCENTIVES(544)');
assert.equal(buildUdtEntityKeyPath('U_JOB_INCENTIVES', '0AAASelvar'), "U_JOB_INCENTIVES('0AAASelvar')");
assert.equal(udtRowODataKey({ Code: 'C1', Name: '544' }), 'C1');
assert.equal(udtRowCode({ Code: 'C1', Name: '544' }), 'C1');
assert.equal(udtRowODataKey({ Name: '544' }), '');
assert.equal(udtRowCode({ Name: '544' }), '544');

const spRows = [
  { Tech: '0AAASelvar', WorkingHrs: 4.23, RowType: 'D' },
  { Tech: 'OTHER', WorkingHrs: 0, RowType: 'G' },
];
assert.equal(summaryRowWorkingHrs(findSummaryRowForSapTech(spRows, '0AAASelvar')), 4.23);

console.log('jobIncentives tests passed');
