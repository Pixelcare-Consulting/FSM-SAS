#!/usr/bin/env node
/**
 * Dry-run FSM → SAP job sync: print field mappings and request payloads (no SAP, no DB writes).
 *
 *   node scripts/dry-run-job-sync-to-sap.mjs --job-number=2026-001071
 *   node scripts/dry-run-job-sync-to-sap.mjs --job-id=<uuid>
 *   node scripts/dry-run-job-sync-to-sap.mjs --job-number=2026-001071 --json --out=logs/sync-dry-run.json
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

function parseArgs(argv) {
  const out = { jobId: null, jobNumber: null, json: false, out: null };
  for (const a of argv) {
    if (a.startsWith('--job-id=')) out.jobId = a.slice(9).trim();
    if (a.startsWith('--job-number=')) out.jobNumber = a.slice(13).trim();
    if (a === '--json') out.json = true;
    if (a.startsWith('--out=')) out.out = a.slice(6).trim();
  }
  return out;
}

async function resolveJobId(supabase, { jobId, jobNumber }) {
  if (jobId) return jobId;
  if (!jobNumber) return null;
  const { data, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('job_number', jobNumber)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  if (!args.jobId && !args.jobNumber) {
    console.error('Usage: --job-number=2026-001071  or  --job-id=<uuid>');
    console.error('Optional: --json  --out=logs/my-dry-run.json');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);
  const { previewJobSyncToSAP } = await import('../lib/services/jobSyncSapPlan.js');

  const jobId = await resolveJobId(supabase, args);
  if (!jobId) {
    console.error('Job not found');
    process.exit(1);
  }

  const result = await previewJobSyncToSAP({ jobId, supabase });

  if (!result.success) {
    console.error(result.error);
    process.exit(1);
  }

  if (args.json) {
    const text = JSON.stringify(result.plan, null, 2);
    if (args.out) {
      fs.mkdirSync(path.dirname(args.out), { recursive: true });
      fs.writeFileSync(args.out, text, 'utf8');
      console.log(`Wrote ${args.out}`);
    } else {
      console.log(text);
    }
  } else {
    console.log(result.log);
    if (args.out) {
      fs.mkdirSync(path.dirname(args.out), { recursive: true });
      fs.writeFileSync(args.out, result.log, 'utf8');
      console.log(`\nLog also written to ${args.out}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
