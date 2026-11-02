import assert from 'node:assert/strict';

import { fetchJobRowsByIds, MAX_SYNC_CHUNK_SIZE, parseJobIds } from '../lib/jobs/syncJobsQuery.js';
import { chunkArray, readSseEvents, SYNC_CHUNK_SIZE } from '../lib/jobs/syncSapChunks.js';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

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

// chunkArray splits into fixed-size batches.
{
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkArray([], 2), []);
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

console.log('syncJobsBatch tests passed');
