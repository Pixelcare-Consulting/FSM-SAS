/**
 * Cutover ops: verify portal customers against current SAP and optionally bulk re-sync.
 *
 * Uses SAP_B1_* env login (no browser session required).
 *
 * Examples:
 *   node scripts/verify-and-resync-portal-customers.js --preview
 *   node scripts/verify-and-resync-portal-customers.js --preview --offset=0 --limit=25
 *   node scripts/verify-and-resync-portal-customers.js --resync --include-jobs
 *   node scripts/verify-and-resync-portal-customers.js --resync --api=http://localhost:3000
 *
 * Flags:
 *   --preview          Dry-run bucket report (default if neither preview nor resync)
 *   --resync           Re-sync missing customers (batched)
 *   --include-jobs     Clear jobs.sap_activity_id for affected customers (resync only)
 *   --offset=N         Pagination offset (default 0)
 *   --limit=N          Batch size max 25 (default 25)
 *   --api=URL          Call portal HTTP API (required for --resync; default http://127.0.0.1:4000)
 *   --all              Loop batches until hasMore is false (resync or preview)
 *
 * Preview runs standalone via SAP_B1_* env login. Resync requires the portal dev server
 * and SYNC_DELTA_CRON_SECRET (or use the API from an admin browser session).
 */

try {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config({ path: '.env' });
} catch (_) {}

const { createClient } = require('@supabase/supabase-js');

