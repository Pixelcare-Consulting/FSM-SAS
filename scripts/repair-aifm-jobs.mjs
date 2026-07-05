#!/usr/bin/env node
/**
 * Re-apply name + appointment window for specific AIFM jobs (direct DB update).
 *
 *   node scripts/repair-aifm-jobs.mjs --job=2026-001071,2026-001138
 *   node scripts/repair-aifm-jobs.mjs --aifm=235912,235797
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');

function parseArgs(argv) {
  const out = { aifm: [], job: [], start: '2026-05-01', end: '2026-05-31' };
  for (const a of argv) {
    if (a.startsWith('--aifm=')) out.aifm = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    if (a.startsWith('--job=')) out.job = a.slice(6).split(',').map((s) => s.trim()).filter(Boolean);
    if (a.startsWith('--start=')) out.start = a.slice(8).trim();
    if (a.startsWith('--end=')) out.end = a.slice(6).trim();
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = String(process.env.AIFM_API_TOKEN || '').trim().replace(/^["']|["']$/g, '');

  if (!url || !key || !token) {
    console.error('Need Supabase + AIFM_API_TOKEN in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { authorizeAifmBearer, fetchAifmCustomersDirectory } = await import(
    '../lib/integrations/aifmApiClient.js'
  );
  const { enrichAifmJobsWithCustomerDirectory } = await import(
    '../lib/integrations/aifmCustomerAccountEnrichment.js'
  );
  const { enrichAifmJobsWithSupabaseMasterlist } = await import(
    '../lib/integrations/aifmSupabaseMasterlistEnrichment.js'
  );
  const { customerService } = await import('../lib/supabase/database.js');
  const { aifmCustomerNameForImport } = await import('../lib/utils/aifmJobCustomerName.js');
  const { parseAifmDateTime, computeAifmWorkEndIso, aifmDurationDecimalHours } = await import(
    '../lib/utils/aifmJobScheduleTimes.js'
  );
  const { formatAifmLocation, sanitizeAifmEmbeddedTagValue } = await import(
    '../lib/utils/aifmLocationFormat.js'
  );
  let targetAifmIds = [...args.aifm];
  const jobNumberByAifm = new Map();

  if (args.job.length) {
    for (const jn of args.job) {
      const { data } = await supabase
        .from('jobs')
        .select('job_number, description')
        .eq('job_number', jn)
        .maybeSingle();
      const m = data?.description?.match(/\[AIFM:(\d+)\]/);
      if (m) {
        targetAifmIds.push(m[1]);
        jobNumberByAifm.set(m[1], jn);
      }
    }
  }
  targetAifmIds = [...new Set(targetAifmIds)];
  if (!targetAifmIds.length) {
    console.error('Usage: --job=2026-001071,2026-001138 or --aifm=235912,235797');
    process.exit(1);
  }

  const auth = await authorizeAifmBearer(process.env.AIFM_BASE_URL, token);
  if (!auth) process.exit(1);

  const byId = new Map();
  const start_date = args.start;
  const end_date = args.end;
  console.log(`AIFM fetch ${start_date} → ${end_date}`);
  for (let page = 1; page <= 200; page++) {
    const res = await fetch(`${auth.base}/api/v1/jobs`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_token: auth.bearer, start_date, end_date, page, per_page: 50 }),
    });
    const json = await res.json();
    for (const row of json.data || []) {
      if (targetAifmIds.includes(String(row.id))) byId.set(String(row.id), row);
    }
    if ((json.data || []).length < 50) break;
    if (byId.size >= targetAifmIds.length) break;
  }

  let jobs = targetAifmIds.map((id) => byId.get(id)).filter(Boolean);
  if (!jobs.length) {
    console.error('AIFM API returned no rows for', targetAifmIds.join(', '), `(scanned ${start_date}–${end_date})`);
    process.exit(1);
  }
  const directory = await fetchAifmCustomersDirectory(auth.base, auth.bearer);
  jobs = enrichAifmJobsWithCustomerDirectory(jobs, directory).jobs;
  const [customerRows, leadRows] = await Promise.all([
    customerService.getSapMasterlistCustomers(supabase),
    customerService.getSapMasterlistLeads(supabase),
  ]);
  jobs = enrichAifmJobsWithSupabaseMasterlist(jobs, customerRows, leadRows).jobs;

  for (const job of jobs) {
    const aifmId = String(job.id);
    const displayName = aifmCustomerNameForImport(job);
    const locationAddress = formatAifmLocation(job);
    const scheduledStart = parseAifmDateTime(job.job_start_date, job.job_start_time);
    const scheduledEnd = computeAifmWorkEndIso(job);

    const { data: existing } = await supabase
      .from('jobs')
      .select('id, job_number, description')
      .ilike('description', `%[AIFM:${aifmId}]%`)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) {
      console.warn(`No FSM job for AIFM ${aifmId}`);
      continue;
    }

    const bodyText = (
      job.job_description || job.description || job.remarks || job.note || ''
    ).toString().trim();
    const oldDesc = existing.description || '';
    const bodyFromOld = oldDesc.replace(/^\[AIFM:\d+\]\n?/, '').replace(/\[CUSTOMER:[^\]]+\]\n?/, '').replace(/\[ADDRESS:[^\]]+\]\n?/, '').trim();
    const aifmDescription = bodyText || bodyFromOld;

    const description = [
      `[AIFM:${aifmId}]`,
      displayName ? `[CUSTOMER:${sanitizeAifmEmbeddedTagValue(displayName)}]` : null,
      locationAddress ? `[ADDRESS:${sanitizeAifmEmbeddedTagValue(locationAddress)}]` : null,
      job.job_po_number ? `PO: ${job.job_po_number}` : null,
      aifmDescription || null,
    ]
      .filter(Boolean)
      .join('\n');

    const { error: updErr } = await supabase
      .from('jobs')
      .update({
        description,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updErr) {
      console.error(`Update failed ${existing.job_number}:`, updErr.message);
      continue;
    }

    await supabase.from('job_schedule').delete().eq('job_id', existing.id);
    const startIso = scheduledStart;
    const endIso = scheduledEnd;
    const jsdate = startIso ? startIso.split('T')[0] : null;
    const jedate = endIso ? endIso.split('T')[0] : jsdate;
    const timeFromIso = (iso) => (iso ? (iso.split('T')[1] || '').split('.')[0] || null : null);

    await supabase.from('job_schedule').insert({
      job_id: existing.id,
      jsdate,
      jedate,
      jstime: timeFromIso(startIso),
      jetime: timeFromIso(endIso),
      dur_type: 'hours',
      dur: aifmDurationDecimalHours(job),
      address: locationAddress || null,
    });

    console.log(`✓ ${existing.job_number} (AIFM ${aifmId})`);
    console.log(`    name: ${displayName}  masterlist card: ${job.sap_card_code || '—'}`);
    console.log(`    tag: [CUSTOMER:${displayName}]`);
    console.log(`    UTC: ${scheduledStart} → ${scheduledEnd}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
