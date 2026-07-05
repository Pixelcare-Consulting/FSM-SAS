/**
 * Singapore datetime helpers
 * Run: node tests/test-singapore-datetime.js
 */

import {
  APP_TIMEZONE,
  buildSingaporeDateTimeFromForm,
  buildSingaporeDateTimeUtc,
  formatSingaporeDate,
  formatSingaporeDateRange,
  formatSingaporeScheduledRange,
  formatSingaporeTime,
  parseSingaporeTimeHm,
  toSingaporeTimeHm,
  toSingaporeYmd,
} from '../lib/utils/singaporeDateTime.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

function assertEquals(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

const UTC_SAMPLE = '2026-06-10T08:54:00.000Z';
const UTC_SAMPLE_END = '2026-06-10T09:54:00.000Z';

test('APP_TIMEZONE is Asia/Singapore', () => {
  assertEquals(APP_TIMEZONE, 'Asia/Singapore');
});

test('formatSingaporeTime — UTC 08:54 → SG 16:54 (24h)', () => {
  assertEquals(formatSingaporeTime(UTC_SAMPLE, { hour12: false }), '16:54');
});

test('formatSingaporeTime — UTC 08:54 → SG 4:54 PM (12h)', () => {
  assertEquals(formatSingaporeTime(UTC_SAMPLE, { hour12: true }), '4:54 PM');
});

test('formatSingaporeDate — DD/MM/YYYY in Singapore', () => {
  assertEquals(formatSingaporeDate(UTC_SAMPLE), '10/06/2026');
});

test('formatSingaporeDateRange — same-day PDF range (24h)', () => {
  assertEquals(
    formatSingaporeDateRange(UTC_SAMPLE, UTC_SAMPLE_END),
    '10/06/2026 16:54-17:54'
  );
});

test('formatSingaporeDateRange — same-day PDF range (12h)', () => {
  assertEquals(
    formatSingaporeDateRange(UTC_SAMPLE, UTC_SAMPLE_END, { hour12: true }),
    '10/06/2026 4:54 PM-5:54 PM'
  );
});

test('formatSingaporeScheduledRange — email/UI card format', () => {
  assertEquals(
    formatSingaporeScheduledRange(UTC_SAMPLE, UTC_SAMPLE_END),
    'Jun 10, 2026 4:54 PM – 5:54 PM'
  );
});

test('toSingaporeYmd — calendar date in Singapore', () => {
  assertEquals(toSingaporeYmd(UTC_SAMPLE), '2026-06-10');
});

test('toSingaporeTimeHm — wall clock in Singapore', () => {
  assertEquals(toSingaporeTimeHm(UTC_SAMPLE), '16:54');
});

test('parseSingaporeTimeHm — HH:MM and HH:MM:SS', () => {
  assertEquals(JSON.stringify(parseSingaporeTimeHm('16:54')), '{"hour":16,"minute":54}');
  assertEquals(JSON.stringify(parseSingaporeTimeHm('09:05:00')), '{"hour":9,"minute":5}');
});

test('buildSingaporeDateTimeFromForm — round-trip 10:00 SG', () => {
  const built = buildSingaporeDateTimeFromForm('2026-06-10', '10:00');
  assertEquals(built.toISOString(), '2026-06-10T02:00:00.000Z');
  assertEquals(formatSingaporeTime(built.toISOString(), { hour12: false }), '10:00');
});

test('buildSingaporeDateTimeUtc — matches form builder', () => {
  const direct = buildSingaporeDateTimeUtc('2026-06-10', 16, 54);
  const fromForm = buildSingaporeDateTimeFromForm('2026-06-10', '16:54');
  assertEquals(direct.toISOString(), fromForm.toISOString());
  assertEquals(direct.toISOString(), UTC_SAMPLE);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
