import assert from 'node:assert/strict';

import { buildJobStatusesList } from '../lib/jobs/buildJobStatusesList.js';
import {
  applyJobStatusFilter,
  getJobStatusFilterDbValues,
} from '../lib/jobs/jobStatusFilter.js';
import { buildSapStatusIndex, resolveLegacyStatusToSapId } from '../lib/jobs/resolveLegacyJobStatusToSap.js';
import { getDefaultJobStatuses, getJobStatusLabelFromList } from '../utils/jobStatusDefaults.js';

const sapStatuses = [
  { value: '554', name: 'Unconfirmed' },
  { value: '555', name: 'Confirmed' },
  { value: '-5', name: 'Cancelled' },
];

const sapWithJobDone = [
  { value: '554', name: 'Unconfirmed' },
  { value: '-5', name: 'Worker on the Way' },
  { value: '-1', name: 'Job Done' },
];

const mergedWithExtras = buildJobStatusesList({
  sapRows: sapWithJobDone,
});
assert.equal(mergedWithExtras[0]?.value, 'CREATED', 'prepends Created extra');
assert.equal(mergedWithExtras[1]?.value, 'IN_PROGRESS', 'prepends In Progress extra');
assert.ok(
  mergedWithExtras.some((row) => String(row.value) === '-1'),
  'SAP Job Done remains in the list'
);
assert.equal(
  mergedWithExtras.some((row) => String(row.value).toUpperCase() === 'COMPLETED'),
  false,
  'does not add Completed extra'
);
assert.equal(
  mergedWithExtras.some((row) => String(row.value).toUpperCase() === 'SCHEDULED'),
  false,
  'does not add Scheduled extra'
);

assert.equal(
  getJobStatusLabelFromList('COMPLETED', mergedWithExtras),
  'Job Done',
  'legacy COMPLETED displays as Job Done'
);
assert.equal(
  getJobStatusLabelFromList('CREATED', mergedWithExtras),
  'Created',
  'CREATED displays as Created extra, not Unconfirmed'
);

const createdFilter = getJobStatusFilterDbValues('CREATED', mergedWithExtras);
assert.ok(createdFilter.includes('CREATED'), 'Created filter includes CREATED');
assert.ok(createdFilter.includes('554'), 'Created filter also matches old 554 rows');

const inProgressFilter = getJobStatusFilterDbValues('IN_PROGRESS', mergedWithExtras);
assert.ok(inProgressFilter.includes('IN_PROGRESS'), 'In Progress filter includes IN_PROGRESS');
assert.ok(inProgressFilter.includes('-5'), 'In Progress filter also matches -5');

const jobDoneFilter = getJobStatusFilterDbValues('-1', mergedWithExtras);
assert.ok(jobDoneFilter.includes('-1'), 'Job Done filter includes -1');
assert.ok(jobDoneFilter.includes('COMPLETED'), 'Job Done filter also matches legacy COMPLETED');

const sapIndex = buildSapStatusIndex([
  { U_JobStatusID: '554', U_JobStatus: 'Unconfirmed' },
  { U_JobStatusID: '-5', U_JobStatus: 'Worker on the Way' },
  { U_JobStatusID: '-1', U_JobStatus: 'Job Done' },
]);
const createdResolved = resolveLegacyStatusToSapId('CREATED', sapIndex);
assert.equal(createdResolved.kind, 'matched');
assert.equal(createdResolved.id, '554', 'CREATED syncs as Unconfirmed 554');
const inProgressResolved = resolveLegacyStatusToSapId('IN_PROGRESS', sapIndex);
assert.equal(inProgressResolved.kind, 'matched');
assert.equal(inProgressResolved.id, '-5', 'IN_PROGRESS syncs as Worker on the Way -5');
const completedResolved = resolveLegacyStatusToSapId('COMPLETED', sapIndex);
assert.equal(completedResolved.kind, 'matched');
assert.equal(completedResolved.id, '-1', 'COMPLETED syncs as Job Done -1');

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
assert.ok(
  settingsMergedList.some((row) => String(row.value) === 'CREATED'),
  'merged list prepends Created extra'
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
