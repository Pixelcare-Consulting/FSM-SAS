#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function parseArgs(argv) {
  const out = {
    customerCode: '',
    baseUrl: String(process.env.SYNC_DELTA_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:4000').trim(),
  };
  for (const arg of argv) {
    if (!arg || arg === '--') continue;
    if (arg.startsWith('--customer-code=')) out.customerCode = String(arg.slice('--customer-code='.length)).trim().toUpperCase();
    else if (arg.startsWith('--base-url=')) out.baseUrl = String(arg.slice('--base-url='.length)).trim();
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cronSecret = String(process.env.SYNC_DELTA_CRON_SECRET || '').trim();
  if (!cronSecret) {
    console.error('SYNC_DELTA_CRON_SECRET is required for scheduled sync.');
    process.exit(1);
  }

  const url = `${args.baseUrl.replace(/\/+$/, '')}/api/customers/sync-delta`;
  const body = args.customerCode ? { customerCode: args.customerCode } : {};
  const startedAt = Date.now();

  console.log(`Running hourly customer delta sync via ${url}`);
  if (args.customerCode) console.log(`Targeted customer code: ${args.customerCode}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-delta-secret': cronSecret,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    console.error(`Sync failed (${response.status}): ${payload?.error || 'Unknown error'}`);
    if (payload?.summary) console.error(JSON.stringify(payload.summary, null, 2));
    process.exit(1);
  }

  const elapsedMs = Date.now() - startedAt;
  console.log('Sync completed successfully.');
  console.log(JSON.stringify({ elapsedMs, summary: payload.summary || null }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
