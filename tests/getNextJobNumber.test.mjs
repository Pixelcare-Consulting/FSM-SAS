import assert from 'node:assert/strict';

import {
  getNextJobNumber,
  getNextJobNumbers,
  isDuplicateJobNumberError,
} from '../lib/jobs/getNextJobNumber.js';

function createMockSupabase({ maxJobNumber = null, existing = new Set() } = {}) {
  return {
    from(table) {
      if (table !== 'jobs') throw new Error(`Unexpected table: ${table}`);
      let lookupJobNumber = null;
      const chain = {
        select() {
          return chain;
        },
        gte() {
          return chain;
        },
        lte() {
          return chain;
        },
        is() {
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        eq(_col, jobNumber) {
          lookupJobNumber = jobNumber;
          return chain;
        },
        maybeSingle: async () => {
          if (lookupJobNumber != null) {
            return {
              data: existing.has(lookupJobNumber) ? { id: 'existing' } : null,
              error: null,
            };
          }
          return {
            data: maxJobNumber ? { job_number: maxJobNumber } : null,
            error: null,
          };
        },
      };
      return chain;
    },
  };
}

assert.equal(isDuplicateJobNumberError({ code: '23505' }), true);
assert.equal(
  isDuplicateJobNumberError({ message: 'duplicate key value violates unique constraint "jobs_job_number_key"' }),
  true
);
assert.equal(isDuplicateJobNumberError({ message: 'other' }), false);

{
  const supabase = createMockSupabase({ maxJobNumber: '2026-003274' });
  const next = await getNextJobNumber(supabase, { year: 2026 });
  assert.equal(next, '2026-003275');
}

// Soft-deleted rows still occupy job_number (unique constraint is not limited to deleted_at IS NULL).
// jobNumberExists checks all rows, so a soft-deleted 2026-003275 blocks reuse even when the max
// active job is 2026-003274.
{
  const supabase = createMockSupabase({
    maxJobNumber: '2026-003274',
    existing: new Set(['2026-003275']),
  });
  const next = await getNextJobNumber(supabase, { year: 2026 });
  assert.equal(
    next,
    '2026-003276',
    'soft-deleted job_number must not be reused'
  );
}

{
  const supabase = createMockSupabase({ maxJobNumber: null });
  const next = await getNextJobNumber(supabase, { year: 2026 });
  assert.equal(next, '2026-000001');
}

{
  const supabase = createMockSupabase({ maxJobNumber: '2026-003274' });
  const numbers = await getNextJobNumbers(supabase, 3, { year: 2026 });
  assert.deepEqual(numbers, ['2026-003275', '2026-003276', '2026-003277']);
}

console.log('getNextJobNumber.test.mjs: all tests passed');
