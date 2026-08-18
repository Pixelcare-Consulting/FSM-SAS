import assert from 'node:assert/strict';

import {
  buildServiceCallActivityLine,
  buildServiceCallPatchBody,
  findServiceCallActivityLine,
  mergeServiceCallActivityCollection,
  pickStoredServiceCallActivityLine,
} from '../lib/utils/sapServiceCallTransform.js';

/** Mirrors `formatAuditValue` in utils/auditLogDisplay.js for empty objects. */
function formatAuditValueEmptyObject(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '—';
  }
  return 'populated';
}

const sibling = {
  LineNum: 15,
  ActivityCode: 11111,
  U_API_Tech: 'KeepMe',
  U_API_JobStatus: 'Job Done',
  U_API_PONo: 'PO-1',
  U_InvNumber: 'INV-1',
  U_JobStatus: 'NI',
  StartDate: '2026-01-01',
};

const prior = {
  LineNum: 16,
  ActivityCode: 33547,
  U_API_Tech: 'OldTech',
  U_API_JobStatus: 'Unconfirmed',
};

const updated = {
  LineNum: 16,
  ActivityCode: 33547,
  U_API_Tech: 'A3KeeDinNg,0CSO0MookJinBong',
  U_API_JobStatus: 'Job Done',
  U_API_JobNumber: '2026-000090',
};

const merged = mergeServiceCallActivityCollection([sibling, prior], updated);

assert.equal(merged.length, 2, 'does not drop sibling activity lines');
assert.equal(merged[0].ActivityCode, 11111);
assert.equal(merged[0].U_API_Tech, 'KeepMe', 'sibling U_API_Tech is preserved');
assert.equal(merged[0].U_API_JobStatus, 'Job Done');
assert.equal(merged[0].U_API_PONo, 'PO-1');
assert.equal(merged[0].StartDate, undefined, 'does not copy unrelated SAP fields');
assert.equal(merged[1].U_API_Tech, 'A3KeeDinNg,0CSO0MookJinBong');
assert.equal(merged[1].U_API_JobNumber, '2026-000090');

const appended = mergeServiceCallActivityCollection([sibling], updated);
assert.equal(appended.length, 2, 'appends when ActivityCode is new');
assert.equal(appended[1].ActivityCode, 33547);

const patchBody = buildServiceCallPatchBody(updated);
assert.equal(patchBody.ServiceCallActivities.length, 1, 'live PATCH sends only the target line');
assert.equal(patchBody.ServiceCallActivities[0].ActivityCode, 33547);
assert.equal(
  patchBody.ServiceCallActivities.filter((row) => row.ActivityCode === 11111).length,
  0,
  'live PATCH does not re-send sibling ActivityCodes'
);

const previewBody = buildServiceCallPatchBody(updated);
assert.equal(previewBody.ServiceCallActivities.length, 1, 'preview without GET is a single line');

const foundByString = findServiceCallActivityLine([sibling, prior], '33547');
assert.equal(foundByString?.LineNum, 16);
const foundByNumber = findServiceCallActivityLine([sibling, prior], 33547);
assert.equal(foundByNumber?.ActivityCode, 33547);
assert.equal(
  findServiceCallActivityLine([sibling], 33547),
  undefined,
  'missing ActivityCode is not treated as found'
);

const addLine = buildServiceCallActivityLine({
  job: { sap_activity_id: 33548, job_number: '2026-000090-002', status: 'ASSIGNED' },
  poNumber: null,
  technicianJobs: [],
  lineNum: undefined,
  jobStatus: { jobStatusId: '1', jobStatusLabel: 'Unconfirmed' },
});
assert.equal(addLine.LineNum, undefined, 'omit LineNum when GET did not find the activity');
assert.equal(addLine.ActivityCode, 33548);

const stored = pickStoredServiceCallActivityLine({
  LineNum: 16,
  ActivityCode: 33547,
  U_API_Tech: 'A3KeeDinNg,0CSO0MookJinBong',
  StartDate: '2026-08-18',
});
assert.equal(stored.U_API_Tech, 'A3KeeDinNg,0CSO0MookJinBong');
assert.equal(stored.StartDate, undefined);

assert.equal(formatAuditValueEmptyObject({}), '—', 'empty audit objects display as em dash, not {}');
assert.equal(
  formatAuditValueEmptyObject({ httpStatus: 204, storedLine: stored, techPersisted: true }),
  'populated',
  'GET-after-PATCH response is shown in audit instead of an empty object'
);

console.log('sapServiceCallTransform tests passed');
