import assert from 'node:assert/strict';

import { fetchJobsForPicker, parsePickerRequest, PICKER_LISTS } from '../lib/jobs/syncJobsQuery.js';

/** Records every filter call; resolves with the table's canned result. */
function createMockSupabase({ customers = [], jobs = [], jobsCount = jobs.length } = {}) {
  const calls = { customer: [], jobs: [] };

  function chain(table, result) {
    const log = calls[table];
    const c = {};
    for (const method of ['select', 'is', 'not', 'or', 'gte', 'lte', 'order', 'range', 'limit']) {
      c[method] = (...args) => {
        log.push([method, ...args]);
        return c;
      };
    }
    c.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
    return c;
  }

  return {
    calls,
    from(table) {
      if (table === 'customer') return chain('customer', { data: customers, error: null });
      if (table === 'jobs') return chain('jobs', { data: jobs, count: jobsCount, error: null });
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const orArgs = (log) => log.filter(([m]) => m === 'or').map(([, arg]) => arg);
const jobRow = (id, job_number) => ({
  id,
  job_number,
  title: 'Repair',
  scheduled_start: '2026-09-01T00:52:27Z',
  last_synced_at: null,
  customer: { customer_name: 'SIM FREDDY' },
});

// Search is applied in the jobs query (before the limit), with customer matches folded in.
{
  const supabase = createMockSupabase({
    customers: [{ id: 'cust-1' }, { id: 'cust-2' }],
    jobs: [jobRow('job-1', '2026-009572')],
  });
  const result = await fetchJobsForPicker(
    supabase,
    { dateFrom: '2026-06-01T00:00:00.000Z', dateTo: '2026-10-20T23:59:59.999Z' },
    { synced: true, search: '2026-009572' }
  );

  assert.deepEqual(orArgs(supabase.calls.jobs), [
    'job_number.ilike.%2026-009572%,title.ilike.%2026-009572%,customer_id.in.(cust-1,cust-2)',
  ]);
  assert.ok(
    supabase.calls.jobs.some(([m, col]) => m === 'not' && col === 'sap_activity_id'),
    'synced list keeps the sap_activity_id filter'
  );
  assert.ok(supabase.calls.jobs.some(([m]) => m === 'gte'), 'date range still applied');
  assert.deepEqual(result.jobs.map((j) => j.job_number), ['2026-009572']);
  assert.equal(result.jobs[0].customer_name, 'SIM FREDDY');
  assert.equal(result.truncated, false);
}

// Each word must match (one ANDed .or() per token); no customer clause when no customer matches.
{
  const supabase = createMockSupabase();
  await fetchJobsForPicker(supabase, null, { synced: false, search: 'freddy repair' });
  assert.deepEqual(orArgs(supabase.calls.jobs), [
    'job_number.ilike.%freddy%,title.ilike.%freddy%',
    'job_number.ilike.%repair%,title.ilike.%repair%',
  ]);
  assert.ok(supabase.calls.jobs.some(([m, col]) => m === 'is' && col === 'sap_activity_id'));
}

// PostgREST syntax characters can't break the filter; ilike wildcards are escaped.
{
  const supabase = createMockSupabase();
  await fetchJobsForPicker(supabase, null, { synced: false, search: 'SAS,(M&E) 50%_off' });
  const clauses = orArgs(supabase.calls.jobs);
  assert.equal(clauses.length, 3, 'comma and parentheses split words instead of breaking .or()');
  assert.ok(clauses.every((c) => !/[()]/.test(c.replace(/customer_id\.in\.\([^)]*\)/, ''))));
  assert.ok(clauses[2].includes('50\\%\\_off'), 'ilike wildcards escaped');
}

// No search: no filters added, truncated reflects the exact count.
{
  const supabase = createMockSupabase({ jobs: [jobRow('a', '1'), jobRow('b', '2')], jobsCount: 5286 });
  const result = await fetchJobsForPicker(supabase, null, { synced: true, limit: 2 });
  assert.equal(supabase.calls.customer.length, 0, 'no customer lookup without search');
  assert.deepEqual(orArgs(supabase.calls.jobs), []);
  assert.equal(result.total, 5286);
  assert.equal(result.truncated, true);
}

// parsePickerRequest
assert.equal(parsePickerRequest({ preview: true }), null);
assert.deepEqual(parsePickerRequest({ picker: 'synced', search: 'abc' }), {
  list: PICKER_LISTS.SYNCED,
  search: 'abc',
});
assert.equal(parsePickerRequest({ picker: 'unsynced', search: 'x'.repeat(500) }).search.length, 100);
assert.throws(() => parsePickerRequest({ picker: 'all' }), /picker must be/);

console.log('syncJobsPickerSearch tests passed');