function parseArgs(argv) {
  const out = {
    preview: false,
    resync: false,
    includeJobs: false,
    offset: 0,
    limit: 25,
    apiBase: null,
    all: false,
  };
  for (const arg of argv) {
    if (arg === '--preview') out.preview = true;
    if (arg === '--resync') out.resync = true;
    if (arg === '--include-jobs') out.includeJobs = true;
    if (arg === '--all') out.all = true;
    if (arg.startsWith('--offset=')) out.offset = Math.max(0, parseInt(arg.slice(9), 10) || 0);
    if (arg.startsWith('--limit=')) out.limit = Math.min(25, Math.max(1, parseInt(arg.slice(8), 10) || 25));
    if (arg.startsWith('--api=')) out.apiBase = arg.slice(6).replace(/\/$/, '');
  }
  if (!out.preview && !out.resync) out.preview = true;
  return out;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

async function callHttpApi(apiBase, body, secret) {
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Sync-Delta-Secret'] = secret;
  const res = await fetch(`${apiBase}/api/customers/verify-sap-sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data;
}

const CUSTOMER_VERIFY_SELECT =
  'id, customer_code, customer_name, email, phone_number, synced_to_sap_at, sap_card_code, sap_sync_environment, sap_sync_verified_at';

const DEFAULT_PORTAL_API = () =>
  String(process.env.PORTAL_BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');

function getCurrentSapEnvironment() {
  return (process.env.SAP_B1_COMPANY_DB || '').trim() || null;
}

function getEffectiveSapCardCode(customer) {
  if (customer?.sap_card_code) {
    return String(customer.sap_card_code).trim() || null;
  }
  const code = customer?.customer_code;
  if (typeof code !== 'string') return null;
  const isOurInternalCP = /^CP\d+$/i.test(code);
  const isLEADCode = code.startsWith('LEAD-');
  if (!isOurInternalCP && !isLEADCode && /^[A-Za-z0-9]{1,15}$/.test(code)) {
    return code;
  }
  return null;
}

function environmentNeedsResync(customer) {
  const currentEnv = getCurrentSapEnvironment();
  if (!currentEnv || !customer?.sap_sync_environment) return false;
  return customer.sap_sync_environment !== currentEnv;
}

async function getSapSessionFromEnv() {
  const {
    default: sapService,
    loginSessionCookiesFromEnvironment,
    unwrapSapEnvironmentLogin,
  } = await import('../lib/services/sapService.js');

  const login = await loginSessionCookiesFromEnvironment();
  const sessionCookies = unwrapSapEnvironmentLogin(login);
  if (!sessionCookies) {
    throw new Error(
      login?.error ||
        'SAP login failed — check SAP_B1_COMPANY_DB, SAP_B1_USERNAME, SAP_B1_PASSWORD, SAP_SERVICE_LAYER_BASE_URL'
    );
  }
  return { sapService, sessionCookies };
}

/**
 * Standalone preview (no Next.js lib imports — Node cannot resolve extensionless ESM chains).
 */
async function runDirectPreview({ offset, limit }) {
  const { sapService, sessionCookies } = await getSapSessionFromEnv();
  const supabase = getSupabase();

  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 25);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const { data, error, count } = await supabase
    .from('customer')
    .select(CUSTOMER_VERIFY_SELECT, { count: 'exact' })
    .not('synced_to_sap_at', 'is', null)
    .is('deleted_at', null)
    .order('synced_to_sap_at', { ascending: true })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error) throw error;

  const buckets = {
    exists_in_sap: [],
    missing_in_sap: [],
    no_sap_card_code: [],
  };

  for (const customer of data || []) {
    const sapCardCode = getEffectiveSapCardCode(customer);
    const row = {
      id: customer.id,
      customer_code: customer.customer_code,
      customer_name: customer.customer_name,
      sap_card_code: customer.sap_card_code,
      synced_to_sap_at: customer.synced_to_sap_at,
      email: customer.email,
    };

    if (!sapCardCode) {
      buckets.no_sap_card_code.push(row);
      continue;
    }

    if (environmentNeedsResync(customer)) {
      buckets.missing_in_sap.push({ ...row, reason: 'environment_mismatch' });
      continue;
    }

    const inSap = await sapService.businessPartnerExists(sapCardCode, sessionCookies);
    if (inSap) {
      buckets.exists_in_sap.push(row);
    } else {
      buckets.missing_in_sap.push({ ...row, reason: 'missing_in_sap' });
    }
  }

  const processed = (data || []).length;
  const total = count ?? 0;

  return {
    buckets,
    pagination: {
      offset: safeOffset,
      limit: safeLimit,
      processed,
      total,
      hasMore: safeOffset + processed < total,
    },
    sapEnvironment: getCurrentSapEnvironment(),
    counts: {
      exists_in_sap: buckets.exists_in_sap.length,
      missing_in_sap: buckets.missing_in_sap.length,
      no_sap_card_code: buckets.no_sap_card_code.length,
    },
  };
}

function printSummary(result, { preview, resync }) {
  if (preview && result.buckets) {
    console.log('\n=== Preview buckets ===');
    console.log('exists_in_sap:', result.counts?.exists_in_sap ?? result.buckets.exists_in_sap?.length ?? 0);
    console.log('missing_in_sap:', result.counts?.missing_in_sap ?? result.buckets.missing_in_sap?.length ?? 0);
    console.log('no_sap_card_code:', result.counts?.no_sap_card_code ?? result.buckets.no_sap_card_code?.length ?? 0);
    if (result.pagination) {
      console.log('pagination:', result.pagination);
    }
    if (result.sapEnvironment) {
      console.log('sapEnvironment:', result.sapEnvironment);
    }
    return;
  }

  if (resync && result.preview) {
    console.log('\n=== Resync batch ===');
    console.log('preview counts:', result.preview.counts);
    if (result.results) {
      console.log('linked:', result.results.linked?.length ?? 0);
      console.log('created:', result.results.created?.length ?? 0);
      console.log('existing:', result.results.existing?.length ?? 0);
      console.log('failed:', result.results.failed?.length ?? 0);
    }
    console.log('jobsCleared:', result.jobsCleared ?? 0);
    if (result.results?.failed?.length) {
      console.log('failures:', JSON.stringify(result.results.failed.slice(0, 5), null, 2));
    }
    if (result.preview?.pagination) {
      console.log('pagination:', result.preview.pagination);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secret = String(process.env.SYNC_DELTA_CRON_SECRET || '').trim();
  let offset = args.offset;
  let batch = 0;

  if (args.resync && !args.apiBase) {
    args.apiBase = DEFAULT_PORTAL_API();
    console.log('Resync uses portal API at', args.apiBase);
    if (!secret) {
      console.warn(
        'Warning: SYNC_DELTA_CRON_SECRET is not set — API call may fail unless portal allows admin auth another way.'
      );
    }
  }

  console.log('SAP company DB:', process.env.SAP_B1_COMPANY_DB || '(not set)');
  console.log('Mode:', args.resync ? 'resync' : 'preview', args.includeJobs ? '+ include-jobs' : '');

  do {
    batch += 1;
    console.log(`\n--- Batch ${batch} offset=${offset} limit=${args.limit} ---`);

    let result;
    if (args.apiBase) {
      const body = {
        offset,
        limit: args.limit,
        include_jobs: args.includeJobs,
      };
      if (args.resync) body.resync = true;
      else body.preview = true;
      result = await callHttpApi(args.apiBase, body, secret);
      if (args.resync) {
        printSummary({ preview: result.preview, results: result.results, jobsCleared: result.jobsCleared }, args);
      } else {
        printSummary(result, args);
      }
    } else if (args.resync) {
      throw new Error(
        'Resync requires the portal API. Start the dev server (pnpm dev) and retry, or pass --api=http://127.0.0.1:4000'
      );
    } else {
      result = await runDirectPreview({ offset, limit: args.limit });
      printSummary(result, args);
    }

    const pagination = result.pagination || result.preview?.pagination;
    const hasMore = pagination?.hasMore === true;
    if (!args.all || !hasMore) break;
    offset = (pagination.offset ?? offset) + (pagination.processed ?? args.limit);
  } while (true);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('verify-and-resync-portal-customers failed:', err.message || err);
  process.exit(1);
});
