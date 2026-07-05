import assert from 'node:assert/strict';

import { resolveJobIdsForGlobalSearch } from '../lib/jobs/jobListSearch.js';

function makeQueryChain(resultPromise, { onOr } = {}) {
  const chain = {
    select() {
      return chain;
    },
    is() {
      return chain;
    },
    in() {
      return chain;
    },
    or(arg) {
      onOr?.(arg);
      return chain;
    },
    limit() {
      return resultPromise;
    },
    then(onFulfilled, onRejected) {
      return resultPromise.then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return resultPromise.catch(onRejected);
    },
  };
  return chain;
}

function createMockSupabase(handlers = {}) {
  const defaults = {
    jobs: () => ({ data: [], error: null }),
    customer: () => ({ data: [], error: null }),
    locations: () => ({ data: [], error: null }),
    job_schedule: () => ({ data: [], error: null }),
    technicians: () => ({ data: [], error: null }),
    technician_jobs: () => ({ data: [], error: null }),
  };

  return {
    from(table) {
      const handler = handlers[table] || defaults[table];
      if (!handler) {
        throw new Error(`Unexpected table: ${table}`);
      }
      return handler();
    },
  };
}

// Empty search returns null (no ID filter).
const emptyResult = await resolveJobIdsForGlobalSearch(createMockSupabase(), '   ');
assert.equal(emptyResult, null, 'empty search returns null');

// Direct job column match.
const directSupabase = createMockSupabase({
  jobs: () =>
    makeQueryChain(Promise.resolve({ data: [{ id: 'job-1' }], error: null }), {
      onOr: (arg) => {
        assert.match(arg, /job_number\.ilike\.%acme%/);
      },
    }),
  customer: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  locations: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  job_schedule: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  technicians: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  technician_jobs: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
});

const directIds = await resolveJobIdsForGlobalSearch(directSupabase, 'ACME');
assert.deepEqual(directIds, ['job-1'], 'direct job column match returns job id');

// Customer name/code resolves to job IDs.
const customerSupabase = createMockSupabase({
  jobs: () => {
    let hasCustomerFilter = false;
    const chain = {
      select() {
        return chain;
      },
      is() {
        return chain;
      },
      in() {
        hasCustomerFilter = true;
        return chain;
      },
      or() {
        return chain;
      },
      limit() {
        return Promise.resolve({
          data: hasCustomerFilter
            ? [{ id: 'job-cust-1' }, { id: 'job-cust-2' }]
            : [],
          error: null,
        });
      },
      then(onFulfilled, onRejected) {
        return this.limit().then(onFulfilled, onRejected);
      },
      catch(onRejected) {
        return this.limit().catch(onRejected);
      },
    };
    return chain;
  },
  customer: () =>
    makeQueryChain(Promise.resolve({ data: [{ id: 'cust-99' }], error: null }), {
      onOr: (arg) => {
        assert.match(arg, /customer_name\.ilike\.%bae%/);
        assert.match(arg, /customer_code\.ilike\.%bae%/);
      },
    }),
  locations: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  job_schedule: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  technicians: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  technician_jobs: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
});

const customerIds = await resolveJobIdsForGlobalSearch(customerSupabase, 'BAE');
assert.deepEqual(
  customerIds.sort(),
  ['job-cust-1', 'job-cust-2'].sort(),
  'customer lookup resolves to job ids'
);

// Multi-token AND: each token must appear in OR clause (chained .or calls).
const multiTokenOrCalls = [];
const multiTokenSupabase = createMockSupabase({
  jobs: () =>
    makeQueryChain(Promise.resolve({ data: [{ id: 'job-multi' }], error: null }), {
      onOr: (arg) => multiTokenOrCalls.push(arg),
    }),
  customer: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  locations: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  job_schedule: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  technicians: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  technician_jobs: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
});

const multiIds = await resolveJobIdsForGlobalSearch(multiTokenSupabase, 'BAE GO HEE');
assert.deepEqual(multiIds, ['job-multi'], 'multi-token search returns matching job id');
assert.equal(multiTokenOrCalls.length, 3, 'applies one OR clause per token on jobs direct lookup');
assert.match(multiTokenOrCalls[0], /%bae%/);
assert.match(multiTokenOrCalls[1], /%go%/);
assert.match(multiTokenOrCalls[2], /%hee%/);

// Empty union returns [].
const noMatchSupabase = createMockSupabase({
  jobs: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  customer: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  locations: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  job_schedule: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  technicians: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  technician_jobs: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
});

const noMatch = await resolveJobIdsForGlobalSearch(noMatchSupabase, 'nomatch');
assert.deepEqual(noMatch, [], 'empty union returns []');

// Union across sources deduplicates job IDs.
const unionSupabase = createMockSupabase({
  jobs: () =>
    makeQueryChain(Promise.resolve({ data: [{ id: 'job-shared' }], error: null })),
  customer: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  locations: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  job_schedule: () =>
    makeQueryChain(Promise.resolve({ data: [{ job_id: 'job-shared' }, { job_id: 'job-sched' }], error: null })),
  technicians: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
  technician_jobs: () => makeQueryChain(Promise.resolve({ data: [], error: null })),
});

const unionIds = await resolveJobIdsForGlobalSearch(unionSupabase, 'site');
assert.deepEqual(unionIds.sort(), ['job-sched', 'job-shared'].sort(), 'union deduplicates across sources');

console.log('jobListSearch tests passed');
