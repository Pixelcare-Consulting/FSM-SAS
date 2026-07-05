import assert from 'node:assert/strict';

import {
  formatSapUdtHoursAuditDescription,
  formatSapCustomerSyncAuditDescription,
  formatJobSyncAuditDescription,
  SAP_UDT_PUSH_LIFECYCLE,
  JOB_SYNC_LIFECYCLE,
} from '../lib/services/auditLogFormatters.js';

// SAP UDT hours push descriptions
assert.match(
  formatSapUdtHoursAuditDescription({
    workerName: 'Alice Tech',
    year: 2026,
    month: 3,
    workingHrs: 42.5,
    code: 'T001',
  }),
  /Alice Tech/
);
assert.match(
  formatSapUdtHoursAuditDescription({
    workerName: 'Alice Tech',
    year: 2026,
    month: 3,
    workingHrs: 42.5,
    code: 'T001',
    zeroedCount: 2,
  }),
  /zeroed 2 duplicate/
);
assert.match(
  formatSapUdtHoursAuditDescription({
    workerName: 'Bob',
    year: 2026,
    month: 1,
    error: 'SAP session required',
  }),
  /failed.*SAP session required/i
);

// SAP customer sync descriptions
assert.match(
  formatSapCustomerSyncAuditDescription({
    customerName: 'Acme Corp',
    cardCode: 'C000123',
    outcome: 'created',
  }),
  /created.*Acme Corp.*C000123/
);
assert.match(
  formatSapCustomerSyncAuditDescription({
    customerName: 'Acme Corp',
    outcome: 'exists',
  }),
  /already exists/
);
assert.match(
  formatSapCustomerSyncAuditDescription({
    customerName: 'Acme Corp',
    error: 'Connection refused',
  }),
  /failed.*Connection refused/
);

// Job sync descriptions (existing helper, regression guard)
assert.match(
  formatJobSyncAuditDescription({
    result: { success: true, sap_activity_id: '99', syncAction: 'create' },
    jobNumber: '2026-000001',
  }),
  /Activity is Added/
);
assert.match(
  formatJobSyncAuditDescription({
    result: { success: false, error: 'timeout' },
    jobNumber: '2026-000002',
  }),
  /sync failed.*timeout/i
);

// Lifecycle constants
assert.equal(SAP_UDT_PUSH_LIFECYCLE.STARTED, 'SAP UDT hours push started');
assert.equal(JOB_SYNC_LIFECYCLE.STARTED, 'Job Sync Application is started');

console.log('auditLogSap tests passed');
