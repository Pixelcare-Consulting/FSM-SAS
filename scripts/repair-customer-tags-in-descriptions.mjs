#!/usr/bin/env node
/**
 * Repair polluted [CUSTOMER:L#### …] / [CUSTOMER:C#### …] tags in job descriptions.
 *
 *   node scripts/repair-customer-tags-in-descriptions.mjs --dry-run
 *   node scripts/repair-customer-tags-in-descriptions.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');

const POLLUTED_TAG_RE = /\[CUSTOMER:([LC]\d+)(?:\s+([^\]]+))?\]/g;

function parseArgs(argv) {
  return { dryRun: argv.some((a) => a === '--dry-run' || a === '--dryrun' || a === '-n') };
}

function repairTagValue(rawValue, job) {
  const linked = (job.customer?.customer_name || '').toString().trim();
  if (job.customer_id && linked) return linked;

  const rest = (rawValue || '').trim().replace(/^[LC]\d+\s*/, '').trim();
  return rest || rawValue.trim();
}

function repairDescription(description, job) {
  let changed = false;
  const next = description.replace(POLLUTED_TAG_RE, (full, _code, namePart) => {
    const rawValue = namePart ? `${_code} ${namePart}` : _code;
    const repaired = repairTagValue(rawValue, job);
    if (repaired !== rawValue.trim()) changed = true;
    return `[CUSTOMER:${repaired}]`;
  });
  return { next, changed };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, job_number, description, customer_id, customer:customer_id(customer_code, customer_name)')
    .or('description.ilike.%[CUSTOMER:L%,description.ilike.%[CUSTOMER:C%');

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  const candidates = (jobs || []).filter((j) => POLLUTED_TAG_RE.test(j.description || ''));
  POLLUTED_TAG_RE.lastIndex = 0;

  console.log(`Found ${candidates.length} job(s) with polluted [CUSTOMER:L/C#### …] tags${dryRun ? ' (dry-run)' : ''}`);

  let updated = 0;
  for (const job of candidates) {
    const { next, changed } = repairDescription(job.description || '', job);
    if (!changed) continue;

    console.log(`  ${job.job_number || job.id}: ${job.description?.match(/\[CUSTOMER:[^\]]+\]/)?.[0]} → [CUSTOMER:${repairTagValue(
      job.description?.match(/\[CUSTOMER:([^\]]+)\]/)?.[1] || '',
      job
    )}]`);

    if (!dryRun) {
      const { error: updErr } = await supabase.from('jobs').update({ description: next }).eq('id', job.id);
      if (updErr) {
        console.error(`    ✗ update failed: ${updErr.message}`);
        continue;
      }
    }
    updated++;
  }

  console.log(`${dryRun ? 'Would update' : 'Updated'} ${updated} job(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
