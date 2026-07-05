#!/usr/bin/env node
/**
 * Regression check: AIFM jobs 235912 / 235797 → customer display name + appointment window.
 *
 *   node scripts/test-aifm-tan-job-mapping.mjs
 *   node scripts/test-aifm-tan-job-mapping.mjs --live   # also probe AIFM API (needs AIFM_API_TOKEN)
 */

try {
  const { createRequire } = await import('module');
  createRequire(import.meta.url)('dotenv').config({ path: '.env.local' });
} catch {
  // optional
}

import {
  aifmCustomerNameForImport,
  customerLookupKeyFromAifmJob,
  formatAifmPersonNameLastFirst,
} from '../lib/utils/aifmJobCustomerName.js';
import {
  parseAifmDateTime,
  computeAifmWorkEndIso,
  parseAifmEstimatedDurationMinutes,
  aifmDurationDecimalHours,
} from '../lib/utils/aifmJobScheduleTimes.js';
import { enrichAifmJobsWithCustomerDirectory } from '../lib/integrations/aifmCustomerAccountEnrichment.js';
import { buildAifmCustomerDirectoryMap } from '../lib/integrations/aifmApiClient.js';
import { resolveAifmAccountFromDirectory } from '../lib/integrations/aifmCustomerSapResolver.js';

const FIXTURES = [
  {
    label: 'AIFM 235912 → FSM 2026-001071',
    aifmId: 235912,
    fsmJobNumber: '2026-001071',
    job: {
      id: 235912,
      id_customer: 46817,
      customer_name: 'TAN',
      customer_firstName: 'SOCK TING',
      customer_lastName: 'TAN',
      job_start_date: '2026-05-18',
      job_start_time: '15:00',
      job_end_date: '2026-05-18',
      job_end_time: '17:00',
      estimated_duration_hrs: 1,
      estimated_duration_minutes: 0,
    },
    expectName: 'TAN SOCK TING',
    expectAppointmentHours: 2,
    directoryCustomer: {
      id: 46817,
      customer_name: 'TAN SOCK TING',
      first_name: 'SOCK TING',
      last_name: 'TAN',
    },
  },
  {
    label: 'AIFM 235797 → FSM 2026-001138',
    aifmId: 235797,
    fsmJobNumber: '2026-001138',
    job: {
      id: 235797,
      id_customer: 46814,
      customer_name: 'TAN',
      customer_firstName: 'PENG FUI',
      customer_lastName: 'TAN',
      job_start_date: '2026-05-18',
      job_start_time: '16:00',
      job_end_date: '2026-05-18',
      job_end_time: '18:00',
      estimated_duration_hrs: 1,
      estimated_duration_minutes: 0,
    },
    expectName: 'TAN PENG FUI',
    expectAppointmentHours: 2,
    directoryCustomer: {
      id: 46814,
      customer_name: 'TAN PENG FUI',
      first_name: 'PENG FUI',
      last_name: 'TAN',
    },
  },
];

function hoursBetween(startIso, endIso) {
  return (new Date(endIso) - new Date(startIso)) / (60 * 60 * 1000);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let passed = 0;
let failed = 0;

function runCase(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

console.log('\n── Fixture mapping (offline) ──\n');

for (const fx of FIXTURES) {
  runCase(`${fx.label} — composed name`, () => {
    const composed = formatAifmPersonNameLastFirst(
      fx.job.customer_firstName,
      fx.job.customer_lastName
    );
    assert(composed === fx.expectName, `composed: got "${composed}"`);
  });

  runCase(`${fx.label} — import display name`, () => {
    const name = aifmCustomerNameForImport(fx.job);
    assert(name === fx.expectName, `import name: got "${name}"`);
  });

  runCase(`${fx.label} — lookup key`, () => {
    const key = customerLookupKeyFromAifmJob(fx.job);
    assert(key === fx.expectName, `lookup key: got "${key}"`);
  });

  runCase(`${fx.label} — appointment window (not duration)`, () => {
    const start = parseAifmDateTime(fx.job.job_start_date, fx.job.job_start_time);
    const end = computeAifmWorkEndIso(fx.job);
    const hrs = hoursBetween(start, end);
    assert(
      Math.abs(hrs - fx.expectAppointmentHours) < 0.02,
      `window ${hrs}h, expected ${fx.expectAppointmentHours}h (dur=${aifmDurationDecimalHours(fx.job)}h)`
    );
    const durMin = parseAifmEstimatedDurationMinutes(fx.job);
    assert(durMin === 60, `duration should stay 60min for job_schedule.dur, got ${durMin}`);
  });

  runCase(`${fx.label} — customer directory enrichment`, () => {
    const { jobs } = enrichAifmJobsWithCustomerDirectory([{ ...fx.job }], [fx.directoryCustomer]);
    const name = aifmCustomerNameForImport(jobs[0]);
    assert(name === fx.expectName, `after directory: got "${name}"`);
  });

  runCase(`${fx.label} — audit resolver account (not job contact)`, () => {
    const dirMap = buildAifmCustomerDirectoryMap([fx.directoryCustomer]);
    const { accountName } = resolveAifmAccountFromDirectory(fx.job, dirMap);
    assert(accountName === fx.expectName, `audit account: got "${accountName}"`);
  });
}

if (process.argv.includes('--live')) {
  console.log('\n── Live AIFM API (optional) ──\n');
  const token = String(process.env.AIFM_API_TOKEN || '').trim().replace(/^["']|["']$/g, '');
  if (!token) {
    console.log('  ⚠ skip: no AIFM_API_TOKEN');
  } else {
    const { authorizeAifmBearer, fetchAifmCustomersDirectory } = await import(
      '../lib/integrations/aifmApiClient.js'
    );
    const base = process.env.AIFM_BASE_URL;
    const auth = await authorizeAifmBearer(base, token);
    if (!auth) {
      console.log('  ✗ authorize failed');
      failed++;
    } else {
      const start = '2026-05-01';
      const end = '2026-05-31';
      const body = {
        api_token: auth.bearer,
        start_date: start,
        end_date: end,
        page: 1,
        per_page: 50,
      };
      const res = await fetch(`${auth.base}/api/v1/jobs`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      const jobs = json.data || [];
      const directory = await fetchAifmCustomersDirectory(auth.base, auth.bearer);

      for (const fx of FIXTURES) {
        runCase(`live AIFM job ${fx.aifmId}`, () => {
          const row = jobs.find((j) => Number(j.id) === Number(fx.aifmId));
          assert(row, `job ${fx.aifmId} not in first page — widen dates or paginate`);
          const { jobs: enriched } = enrichAifmJobsWithCustomerDirectory([row], directory);
          const name = aifmCustomerNameForImport(enriched[0]);
          assert(name === fx.expectName, `live name: got "${name}"`);
          if (row.job_end_date) {
            const hrs = hoursBetween(
              parseAifmDateTime(row.job_start_date, row.job_start_time),
              computeAifmWorkEndIso(row)
            );
            console.log(
              `    slot ${row.job_start_time}–${row.job_end_time} → ${hrs.toFixed(1)}h stored window`
            );
          }
        });
      }
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
