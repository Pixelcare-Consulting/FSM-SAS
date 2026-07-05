#!/usr/bin/env node
/**
 * Live SAP Service Layer lookup (Customers C, then Leads L) → upsert Supabase masterlist.
 *
 *   node scripts/sync-sap-names-to-masterlist.mjs --name="TAN SOCK TING"
 *   node scripts/sync-sap-names-to-masterlist.mjs --from-audit=logs/aifm/aifm-jobs-....jsonl
 *   node scripts/sync-sap-names-to-masterlist.mjs --from-audit=logs/aifm/....jsonl --dry-run
 */

import fs from 'node:fs';
import readline from 'node:readline';

try {
  const { createRequire } = await import('module');
  createRequire(import.meta.url)('dotenv').config({ path: '.env.local' });
} catch {
  // optional
}

import {
  loginSessionCookiesFromEnvironment,
  unwrapSapEnvironmentLogin,
} from '../lib/services/sapService.js';
import { accountDisplayNamesForSapLookup } from '../lib/integrations/aifmCustomerSapResolver.js';
import { resolveSapCardCodeForNameVariants } from '../lib/integrations/aifmCustomerSapResolver.js';
import { syncSapHitsToMasterlist } from '../lib/integrations/aifmSapMasterlistSync.js';

function parseArgs(argv) {
  const out = { names: [], fromAudit: null, dryRun: false };
  for (const a of argv) {
    if (a.startsWith('--name=')) {
      out.names.push(...a.slice(7).split('|').map((s) => s.trim()).filter(Boolean));
    }
    if (a.startsWith('--from-audit=')) out.fromAudit = a.slice(13).trim();
    if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function loadNamesFromAuditJsonl(filePath) {
  const names = new Set();
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, 'utf8'),
    crlfDelay: true,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.type === 'meta') continue;
    const n = row.accountName || row.account_name;
    if (n) names.add(String(n).trim());
  }
  return [...names];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let names = [...args.names];
  if (args.fromAudit) {
    names.push(...(await loadNamesFromAuditJsonl(args.fromAudit)));
  }
  names = [...new Set(names.filter(Boolean))];
  if (!names.length) {
    console.error('Usage: --name="TAN SOCK TING" or --from-audit=logs/aifm/....jsonl');
    process.exit(1);
  }

  const sapLogin = await loginSessionCookiesFromEnvironment();
  const sessionCookies = unwrapSapEnvironmentLogin(sapLogin);
  if (!sessionCookies) {
    console.error('SAP login failed:', sapLogin?.error || 'no cookies');
    process.exit(1);
  }

  const hits = [];
  for (const name of names) {
    const variants = accountDisplayNamesForSapLookup(name);
    const sap = await resolveSapCardCodeForNameVariants(variants, sessionCookies);
    console.log(
      sap.cardCode
        ? `✓ ${name} → ${sap.cardType} ${sap.cardCode} (${sap.matchType})`
        : `✗ ${name} — no SAP match`
    );
    if (sap.cardCode) {
      hits.push({
        cardCode: sap.cardCode,
        cardName: sap.cardName || name,
        cardType: sap.cardType,
      });
    }
  }

  if (!hits.length) {
    console.log('No SAP hits to sync.');
    process.exit(0);
  }

  if (args.dryRun) {
    console.log('\nDry run — would sync:', hits);
    process.exit(0);
  }

  const summary = await syncSapHitsToMasterlist(hits, { sessionCookies });
  console.log('\nMasterlist sync:', JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
