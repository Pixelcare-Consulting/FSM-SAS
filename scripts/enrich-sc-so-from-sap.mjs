#!/usr/bin/env node
/**
 * Enrich Supabase service_call (sql10) and sales_order (sql05) from SAP.
 * Run after backfill-aifm-service-call-so.
 *
 *   node scripts/enrich-sc-so-from-sap.mjs
 *   node scripts/enrich-sc-so-from-sap.mjs --job=2026-001071 --dry-run
 *   node scripts/enrich-sc-so-from-sap.mjs --limit=50
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

function isDryRunFlag(arg) {
  return arg === '--dry-run' || arg === '--dryrun' || arg === '-n';
}

function parseArgs(argv) {
  const out = { job: [], dryRun: false, limit: 0, all: false };
  for (const a of argv) {
    if (isDryRunFlag(a)) out.dryRun = true;
    if (a === '--all') out.all = true;
    if (a.startsWith('--job=')) out.job = a.slice(6).split(',').map((s) => s.trim()).filter(Boolean);
    if (a.startsWith('--limit=')) out.limit = parseInt(a.slice(8), 10) || 0;
  }
  return out;
}

async function loadWorkItems(supabase, { jobNumbers, limit, all }) {
  let q = supabase
    .from('jobs')
    .select(
      `
      id,
      job_number,
      customer_id,
      service_call_id,
      sales_order_id,
      customer:customer_id(id, customer_code),
      service_call:service_call_id(id, call_number),
      sales_order:sales_order_id(id, document_number)
    `
    )
    .is('deleted_at', null);

  if (jobNumbers.length) {
    q = q.in('job_number', jobNumbers);
  } else if (!all) {
    q = q.or('service_call_id.not.is.null,sales_order_id.not.is.null');
  }

  if (limit > 0) q = q.limit(limit);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.dryRun) {
    console.log('DRY RUN — SAP lookups run; Supabase is not updated.\n');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  const {
    resolveSapSessionForScript,
    fetchSapServiceCallsSql10,
    fetchSapSalesOrdersSql05,
    applySql10ToServiceCall,
    applySql05ToSalesOrder,
  } = await import('../lib/integrations/sapScSoEnrichment.js');

  const session = await resolveSapSessionForScript();
  if (!session?.b1session) {
    console.error('SAP login failed — set SAP_B1_* env vars');
    process.exit(1);
  }

  const jobs = await loadWorkItems(supabase, {
    jobNumbers: args.job,
    limit: args.limit,
    all: args.all,
  });

  if (!jobs.length) {
    console.log('No jobs to enrich');
    process.exit(0);
  }

  const stats = {
    jobs: jobs.length,
    scUpdated: 0,
    scNotInSap: 0,
    soUpdated: 0,
    soNotInSap: 0,
    skippedNoCard: 0,
    skippedNoScForSo: 0,
    errors: 0,
  };

  /** @type {Map<string, Map<string, import('../lib/integrations/sapScSoEnrichment.js').mapSql10ServiceCallRow>>} */
  const sql10CacheByCard = new Map();

  for (const job of jobs) {
    const cardCode = job.customer?.customer_code;
    const callNumber = job.service_call?.call_number;
    const docNum = job.sales_order?.document_number;
    const scUuid = job.service_call?.id ?? job.service_call_id;
    const soUuid = job.sales_order?.id ?? job.sales_order_id;

    console.log(`\n${job.job_number} CardCode=${cardCode || '—'} SC=${callNumber || '—'} SO=${docNum || '—'}`);

    if (!cardCode) {
      stats.skippedNoCard++;
      console.log('  skip: no customer_code');
      continue;
    }

    if (scUuid && callNumber) {
      try {
        if (!sql10CacheByCard.has(cardCode)) {
          const rows = await fetchSapServiceCallsSql10(cardCode, session);
          const byId = new Map(rows.map((r) => [r.serviceCallId, r]));
          sql10CacheByCard.set(cardCode, byId);
          console.log(`  sql10: ${rows.length} open service call(s) for ${cardCode}`);
        }

        const byId = sql10CacheByCard.get(cardCode);
        const sapSc = byId?.get(String(callNumber));

        if (!sapSc) {
          stats.scNotInSap++;
          console.log(`  sql10: call ${callNumber} not in SAP open list`);
        } else if (args.dryRun) {
          console.log(`  [dry-run] would update service_call ${callNumber}:`, sapSc);
          stats.scUpdated++;
        } else {
          await applySql10ToServiceCall(supabase, scUuid, sapSc);
          stats.scUpdated++;
          console.log(`  sql10: updated service_call ${callNumber}`);
        }
      } catch (e) {
        stats.errors++;
        console.error(`  sql10 error:`, e.message);
      }
    }

    if (soUuid && docNum) {
      if (!callNumber) {
        stats.skippedNoScForSo++;
        console.log('  sql05 skip: no service call # for ParamList');
        continue;
      }

      try {
        const soRows = await fetchSapSalesOrdersSql05(cardCode, callNumber, session);
        const match = soRows.find((r) => String(r.docNum) === String(docNum));

        if (!match) {
          stats.soNotInSap++;
          if (args.dryRun) {
            console.log(
              `  [dry-run] sql05: DocNum ${docNum} not found (${soRows.length} row(s) returned); would set sap_found=false`
            );
          } else {
            await applySql05ToSalesOrder(supabase, soUuid, null);
            console.log(`  sql05: DocNum ${docNum} not in SAP — marked sap_found=false`);
          }
        } else if (args.dryRun) {
          console.log(`  [dry-run] would update sales_order ${docNum}:`, match);
          stats.soUpdated++;
        } else {
          await applySql05ToSalesOrder(supabase, soUuid, match);
          stats.soUpdated++;
          console.log(`  sql05: updated SO ${docNum} status=${match.docStatus} total=${match.docTotal}`);
        }
      } catch (e) {
        stats.errors++;
        console.error(`  sql05 error:`, e.message);
      }
    }
  }

  console.log('\nSummary:', { ...stats, mode: args.dryRun ? 'dry-run' : 'live' });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
