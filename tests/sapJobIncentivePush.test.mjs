import assert from 'node:assert/strict';

import {
  buildApiJobScheduleCodeEndpoint,
  buildScl5IncentiveUpdateSql,
} from '../lib/services/sapJobIncentivePush.js';

// Numeric Code must be unquoted; SAP rejects ('1293354') with "Error in query syntax".
assert.equal(buildApiJobScheduleCodeEndpoint('U_API_JOB_SCHEDULE', 1293354), 'U_API_JOB_SCHEDULE(1293354)');
assert.equal(buildApiJobScheduleCodeEndpoint('U_API_JOB_SCHEDULE', '1293354'), 'U_API_JOB_SCHEDULE(1293354)');
assert.equal(buildApiJobScheduleCodeEndpoint('U_API_JOB_SCHEDULE', "A'1"), "U_API_JOB_SCHEDULE('A''1')");

const sql = buildScl5IncentiveUpdateSql({
  clgId: '33547',
  uApiJobNumber: "2026-'90",
  uJobStatus: 'NI',
  // SAP-owned; must be ignored even if a caller passes them.
  uCmNumber: 'CM-1',
  uJobIncome: 0,
  uCmStatus: 'WCM',
});
assert.equal(
  sql,
  "UPDATE [SCL5] SET [U_API_JobNumber] = N'2026-''90', " +
    "[U_JobStatus] = CASE WHEN [U_JobStatus] = N'I' THEN [U_JobStatus] ELSE N'NI' END " +
    'WHERE [ClgID] = 33547'
);
assert.ok(!/U_CMNumber|U_JobIncome|U_CMStatus/.test(sql), 'never writes SAP-owned CM / income fields');

assert.equal(buildScl5IncentiveUpdateSql({ clgId: 'abc', uApiJobNumber: 'J' }), null);

console.log('sapJobIncentivePush tests passed');
