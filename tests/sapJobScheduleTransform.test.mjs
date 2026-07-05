import assert from 'node:assert/strict';
import {
  dateToSapScheduleIso,
  timeToSapHhmm,
  pickPrimaryScheduleRow,
} from '../lib/utils/sapJobScheduleTransform.js';

assert.equal(dateToSapScheduleIso('2026-05-06'), '2026-05-06T00:00:00Z');
assert.equal(timeToSapHhmm('08:30:00'), '0830');
assert.equal(timeToSapHhmm('1800'), '1800');

const row = pickPrimaryScheduleRow([
  { jsdate: '2026-05-10' },
  { jsdate: '2026-05-06' },
]);
assert.equal(row.jsdate, '2026-05-06');

console.log('sapJobScheduleTransform.test.mjs: ok');
