import assert from 'node:assert/strict';

import {
  activityCustomerForJob,
  buildServiceCallActivityLine,
  buildServiceCallPatchBody,
  deriveInvoiceStatusFlag,
  findServiceCallActivityLine,
  hasRealSapInvoiceNumber,
  mergeServiceCallActivityCollection,
  pickStoredServiceCallActivityLine,
  withoutCustomJobRefs,
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
assert.equal(addLine.U_JobStatus, 'NI', 'every portal sync sends NI');
assert.equal(addLine.U_InvNumber, undefined, 'portal does not send U_InvNumber');

const stored = pickStoredServiceCallActivityLine({
  LineNum: 16,
  ActivityCode: 33547,
  U_API_Tech: 'A3KeeDinNg,0CSO0MookJinBong',
  StartDate: '2026-08-18',
});
assert.equal(stored.U_API_Tech, 'A3KeeDinNg,0CSO0MookJinBong');
assert.equal(stored.StartDate, undefined);

const qrUsesJobNumber = {
  sap_activity_id: 33547,
  job_number: '2026-000090',
  status: 'JOB_COMPLETE',
  payment_qr_inv_number: '2026-000090',
};
assert.equal(hasRealSapInvoiceNumber(qrUsesJobNumber), false);
assert.equal(deriveInvoiceStatusFlag(qrUsesJobNumber, []), 'NI');
const qrJobLine = buildServiceCallActivityLine({
  job: qrUsesJobNumber,
  poNumber: null,
  technicianJobs: [],
  lineNum: 16,
  jobStatus: { jobStatusId: '-1', jobStatusLabel: 'Job Done' },
});
assert.equal(qrJobLine.U_JobStatus, 'NI', 'job-number QR ref stays not invoiced');
assert.equal(qrJobLine.U_InvNumber, undefined, 'does not send job number as U_InvNumber');

const qrJobNumberCase = {
  ...qrUsesJobNumber,
  payment_qr_inv_number: ' 2026-000090 ',
};
assert.equal(hasRealSapInvoiceNumber(qrJobNumberCase), false);

const realInvoiceJob = {
  sap_activity_id: 33547,
  job_number: '2026-000090',
  status: 'JOB_COMPLETE',
  payment_qr_inv_number: '9008910',
};
assert.equal(hasRealSapInvoiceNumber(realInvoiceJob), true);
assert.equal(deriveInvoiceStatusFlag(realInvoiceJob, []), 'NI', 'portal never sends I even with a real invoice number');
const realInvLine = buildServiceCallActivityLine({
  job: realInvoiceJob,
  poNumber: null,
  technicianJobs: [],
  lineNum: 16,
  jobStatus: { jobStatusId: '-1', jobStatusLabel: 'Job Done' },
});
assert.equal(realInvLine.U_JobStatus, 'NI');
assert.equal(realInvLine.U_InvNumber, undefined, 'Document Automation owns U_InvNumber');

const invoicedLine = buildServiceCallActivityLine({
  job: realInvoiceJob,
  poNumber: null,
  technicianJobs: [],
  lineNum: 16,
  jobStatus: { jobStatusId: '-1', jobStatusLabel: 'Job Done' },
  priorLine: { LineNum: 16, ActivityCode: 33547, U_JobStatus: 'I' },
});
assert.equal(invoicedLine.U_JobStatus, undefined, 'does not revert a Document Automation invoiced line to NI');

const notInvoicedPrior = buildServiceCallActivityLine({
  job: realInvoiceJob,
  poNumber: null,
  technicianJobs: [],
  lineNum: 16,
  jobStatus: { jobStatusId: '-1', jobStatusLabel: 'Job Done' },
  priorLine: { LineNum: 16, ActivityCode: 33547, U_JobStatus: 'NI' },
});
assert.equal(notInvoicedPrior.U_JobStatus, 'NI');

for (const extra of [
  { sap_cm_number: null, sap_job_income: 0 },
  { sap_cm_number: 'CM-7', sap_job_income: '150.5' },
]) {
  const line = buildServiceCallActivityLine({
    job: { ...realInvoiceJob, ...extra },
    poNumber: null,
    technicianJobs: [],
    lineNum: 16,
    jobStatus: { jobStatusId: '-1', jobStatusLabel: 'Job Done' },
  });
  assert.equal(line.U_CMNumber, undefined, 'SAP owns U_CMNumber; portal never sends it');
  assert.equal(line.U_JobIncome, undefined, 'SAP owns U_JobIncome; portal default 0 must not overwrite it');
}

assert.equal(formatAuditValueEmptyObject({}), '—', 'empty audit objects display as em dash, not {}');
assert.equal(
  formatAuditValueEmptyObject({ httpStatus: 204, storedLine: stored, techPersisted: true }),
  'populated',
  'GET-after-PATCH response is shown in audit instead of an empty object'
);

{
  const refs = { service_call: { call_number: 'SC-TYPED' }, sales_order: { document_number: 'SO-TYPED' } };
  const custom = withoutCustomJobRefs({ id: 'j1', use_custom_service_call: true, ...refs });
  assert.equal(custom.service_call, null, 'custom service call is never sent to SAP');
  assert.equal(custom.sales_order, null, 'custom sales order is never sent to SAP');
  assert.equal(custom.id, 'j1');

  const picked = { id: 'j2', use_custom_service_call: false, ...refs };
  assert.equal(withoutCustomJobRefs(picked), picked, 'SAP-picked refs are kept');
}

{
  const customer = { id: 'c1', customer_code: 'C000111', customer_name: 'Job Customer', sap_card_code: null };
  const ownerJob = {
    service_call: { call_number: '9001' },
    service_call_owner_code: 'C000222',
    service_call_owner_name: 'Call Owner',
  };
  const owner = activityCustomerForJob(ownerJob, customer);
  assert.equal(owner.customer_code, 'C000222', 'Activity is booked under the service call owner');
  assert.equal(owner.customer_name, 'Call Owner');
  assert.equal(owner.id, 'c1', 'portal job customer id is kept');

  const leadOwner = activityCustomerForJob(
    { ...ownerJob, service_call_owner_code: 'L000333' },
    { ...customer, customer_code: 'CP0001', sap_card_code: 'L000999' }
  );
  assert.equal(leadOwner.customer_code, 'L000333');
  assert.equal(leadOwner.sap_card_code, null, "job customer's lead code never overrides the owner");

  assert.equal(activityCustomerForJob({ service_call: { call_number: '9001' } }, customer), customer, 'own call keeps the job customer');
  assert.equal(
    activityCustomerForJob(withoutCustomJobRefs({ ...ownerJob, use_custom_service_call: true }), customer),
    customer,
    'custom refs never switch the CardCode'
  );
}

console.log('sapServiceCallTransform tests passed');
