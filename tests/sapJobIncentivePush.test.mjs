import assert from 'node:assert/strict';

import sapService from '../lib/services/sapService.js';
import {
  buildApiJobScheduleCodeEndpoint,
  buildApiJobSchedulePayload,
  buildScl5IncentiveUpdateSql,
  planApiJobScheduleRows,
  upsertApiJobScheduleRow,
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

// --- One @API_JOB_SCHEDULE row per tech (Job Incentives groups by U_JobTech) ---
const tj = (code, name, extra = {}) => ({ technician: { sap_tech_code: code, full_name: name }, ...extra });
const BASE = '2026-000090__33547';

{
  const built = buildApiJobSchedulePayload({
    jobNumber: '2026-000090',
    sapActivityId: 33547,
    technicianJobs: [
      tj('A2Mazlan', 'A2 Mazlan'),
      tj('A1SinKiatLee', 'A1 Sin Kiat Lee'),
      tj('A2Mazlan', 'dup'),
      tj(null, 'C6 MV SANTHOSH .'),
      tj('GONE', 'Removed', { deleted_at: '2026-10-01' }),
    ],
    serviceCallNumber: '1234',
  });
  assert.deepEqual(built.techs, ['A2Mazlan', 'A1SinKiatLee', 'C6 MV SANTHOSH .']);
  assert.deepEqual(built.rows.map((r) => r.patchBody.U_JobTech), built.techs);
  assert.ok(built.rows.every((r) => !r.patchBody.U_JobTech.includes(',')), 'never a combined tech value');
  assert.deepEqual(built.rows.map((r) => r.name), [BASE, `${BASE}__A1SinKiatLee`, `${BASE}__C6_MV_SANTHOSH_.`]);
  assert.equal(built.rows[0].postBody.U_CallID, 1234);
}

{
  // Legacy combined row is repurposed for the first tech; the others are created.
  const plan = planApiJobScheduleRows({
    existingRows: [{ Code: 101, Name: BASE, U_JobTech: 'A2Mazlan,A1SinKiatLee' }],
    techs: ['A2Mazlan', 'A1SinKiatLee'],
    baseName: BASE,
  });
  assert.deepEqual(plan.patches, [{ code: 101, tech: 'A2Mazlan' }]);
  assert.deepEqual(plan.deletes, []);
  assert.deepEqual(plan.posts, [{ name: `${BASE}__A1SinKiatLee`, tech: 'A1SinKiatLee' }]);
}

{
  // Matching rows are kept (case-insensitive), a removed tech's row is deleted,
  // duplicates of the same tech are cleaned up.
  const plan = planApiJobScheduleRows({
    existingRows: [
      { Code: 201, Name: BASE, U_JobTech: 'a2mazlan' },
      { Code: 202, Name: `${BASE}__C4Yoga.`, U_JobTech: 'C4Yoga.' },
      { Code: 203, Name: 'dup', U_JobTech: 'A2Mazlan' },
      { Name: 'no-code', U_JobTech: 'X' },
    ],
    techs: ['A2Mazlan'],
    baseName: BASE,
  });
  assert.deepEqual(plan.patches, [{ code: 201, tech: 'A2Mazlan' }]);
  assert.deepEqual(plan.deletes, [202, 203]);
  assert.deepEqual(plan.posts, []);
}

{
  // A new Name never collides with an existing row's Name.
  const plan = planApiJobScheduleRows({
    existingRows: [{ Code: 301, Name: BASE, U_JobTech: 'B' }],
    techs: ['B', 'A'],
    baseName: BASE,
  });
  assert.deepEqual(plan.posts, [{ name: `${BASE}__A`, tech: 'A' }]);
  const clash = planApiJobScheduleRows({ existingRows: [], techs: ['A'], baseName: BASE });
  assert.deepEqual(clash.posts, [{ name: BASE, tech: 'A' }]);
}

{
  // upsert issues PATCH / DELETE / POST against SAP according to the plan.
  const calls = [];
  const stored = [
    { Code: 401, Name: BASE, U_JobNo: '2026-000090', U_JobTech: 'A2Mazlan,C4Yoga.' },
    { Code: 402, Name: 'old-dup', U_JobNo: '2026-000090', U_JobTech: 'A2Mazlan,C4Yoga.' },
    { Code: 403, Name: 'old-dup-2', U_JobNo: '2026-000090', U_JobTech: 'A2Mazlan,C4Yoga.' },
  ];
  const original = sapService.makeRequest;
  sapService.makeRequest = async (endpoint, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ method, endpoint, body: options.body });
    if (method === 'GET') return { value: stored };
    if (method === 'POST') return { Code: 999, ...options.body };
    return {};
  };
  try {
    const res = await upsertApiJobScheduleRow(
      { b1session: 's', routeid: 'r' },
      {
        jobNumber: '2026-000090',
        sapActivityId: 33547,
        technicianJobs: [tj('A2Mazlan', 'x'), tj('C4Yoga.', 'y'), tj('C5Muthu.', 'z')],
        serviceCallNumber: 1234,
      }
    );
    assert.equal(res.ok, true);
    const writes = calls.filter((c) => c.method !== 'GET');
    assert.deepEqual(
      writes.map((c) => [c.method, c.endpoint, c.body?.U_JobTech]),
      [
        ['PATCH', 'U_API_JOB_SCHEDULE(401)', 'A2Mazlan'],
        ['PATCH', 'U_API_JOB_SCHEDULE(402)', 'C4Yoga.'],
        ['PATCH', 'U_API_JOB_SCHEDULE(403)', 'C5Muthu.'],
      ]
    );
    assert.ok(writes.every((c) => c.body.U_CallID === 1234 && c.body.U_JobNo === '2026-000090'));
  } finally {
    sapService.makeRequest = original;
  }
}

console.log('sapJobIncentivePush tests passed');
