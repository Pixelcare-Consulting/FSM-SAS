#!/usr/bin/env node
/**
 * Trigger deployed job sync cron endpoint (use with OS Task Scheduler, GitHub Actions, cron-job.org, etc.).
 *
 * Env:
 *   CRON_SECRET — required
 *   JOB_SYNC_CRON_BASE_URL or NEXT_PUBLIC_APP_URL — production app URL
 *
 * Example:
 *   node scripts/run-hourly-job-sync-cron.mjs
 *   node scripts/run-hourly-job-sync-cron.mjs --limit=100
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function parseArgs(argv) {
  const out = {
    limit: '',
    baseUrl: String(
      process.env.JOB_SYNC_CRON_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        'http://127.0.0.1:4000'
    ).trim(),
  };
  for (const arg of argv) {
    if (!arg || arg === '--') continue;
    if (arg.startsWith('--limit=')) out.limit = String(arg.slice('--limit='.length)).trim();
    else if (arg.startsWith('--base-url=')) out.baseUrl = String(arg.slice('--base-url='.length)).trim();
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  if (!cronSecret) {
    console.error('CRON_SECRET is required.');
    process.exit(1);
  }

  const base = args.baseUrl.replace(/\/+$/, '');
  const limitQuery = args.limit ? `&limit=${encodeURIComponent(args.limit)}` : '';
  const url = `${base}/api/cron/sync-jobs-to-sap?secret=${encodeURIComponent(cronSecret)}${limitQuery}`;
  const startedAt = Date.now();

  console.log(`Running job sync cron via ${base}/api/cron/sync-jobs-to-sap`);

  const response = await fetch(url, { method: 'GET' });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(`Sync failed (${response.status}): ${payload?.error || 'Unknown error'}`);
    if (payload) console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  const elapsedMs = Date.now() - startedAt;
  console.log('Cron completed.');
  console.log(JSON.stringify({ elapsedMs, ...payload }, null, 2));

  if (payload?.skipped) {
    console.log(`Skipped: ${payload.reason || 'outside_sync_window'}`);
  }
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
