import assert from 'node:assert/strict';

import {
  fetchJobRowsByIds,
  fetchJobsForSapSync,
  getSyncPreview,
  MAX_SYNC_CHUNK_SIZE,
  parseExcludedSyncedJobIds,
  parseJobIds,
} from '../lib/jobs/syncJobsQuery.js';
import {
  chunkOutcome,
  EMPTY_SYNCED_SELECTION,
  isSyncedJobSelected,
  readSseEvents,
  selectAllSyncedInRange,
  setSyncedJobsSelected,
  SYNC_CHUNK_SIZE,
  syncedSelectionCount,
  syncedSelectionPayload,
} from '../lib/jobs/syncSapChunks.js';
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

// Already-in-SAP picker: ticked jobs are sent as-is; "Select all" means every synced job in the
// range (the list only shows 1,000), and unticks after it become exclusions.
{
  let sel = setSyncedJobsSelected(EMPTY_SYNCED_SELECTION, ['a', 'b'], true);
  sel = setSyncedJobsSelected(sel, ['a'], false);
  assert.deepEqual(syncedSelectionPayload(sel), { syncedJobIds: ['b'] });
  assert.equal(syncedSelectionCount(sel, 1377), 1);
  assert.equal(isSyncedJobSelected(sel, 'b'), true);

  sel = selectAllSyncedInRange(true);
  assert.equal(syncedSelectionCount(sel, 1377), 1377);
  assert.equal(isSyncedJobSelected(sel, 'not-in-the-listed-1000'), true);
  sel = setSyncedJobsSelected(sel, ['x', 'y'], false);
  assert.equal(isSyncedJobSelected(sel, 'x'), false);
  assert.equal(syncedSelectionCount(sel, 1377), 1375);
  sel = setSyncedJobsSelected(sel, ['y'], true);
  assert.deepEqual(syncedSelectionPayload(sel), { excludedSyncedJobIds: ['x'] });

  assert.deepEqual(selectAllSyncedInRange(false), EMPTY_SYNCED_SELECTION);
  assert.deepEqual(parseExcludedSyncedJobIds({ excludedSyncedJobIds: [' a ', 'a', '', null] }), ['a']);
  assert.deepEqual(parseExcludedSyncedJobIds({}), []);
}

// Server side of "Select all": every synced job in range minus the unticked ones, past the
// picker's 1,000 (October 2026 had 1,377), and a stale exclusion can't drop another job.
{
  const rows = [
    ...Array.from({ length: 16 }, (_, i) => ({ id: `u${i}`, sap_activity_id: null })),
    ...Array.from({ length: 1377 }, (_, i) => ({ id: `s${i}`, sap_activity_id: String(40000 + i) })),
  ].map((r, i) => ({ ...r, job_number: r.id, created_at: new Date(Date.UTC(2026, 9, 1) + i * 60e3).toISOString(), deleted_at: null }));
  const supabase = {
    from: () => {
      const filters = [];
      let opts = {};
      let range = null;
      const q = {
        select: (_cols, o = {}) => ((opts = o), q),
        is: (col, val) => (filters.push((r) => (val === null ? r[col] == null : r[col] === val)), q),
        not: (col, op, val) => (filters.push((r) => (op === 'is' && val === null ? r[col] != null : true)), q),
        in: (col, vals) => (filters.push((r) => vals.includes(r[col])), q),
        order: () => q,
        range: (a, b) => ((range = [a, b]), q),
        then: (ok, err) => {
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          const data = opts.head ? null : range ? hit.slice(range[0], range[1] + 1) : hit;
          return Promise.resolve({ data, count: opts.count ? hit.length : null, error: null }).then(ok, err);
        },
      };
      return q;
    },
  };

  const excludedSyncedJobIds = ['s5', 's1200', 'deleted-or-out-of-range'];
  const selection = { includeSynced: true, syncedJobIds: null, excludedSyncedJobIds };
  const preview = await getSyncPreview(supabase, null, selection);
  assert.equal(preview.syncedToUpdate, 1375);
  assert.equal(preview.toProcess, 16 + 1375);

  const jobs = await fetchJobsForSapSync(supabase, preview.toProcess, null, selection);
  const ids = new Set(jobs.map((j) => j.id));
  assert.equal(jobs.length, 16 + 1375);
  assert.ok(!ids.has('s5') && !ids.has('s1200'), 'unticked jobs left out');
  assert.ok(ids.has('s0') && ids.has('s1376'), 'oldest and newest synced jobs both included');
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
