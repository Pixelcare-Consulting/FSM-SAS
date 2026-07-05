import assert from 'node:assert/strict';

import { buildJobStatusesList } from '../lib/jobs/buildJobStatusesList.js';
import {
  applyJobStatusFilter,
  getJobStatusFilterDbValues,
} from '../lib/jobs/jobStatusFilter.js';
import { getDefaultJobStatuses } from '../utils/jobStatusDefaults.js';

const sapStatuses = [
  { value: '554', name: 'Unconfirmed' },
  { value: '555', name: 'Confirmed' },
  { value: '-5', name: 'Cancelled' },
];

// Filter by SAP id must also match legacy UNCONFIRMED rows in jobs.status.
const unconfirmedValues = getJobStatusFilterDbValues('554', sapStatuses);
assert.ok(unconfirmedValues.includes('554'), 'includes SAP id 554');
assert.ok(unconfirmedValues.includes('UNCONFIRMED'), 'includes legacy UNCONFIRMED alias');

// Filter by settings alias must match SAP id rows.
const fromAlias = getJobStatusFilterDbValues('UNCONFIRMED', sapStatuses);
assert.ok(fromAlias.includes('554'), 'UNCONFIRMED filter includes SAP id 554');

// Unknown status falls back to exact value.
assert.deepEqual(getJobStatusFilterDbValues('CUSTOM_X', sapStatuses), ['CUSTOM_X']);

// Settings-only UNCONFIRMED + SAP snapshot + merged defaults resolves filter 554.
const settingsTypes = {
  unconfirmed: { name: 'Unconfirmed', value: 'UNCONFIRMED' },
};
const settingsMergedList = buildJobStatusesList({
  settingsTypes,
  sapRows: [{ value: '554', name: 'Unconfirmed' }],
});
const settingsOnlyResolved = getJobStatusFilterDbValues('554', settingsMergedList);
assert.ok(
  settingsOnlyResolved.includes('UNCONFIRMED'),
  'settings-only UNCONFIRMED + SAP 554 resolves to UNCONFIRMED'
);
assert.ok(
  settingsMergedList.some((row) => String(row.value) === '554'),
  'merged list includes SAP id 554'
);

// applyJobStatusFilter builds multi-value OR for aliases.
let orCalled = false;
let orArg = '';
const mockQuery = {
  ilike() {
    return this;
  },
  or(arg) {
    orCalled = true;
    orArg = arg;
    return this;
  },
};
applyJobStatusFilter(mockQuery, '554', sapStatuses);
assert.equal(orCalled, true, 'uses .or() when multiple DB values match');
assert.match(orArg, /status\.ilike\.554/);
assert.match(orArg, /status\.ilike\.UNCONFIRMED/);

// Negative SAP id (-5 Cancelled) produces valid PostgREST OR clause.
let cancelledOrCalled = false;
let cancelledOrArg = '';
const mockQueryCancelled = {
  ilike() {
    return this;
  },
  or(arg) {
    cancelledOrCalled = true;
    cancelledOrArg = arg;
    return this;
  },
};
const cancelledValues = getJobStatusFilterDbValues('-5', sapStatuses);
assert.ok(cancelledValues.includes('-5'), 'cancelled filter includes SAP id -5');
applyJobStatusFilter(mockQueryCancelled, '-5', sapStatuses);
assert.equal(cancelledOrCalled, true, 'cancelled filter uses .or() when aliases expand');
assert.match(cancelledOrArg, /status\.ilike\.-5/, 'PostgREST OR includes negative status id');

// Merged defaults are always considered for alias expansion.
const defaults = getDefaultJobStatuses();
assert.ok(defaults.length > 0, 'defaults available for merge tests');

console.log('jobStatusFilter tests passed');
