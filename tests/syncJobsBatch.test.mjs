import assert from 'node:assert/strict';

import { fetchJobRowsByIds, MAX_SYNC_CHUNK_SIZE, parseJobIds } from '../lib/jobs/syncJobsQuery.js';
import { chunkOutcome, readSseEvents, SYNC_CHUNK_SIZE } from '../lib/jobs/syncSapChunks.js';
import { runBatchSync } from '../lib/jobs/syncJobsBatch.js';
import sapService from '../lib/services/sapService.js';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cookies = { b1session: 's', routeid: 'r' };
const SAP_STATUSES = { value: [{ U_JobStatusID: '1', U_JobStatus: 'Open' }] };

/** syncJobToSAP's first read is jobs…single(); a null row ends that job as "Job not found". */
function fakeJobsSupabase(onSingle) {
  return {
    from: () => {
      let jobId;
      const q = {
        select: () => q,
        is: () => q,
        eq: (col, val) => {
          if (col === 'id') jobId = val;
          return q;
        },
        single: () => onSingle(jobId),
      };
      return q;
    },
  };
}
const jobNotFound = () => Promise.resolve({ data: null, error: { message: 'Job not found' } });

// parseJobIds: absent = not a chunk request; dedupes; rejects bad input.
{
  assert.equal(parseJobIds({}), null);
  assert.deepEqual(parseJobIds({ jobIds: [uuid(1), uuid(1), ` ${uuid(2)} `] }), [uuid(1), uuid(2)]);
  assert.throws(() => parseJobIds({ jobIds: 'x' }), /array/);
  assert.throws(() => parseJobIds({ jobIds: [] }), /empty/);
  assert.throws(() => parseJobIds({ jobIds: ['1; drop table jobs'] }), /UUID/);
  const tooMany = Array.from({ length: MAX_SYNC_CHUNK_SIZE + 1 }, (_, i) => uuid(i));
  assert.throws(() => parseJobIds({ jobIds: tooMany }), /at most/);
  assert.ok(SYNC_CHUNK_SIZE <= MAX_SYNC_CHUNK_SIZE, 'UI chunk must fit the server cap');
}

// fetchJobRowsByIds keeps the planned order, drops missing rows, re-applies the date range.
{
  const calls = [];
  const c = {};
  for (const m of ['select', 'is', 'in', 'not', 'or', 'gte', 'lte']) {
    c[m] = (...args) => {
      calls.push([m, ...args]);
      return c;
    };
  }
  c.then = (ok, err) =>
    Promise.resolve({ data: [{ id: uuid(3) }, { id: uuid(1) }], error: null }).then(ok, err);
  const supabase = { from: () => c };

  const rows = await fetchJobRowsByIds(supabase, [uuid(1), uuid(2), uuid(3)], {
    dateFrom: '2026-10-01T00:00:00.000Z',
    dateTo: '2026-10-10T23:59:59.999Z',
    dateField: 'CREATED_AT',
  });
  assert.deepEqual(rows.map((r) => r.id), [uuid(1), uuid(3)]);
  assert.ok(calls.some(([m]) => m === 'gte' || m === 'or'), 'date range applied');
  assert.ok(calls.some(([m, col]) => m === 'is' && col === 'deleted_at'));
}

// chunkOutcome: a finished batch (done / error) resends only jobs it never finished;
// a cut-off stream resends nothing, since the server may still be running them.
{
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(
    chunkOutcome({ ids, settledIds: new Set(['a']), done: { unprocessedIds: ['b', 'c'] } }),
    { requeueIds: ['b', 'c'] }
  );
  assert.deepEqual(chunkOutcome({ ids, settledIds: new Set(ids), done: {} }), { requeueIds: [] });
  assert.deepEqual(chunkOutcome({ ids, settledIds: new Set(['a']), error: 'SAP down' }), { requeueIds: ['b', 'c'] });
  assert.deepEqual(chunkOutcome({ ids, settledIds: new Set(['a']) }), { cutOff: true });
}

// readSseEvents handles events split across reads and skips junk lines.
{
  const parts = ['data: {"type":"start"}\n\ndata: {"ty', 'pe":"done","synced":2}\n\ndata: nope\n\n'];
  const encoder = new TextEncoder();
  const response = {
    body: {
      getReader() {
        let i = 0;
        return {
          read: async () =>
            i < parts.length ? { done: false, value: encoder.encode(parts[i++]) } : { done: true },
        };
      },
    },
  };
  const events = [];
  await readSseEvents(response, (e) => events.push(e));
  assert.deepEqual(events, [{ type: 'start' }, { type: 'done', synced: 2 }]);
}

// runBatchSync starts no job once startBy has passed; unstarted jobs come back in order.
{
  const originalRequest = sapService._makeRequestOnce;
  const realNow = Date.now;
  let clock = 1_000;
  Date.now = () => clock;
  sapService._makeRequestOnce = async () => SAP_STATUSES;
  const started = [];
  const supabase = fakeJobsSupabase((jobId) => {
    started.push(jobId);
    clock += 100; // every job outlasts the budget
    return jobNotFound();
  });
  const jobs = [1, 2, 3, 4].map((n) => ({ id: uuid(n), job_number: `J${n}` }));
  try {
    const results = await runBatchSync({ supabase, sessionCookies: cookies, jobs, startBy: 1_050 });
    assert.deepEqual(started, [uuid(1)]);
    assert.deepEqual(results.unprocessedIds, [uuid(2), uuid(3), uuid(4)]);
    assert.equal(results.failed, 1);

    // Without startBy (cron, single-request sync) every job runs.
    started.length = 0;
    const all = await runBatchSync({ supabase, sessionCookies: cookies, jobs });
    assert.equal(started.length, 4);
    assert.deepEqual(all.unprocessedIds, []);
  } finally {
    Date.now = realNow;
    sapService._makeRequestOnce = originalRequest;
  }
}

// A job that throws is recorded as failed and the batch carries on; logs carry job_id.
{
  const originalRequest = sapService._makeRequestOnce;
  sapService._makeRequestOnce = async () => SAP_STATUSES;
  const supabase = fakeJobsSupabase((jobId) =>
    jobId === uuid(1) ? Promise.reject(new Error('db exploded')) : jobNotFound()
  );
  const logs = [];
  try {
    const jobs = [1, 2, 3].map((n) => ({ id: uuid(n), job_number: `J${n}` }));
    const results = await runBatchSync({ supabase, sessionCookies: cookies, jobs, onLog: (e) => logs.push(e) });
    assert.equal(results.failed, 3);
    assert.deepEqual(Object.fromEntries(results.errors.map((e) => [e.jobId, e.error])), {
      [uuid(1)]: 'db exploded',
      [uuid(2)]: 'Job not found',
      [uuid(3)]: 'Job not found',
    });
    assert.equal(logs.find((e) => e.status === 'error' && e.job_id === uuid(1))?.error, 'db exploded');
    assert.ok(logs.some((e) => e.status === 'running' && e.job_id === uuid(2)));
  } finally {
    sapService._makeRequestOnce = originalRequest;
  }
}

console.log('syncJobsBatch tests passed');
