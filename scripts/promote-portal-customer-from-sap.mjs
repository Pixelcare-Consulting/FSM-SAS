#!/usr/bin/env node
/**
 * Promote a portal CP customer to the official SAP C CardCode in place.
 *
 *   node scripts/promote-portal-customer-from-sap.mjs C004312
 *   node scripts/promote-portal-customer-from-sap.mjs CP00126 C004312
 */

try {
  const { createRequire } = await import('module');
  createRequire(import.meta.url)('dotenv').config({ path: '.env.local' });
} catch {
  // optional
}

import {
  promotePortalCustomerFromSap,
  resolvePortalCustomerForPromotion,
} from '../lib/customers/promotePortalCustomerFromSap.js';
import { getSupabaseAdmin } from '../lib/supabase/server.js';
import {
  loginSessionCookiesFromEnvironment,
  unwrapSapEnvironmentLogin,
} from '../lib/services/sapService.js';

async function main() {
  const arg2 = String(process.argv[2] || '').trim().toUpperCase();
  const arg3 = String(process.argv[3] || '').trim().toUpperCase();

  let portalCustomerCode = '';
  let sapCardCode = '';

  if (/^C[A-Z0-9]+$/.test(arg2) && !arg3) {
    sapCardCode = arg2;
  } else if (/^CP\d+$/i.test(arg2) && /^C[A-Z0-9]+$/.test(arg3)) {
    portalCustomerCode = arg2;
    sapCardCode = arg3;
  } else {
    console.error('Usage:');
    console.error('  node scripts/promote-portal-customer-from-sap.mjs C004312');
    console.error('  node scripts/promote-portal-customer-from-sap.mjs CP00126 C004312');
    process.exit(1);
  }

  const sapLogin = await loginSessionCookiesFromEnvironment();
  const sessionCookies = unwrapSapEnvironmentLogin(sapLogin);
  if (!sessionCookies) {
    console.error('SAP login failed:', sapLogin?.error || 'no cookies');
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();

  if (!portalCustomerCode) {
    portalCustomerCode = await resolvePortalCustomerForPromotion(supabase, sapCardCode, sessionCookies);
    if (!portalCustomerCode) {
      console.error(`No unambiguous portal CP match for SAP ${sapCardCode}`);
      process.exit(1);
    }
    console.log(`Resolved portal CP: ${portalCustomerCode}`);
  }

  const result = await promotePortalCustomerFromSap({
    supabase,
    sessionCookies,
    portalCustomerCode,
    sapCardCode,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
