import assert from 'node:assert/strict';

import { resolvePortalJobStatusToSap } from '../lib/utils/sapJobStatusResolver.js';

const sapJobStatuses = [
  { U_JobStatusID: '554', U_JobStatus: 'Unconfirmed' },
  { U_JobStatusID: '555', U_JobStatus: 'Confirmed' },
  { U_JobStatusID: '-5', U_JobStatus: 'Cancelled' },
  { U_JobStatusID: '572', U_JobStatus: 'Completed' },
  { U_JobStatusID: '556', U_JobStatus: 'In Progress' },
];

// Numeric pass-through
const passThrough = resolvePortalJobStatusToSap('554', sapJobStatuses);
assert.equal(passThrough.jobStatusId, '554');
assert.equal(passThrough.jobStatusLabel, 'Unconfirmed');

// CREATED → Unconfirmed (554)
const created = resolvePortalJobStatusToSap('CREATED', sapJobStatuses);
assert.equal(created.jobStatusId, '554');
assert.equal(created.jobStatusLabel, 'Unconfirmed');

// CONFIRMED → 555
const confirmed = resolvePortalJobStatusToSap('CONFIRMED', sapJobStatuses);
assert.equal(confirmed.jobStatusId, '555');
assert.equal(confirmed.jobStatusLabel, 'Confirmed');

// COMPLETED → completed SAP ID
const completed = resolvePortalJobStatusToSap('COMPLETED', sapJobStatuses);
assert.equal(completed.jobStatusId, '572');
assert.equal(completed.jobStatusLabel, 'Completed');

// Unknown status throws
assert.throws(
  () => resolvePortalJobStatusToSap('TOTALLY_UNKNOWN_X', sapJobStatuses),
  /Cannot resolve jobs\.status 'TOTALLY_UNKNOWN_X'/
);

// Unknown numeric ID throws
assert.throws(
  () => resolvePortalJobStatusToSap('99999', sapJobStatuses),
  /Unknown SAP jobStatusId '99999'/
);

console.log('sapJobStatusResolver.test.mjs: ok');
