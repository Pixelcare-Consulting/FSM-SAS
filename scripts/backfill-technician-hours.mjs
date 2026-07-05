/**
 * Populate technician_hours from technician_jobs (same labor math as incentives UI).
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage (repo root):
 *   pnpm exec node scripts/backfill-technician-hours.mjs
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { upsertTechnicianHoursForTechnicianJobId } from '../lib/supabase/technicianHours.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const PAGE = 500;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let offset = 0;
  let processed = 0;
  let failed = 0;

  for (;;) {
    const { data: rows, error } = await supabase
      .from('technician_jobs')
      .select('id')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error('Failed to page technician_jobs:', error.message);
      process.exit(1);
    }
    if (!rows?.length) break;

    for (const row of rows) {
      const { error: oneErr } = await upsertTechnicianHoursForTechnicianJobId(supabase, row.id);
      if (oneErr) {
        failed += 1;
        console.error(`tj ${row.id}:`, oneErr.message || oneErr);
      } else {
        processed += 1;
      }
    }

    offset += rows.length;
    console.log(`… ${processed} upserts (${failed} errors), paging offset ${offset}`);
    if (rows.length < PAGE) break;
  }

  console.log(`Done. Upserts OK: ${processed}, errors: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
