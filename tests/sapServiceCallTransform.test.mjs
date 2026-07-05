import assert from 'node:assert/strict';
import {
  formatSapApiTechList,
  nextServiceCallActivityLineNum,
  findServiceCallActivityLine,
  buildServiceCallActivityLine,
} from '../lib/utils/sapServiceCallTransform.js';

assert.equal(
  formatSapApiTechList([
    { deleted_at: null, technician: { sap_tech_code: 'T1', full_name: 'Alice' } },
    { deleted_at: null, technician: { full_name: 'Bob' } },
  ]),
  'T1,Bob'
);

assert.equal(nextServiceCallActivityLineNum([{ LineNum: 0 }, { LineNum: 2 }]), 3);
assert.equal(nextServiceCallActivityLineNum([]), 0);

const existing = findServiceCallActivityLine([{ LineNum: 1, ActivityCode: 99 }], 99);
assert.ok(existing);

const line = buildServiceCallActivityLine({
  job: { job_number: '2026-000001', status: '554', sap_activity_id: '15492' },
  poNumber: '3003088',
  technicianJobs: [{ deleted_at: null, technician: { sap_tech_code: 'Z1' } }],
  lineNum: 0,
  jobStatus: { jobStatusId: '554', jobStatusLabel: 'Unconfirmed' },
});
assert.equal(line.U_API_PONo, '3003088');
assert.equal(line.U_API_JobNumber, '2026-000001');
assert.equal(line.ActivityCode, 15492);

console.log('sapServiceCallTransform.test.mjs: ok');
