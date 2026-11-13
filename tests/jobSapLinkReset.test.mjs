import assert from 'node:assert/strict';

import {
  planJobSapLinkReset,
  applyJobSapLinkReset,
  SAP_LINK_RESET_OUTCOME,
  SAP_LINK_RESET_ERROR,
} from '../lib/services/jobSapLinkReset.js';
import { isSapActivityMissingError } from '../lib/utils/sapActivityMissing.js';

const MISSING =
  'SAP API Error: 404 Not Found - {\n   "error" : {\n      "code" : -2028,\n      "message" : {\n         "lang" : "en-us",\n         "value" : "Entity with value(41023) does not exist"\n      }\n   }\n}\n';

const baseJob = {
  id: 'job-1',
  job_number: '2026-010561',
  sap_activity_id: '41023',
  last_synced_at: '2026-11-12T15:37:20.707+08:00',
  service_call: { call_number: '20939' },
};

/** Minimal Supabase fake for the jobs table: load by id, find holders, guarded update. */
function fakeSupabase({ job = baseJob, holders = [], updateMatches = true } = {}) {
  const updates = [];
  const supabase = {
    updates,
    from(table) {
      assert.equal(table, 'jobs');
      const filters = {};
      let patch = null;
      const chain = {
        select() { return chain; },
        update(values) { patch = values; return chain; },
        eq(col, val) { filters[col] = val; return chain; },
        neq(col, val) { filters[`not_${col}`] = val; return chain; },
        is() { return chain; },
        limit: async () => ({ data: holders, error: null }),
        maybeSingle: async () => ({ data: job, error: null }),
        then(resolve) {
          // Awaited update(...).eq(...).select(): record and report matched rows.
          updates.push({ patch, filters: { ...filters } });
          resolve({ data: updateMatches ? [{ id: filters.id }] : [], error: null });
        },
      };
      return chain;
    },
  };
  return supabase;
}

function fakeSap({ exists = false, getError = null, candidates = [], searchError = null } = {}) {
  const calls = [];
  return {
    calls,
    async makeRequest(endpoint) {
      calls.push(endpoint);
      if (getError) throw new Error(getError);
      if (!exists) throw new Error(MISSING);
      return { ActivityCode: 41023 };
    },
    async getActivities(options) {
      calls.push(options.filter);
      if (searchError) throw new Error(searchError);
      return { value: candidates.map((c) => ({ ActivityCode: c })) };
    },
  };
}

const run = (fn, opts) => fn({ supabase: opts.supabase, sap: opts.sap, sessionCookies: {}, jobId: 'job-1' });

// Error detection
assert.equal(isSapActivityMissingError(MISSING), true);
assert.equal(isSapActivityMissingError('SAP API Error: 400 Bad Request - {"code" : -1000}'), false);
assert.equal(isSapActivityMissingError(null), false);

// Activity gone, none other in SAP: clear the link, keep old values in the plan.
{
  const supabase = fakeSupabase();
  const sap = fakeSap();
  const res = await run(applyJobSapLinkReset, { supabase, sap });
  assert.equal(res.ok, true);
  assert.equal(res.plan.outcome, SAP_LINK_RESET_OUTCOME.CLEAR);
  assert.deepEqual(res.plan.previous, { sap_activity_id: '41023', last_synced_at: baseJob.last_synced_at });
  assert.equal(res.plan.serviceCallNumber, '20939');
  assert.equal(supabase.updates.length, 1);
  assert.deepEqual(supabase.updates[0].patch, { sap_activity_id: null, last_synced_at: null });
  assert.equal(supabase.updates[0].filters.sap_activity_id, '41023', 'update is guarded on the old ID');
  assert.equal(sap.calls[1], "U_API_JobNumber eq '2026-010561'");
}

// Plan only: no write.
{
  const supabase = fakeSupabase();
  const res = await run(planJobSapLinkReset, { supabase, sap: fakeSap() });
  assert.equal(res.ok, true);
  assert.equal(supabase.updates.length, 0);
}

// Activity still exists: refuse, no write.
{
  const supabase = fakeSupabase();
  const res = await run(applyJobSapLinkReset, { supabase, sap: fakeSap({ exists: true }) });
  assert.equal(res.code, SAP_LINK_RESET_ERROR.ACTIVITY_EXISTS);
  assert.equal(supabase.updates.length, 0);
}

// SAP unreachable or other error: refuse, no write.
{
  const supabase = fakeSupabase();
  const res = await run(applyJobSapLinkReset, { supabase, sap: fakeSap({ getError: 'SAP Service Layer request timeout' }) });
  assert.equal(res.code, SAP_LINK_RESET_ERROR.SAP_CHECK_FAILED);
  assert.equal(supabase.updates.length, 0);
}

// SAP already has one activity for this job number: relink to it.
{
  const supabase = fakeSupabase();
  const res = await run(applyJobSapLinkReset, { supabase, sap: fakeSap({ candidates: [45900] }) });
  assert.equal(res.plan.outcome, SAP_LINK_RESET_OUTCOME.RELINK);
  assert.deepEqual(supabase.updates[0].patch, { sap_activity_id: '45900', last_synced_at: null });
}

// That activity is linked to another portal job: refuse.
{
  const supabase = fakeSupabase({ holders: [{ id: 'job-2', job_number: '2026-000001' }] });
  const res = await run(applyJobSapLinkReset, { supabase, sap: fakeSap({ candidates: [45900] }) });
  assert.equal(res.code, SAP_LINK_RESET_ERROR.ACTIVITY_HELD_BY_OTHER_JOB);
  assert.equal(supabase.updates.length, 0);
}

// Several activities for this job number: refuse.
{
  const supabase = fakeSupabase();
  const res = await run(applyJobSapLinkReset, { supabase, sap: fakeSap({ candidates: [1, 2] }) });
  assert.equal(res.code, SAP_LINK_RESET_ERROR.MULTIPLE_ACTIVITIES);
  assert.equal(supabase.updates.length, 0);
}

// Job not linked / not found / non-numeric ID.
assert.equal((await run(planJobSapLinkReset, { supabase: fakeSupabase({ job: { ...baseJob, sap_activity_id: null } }), sap: fakeSap() })).code, SAP_LINK_RESET_ERROR.NOT_LINKED);
assert.equal((await run(planJobSapLinkReset, { supabase: fakeSupabase({ job: null }), sap: fakeSap() })).code, SAP_LINK_RESET_ERROR.JOB_NOT_FOUND);
{
  const sap = fakeSap();
  const res = await run(planJobSapLinkReset, { supabase: fakeSupabase({ job: { ...baseJob, sap_activity_id: '1) or (1' } }), sap });
  assert.equal(res.code, SAP_LINK_RESET_ERROR.INVALID_ACTIVITY_ID);
  assert.equal(sap.calls.length, 0, 'no SAP call with a malformed ID');
}

// Job number with a quote is escaped in the OData filter.
{
  const sap = fakeSap();
  await run(planJobSapLinkReset, { supabase: fakeSupabase({ job: { ...baseJob, job_number: "A'B" } }), sap });
  assert.equal(sap.calls[1], "U_API_JobNumber eq 'A''B'");
}

// Link changed between check and update: report it.
{
  const res = await run(applyJobSapLinkReset, { supabase: fakeSupabase({ updateMatches: false }), sap: fakeSap() });
  assert.equal(res.code, SAP_LINK_RESET_ERROR.LINK_CHANGED);
}

console.log('jobSapLinkReset tests passed');
