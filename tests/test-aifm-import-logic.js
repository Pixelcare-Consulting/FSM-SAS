/**
 * AIFM Import Logic — Self-contained unit test
 *
 * Tests the three customer-resolution tiers and location formatting
 * using in-process mock Supabase clients (no real DB or network needed).
 *
 * Run with:
 *   node tests/test-aifm-import-logic.js
 */

import { matchTechnicianToAifmName } from '../lib/utils/aifmTechnicianResolve.js';
import { aifmCustomerNameForImport } from '../lib/utils/aifmJobCustomerName.js';
import { enrichAifmJobsWithCustomerDetails } from '../lib/integrations/aifmCustomerEnrichment.js';

// ── Colour helpers ────────────────────────────────────────────────────────────
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(green('  ✓') + ' ' + name);
    passed++;
  } catch (e) {
    console.log(red('  ✗') + ' ' + name);
    console.log('    ' + red(e.message));
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(green('  ✓') + ' ' + name);
    passed++;
  } catch (e) {
    console.log(red('  ✗') + ' ' + name);
    console.log('    ' + red(e.message));
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}
function assertEquals(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ── Inline copies of pure helpers from import-jobs.js ────────────────────────

function formatAifmLocation(job) {
  const loc = job.service_location;
  if (!loc) return null;
  const parts = [
    [loc.flat_number, loc.street_address].map((s) => String(s || '').trim()).filter(Boolean).join(' '),
    loc.city,
    loc.state,
    loc.zip,
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : (loc.nick_name || null);
}

// ── Mock Supabase builder ─────────────────────────────────────────────────────
// A tiny chainable mock that returns preset responses per table + operation.

function makeMockSupabase(plan) {
  // plan = { [table]: { maybeSingle: data|null, insert: data|null } }
  const track = [];  // record of calls made

  function makeChain(tableName, op) {
    const chain = {
      _filters: [],
      _inserted: null,
      select: () => chain,
      eq: (col, val) => { chain._filters.push({ col, val }); return chain; },
      ilike: (col, val) => { chain._filters.push({ ilike: { col, val } }); return chain; },
      is: () => chain,
      limit: () => chain,
      maybeSingle: () => {
        track.push({ table: tableName, op: 'maybeSingle', filters: chain._filters });
        const result = plan[tableName]?.maybeSingle ?? null;
        return Promise.resolve({ data: result, error: null });
      },
      single: () => {
        track.push({ table: tableName, op: op === 'insert' ? 'insert_single' : 'single', inserted: chain._inserted });
        const tableplan = plan[tableName];
        if (op === 'insert') {
          const result = tableplan?.insert ?? null;
          const error = tableplan?.insertError ?? null;
          return Promise.resolve({ data: result, error });
        }
        return Promise.resolve({ data: tableplan?.single ?? null, error: null });
      },
    };
    return chain;
  }

  const supabase = {
    from: (table) => ({
      select: () => makeChain(table, 'select'),
      insert: (payload) => {
        const chain = makeChain(table, 'insert');
        chain._inserted = payload;
        return chain;
      },
    }),
    _track: track,
  };
  return supabase;
}

// ── resolveCustomer (inline copy mirroring import-jobs.js tiers 1–3) ───────────
async function resolveCustomer(job, supabase) {
  const aifmName = aifmCustomerNameForImport(job);

  const cardCode = (job.sap_card_code || '').toString().trim();
  if (cardCode) {
    const { data: byCode } = await supabase
      .from('customer')
      .select('id, customer_code, customer_name')
      .eq('customer_code', cardCode)
      .is('deleted_at', null)
      .maybeSingle();
    if (byCode) return byCode;

    const sapName = (job.sap_bp_card_name || aifmName || '').trim();
    if (sapName) {
      const { data: created, error: createErr } = await supabase
        .from('customer')
        .insert({ customer_code: cardCode, customer_name: sapName })
        .select('id, customer_code, customer_name')
        .single();

      if (!createErr && created) return created;

      const { data: retried } = await supabase
        .from('customer')
        .select('id, customer_code, customer_name')
        .eq('customer_code', cardCode)
        .is('deleted_at', null)
        .maybeSingle();
      if (retried) return retried;
    }
  }

  if (aifmName) {
    const { data: exact } = await supabase
      .from('customer')
      .select('id, customer_code, customer_name, phone_number, email')
      .ilike('customer_name', aifmName)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (exact) return exact;

    const { data: partial } = await supabase
      .from('customer')
      .select('id, customer_code, customer_name, phone_number, email')
      .ilike('customer_name', `%${aifmName}%`)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (partial) return partial;
  }

  if (aifmName) {
    const { data: ph, error: phErr } = await supabase
      .from('customer')
      .insert({ customer_code: 'CP00001', customer_name: aifmName, source: 'portal' })
      .select('id, customer_code, customer_name')
      .single();
    if (!phErr && ph) return ph;
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

console.log(bold('\n── aifmCustomerNameForImport ─────────────────────────'));

test('person name: last name + first name (single tokens)', () => {
  assertEquals(
    aifmCustomerNameForImport({ customer_name: 'DYNASTY AIRCON LLP', customer_firstName: 'CHEW', customer_lastName: 'CONNIE' }),
    'DYNASTY AIRCON LLP'
  );
});
test('falls back to person name when explicit customer/company name is missing', () => {
  assertEquals(
    aifmCustomerNameForImport({ customer_firstName: 'CHEW', customer_lastName: 'CONNIE' }),
    'CONNIE CHEW'
  );
});
test('person name: YEO MELIANA from AIFM first/last', () => {
  assertEquals(
    aifmCustomerNameForImport({ customer_firstName: 'MELIANA', customer_lastName: 'YEO' }),
    'YEO MELIANA'
  );
});
test('AIFM job 235912 — TAN SOCK TING (not TAN / SOCK TING TAN)', () => {
  assertEquals(
    aifmCustomerNameForImport({
      id: 235912,
      customer_name: 'TAN',
      customer_firstName: 'SOCK TING',
      customer_lastName: 'TAN',
    }),
    'TAN SOCK TING'
  );
});
test('AIFM job 235797 — TAN PENG FUI', () => {
  assertEquals(
    aifmCustomerNameForImport({
      id: 235797,
      customer_name: 'TAN',
      customer_firstName: 'PENG FUI',
      customer_lastName: 'TAN',
    }),
    'TAN PENG FUI'
  );
});
test('strips meaningless placeholder "."', () => {
  assertEquals(
    aifmCustomerNameForImport({ customer_firstName: 'GATHERFOOD PTE LTD', customer_lastName: '.' }),
    'GATHERFOOD PTE LTD'
  );
});
test('company-style: multi-word part keeps first-then-last order', () => {
  assertEquals(
    aifmCustomerNameForImport({ customer_firstName: 'GATHERFOOD', customer_lastName: 'PTE LTD' }),
    'GATHERFOOD PTE LTD'
  );
});
test('falls back to AIFM job id when both name parts are placeholders', () => {
  assertEquals(
    aifmCustomerNameForImport({ id: 42, customer_firstName: '.', customer_lastName: '..' }),
    'AIFM job 42'
  );
});
test('returns null when both parts are empty and no job id', () => {
  assertEquals(aifmCustomerNameForImport({ customer_firstName: '', customer_lastName: '' }), null);
});
test('handles missing fields gracefully', () => {
  assertEquals(aifmCustomerNameForImport({}), null);
});
test('uses customer_name when first/last missing', () => {
  assertEquals(
    aifmCustomerNameForImport({ id: 1, customer_name: 'ACME PTE LTD', customer_firstName: '', customer_lastName: '' }),
    'ACME PTE LTD'
  );
});
test('falls back to AIFM customer when only customer_id (not id_customer) is set', () => {
  assertEquals(
    aifmCustomerNameForImport({ customer_id: 36468 }),
    'AIFM customer 36468'
  );
});

console.log(bold('\n── formatAifmLocation ────────────────────────────────'));

test('builds full address from all parts', () => {
  const job = {
    service_location: {
      flat_number: '16-840',
      street_address: 'BLK 274D PUNGGOL PLACE',
      city: 'SINGAPORE',
      state: null,
      zip: '824274',
    }
  };
  assertEquals(formatAifmLocation(job), '16-840 BLK 274D PUNGGOL PLACE, SINGAPORE, 824274');
});
test('returns null when service_location is absent', () => {
  assertEquals(formatAifmLocation({ service_location: null }), null);
  assertEquals(formatAifmLocation({}), null);
});
test('falls back to nick_name when address parts are all empty', () => {
  const job = { service_location: { nick_name: 'Main Office', street_address: '', city: '', zip: '' } };
  assertEquals(formatAifmLocation(job), 'Main Office');
});
test('omits null/empty parts', () => {
  const job = { service_location: { street_address: 'ORCHARD RD', city: 'SINGAPORE', state: null, zip: null } };
  assertEquals(formatAifmLocation(job), 'ORCHARD RD, SINGAPORE');
});

console.log(bold('\n── enrichAifmJobsWithCustomerDetails ─────────────────'));

test('enriches jobs with exact customer id match from /customers list', () => {
  const result = enrichAifmJobsWithCustomerDetails(
    [
      {
        id: 100,
        id_customer: 36210,
        customer_firstName: '.',
        customer_lastName: '.',
      }
    ],
    [
      { id: 35919, customer_name: 'SIN SONG CHIEW', first_name: 'SONG CHIEW', last_name: 'SIN' },
      { id: 36210, customer_name: 'SAS M&E PTE LTD', first_name: '.', last_name: '.', phone: '65-000-97546786', email: 'levon@sasme.com.sg' }
    ]
  );

  assertEquals(result.matched, 1);
  assertEquals(result.totalCustomers, 2);
  assertEquals(result.jobs[0].customer_name, 'SAS M&E PTE LTD');
  assertEquals(result.jobs[0].customer_firstName, '.');
  assertEquals(result.jobs[0].customer_lastName, '.');
  assertEquals(result.jobs[0].customer_phone, '65-000-97546786');
  assertEquals(result.jobs[0].customer_email, 'levon@sasme.com.sg');
  assertEquals(result.jobs[0].aifm_customer_details.id, 36210);
});

test('leaves jobs unchanged when no exact customer id match exists', () => {
  const original = {
    id: 101,
    id_customer: 99999,
    customer_name: 'FROM JOB ROW',
    customer_firstName: 'CHEW',
    customer_lastName: 'CONNIE',
  };
  const result = enrichAifmJobsWithCustomerDetails([original], [{ id: 36210, customer_name: 'SAS M&E PTE LTD' }]);

  assertEquals(result.matched, 0);
  assertEquals(result.jobs[0], original);
});

console.log(bold('\n── resolveCustomer ───────────────────────────────────'));

const EXISTING_CUSTOMER = { id: 'uuid-existing', customer_code: 'C000226', customer_name: 'CHEW CONNIE CHEW' };
const CREATED_CUSTOMER  = { id: 'uuid-created',  customer_code: 'C000999', customer_name: 'NEW SAP CUSTOMER' };
const NAME_CUSTOMER     = { id: 'uuid-name',     customer_code: 'C001111', customer_name: 'GATHERFOOD PTE LTD' };

// Tier 1: CardCode already in local DB
await testAsync('Tier1 — CardCode exists in local DB → returns existing customer', async () => {
  const supabase = makeMockSupabase({ customer: { maybeSingle: EXISTING_CUSTOMER } });
  const job = { id: 1, sap_card_code: 'C000226', customer_firstName: 'CHEW', customer_lastName: 'CONNIE CHEW' };
  const result = await resolveCustomer(job, supabase);
  assert(result !== null, 'should return a customer');
  assertEquals(result.customer_code, 'C000226', 'wrong customer_code');
  assertEquals(result.id, EXISTING_CUSTOMER.id, 'should return existing customer (not create new)');
  // Should NOT have called insert
  const inserts = supabase._track.filter((t) => t.op === 'insert_single');
  assertEquals(inserts.length, 0, 'should not insert when already in DB');
});

// Tier 1b: CardCode confirmed by SAP, not in local DB → auto-create
await testAsync('Tier1b — CardCode not in local DB, insert succeeds → returns created customer', async () => {
  const supabase = makeMockSupabase({
    customer: {
      maybeSingle: null,          // not in local DB
      insert: CREATED_CUSTOMER,   // insert succeeds
    }
  });
  const job = {
    id: 2,
    sap_card_code: 'C000999',
    sap_bp_card_name: 'NEW SAP CUSTOMER',
    customer_firstName: 'NEW', customer_lastName: 'SAP CUSTOMER',
  };
  const result = await resolveCustomer(job, supabase);
  assert(result !== null, 'should return a customer');
  assertEquals(result.customer_code, 'C000999', 'wrong customer_code');
  assertEquals(result.customer_name, 'NEW SAP CUSTOMER', 'wrong customer_name');
  // Verify insert was called with correct payload
  const insertCall = supabase._track.find((t) => t.op === 'insert_single');
  assert(insertCall, 'should have called insert');
  assertEquals(insertCall.inserted.customer_code, 'C000999', 'inserted wrong customer_code');
  assertEquals(insertCall.inserted.customer_name, 'NEW SAP CUSTOMER', 'inserted wrong customer_name');
  assert(!('source' in insertCall.inserted), 'should NOT include "source" field (column does not exist)');
});

// Tier 1b: insert fails (race condition) → retry fetch succeeds
await testAsync('Tier1b — insert race condition → retry fetch returns customer', async () => {
  let callCount = 0;
  const supabase = {
    from: (table) => ({
      select: () => ({
        eq: function() { return this; },
        is: function() { return this; },
        limit: function() { return this; },
        ilike: function() { return this; },
        maybeSingle: () => {
          callCount++;
          // First maybeSingle = not found; second (retry after failed insert) = found
          const data = callCount >= 2 ? CREATED_CUSTOMER : null;
          return Promise.resolve({ data, error: null });
        },
        single: () => Promise.resolve({ data: null, error: null }),
      }),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'duplicate key' } }),
        }),
      }),
    }),
  };
  const job = {
    id: 3,
    sap_card_code: 'C000999',
    sap_bp_card_name: 'NEW SAP CUSTOMER',
    customer_firstName: 'NEW', customer_lastName: 'SAP CUSTOMER',
  };
  const result = await resolveCustomer(job, supabase);
  assert(result !== null, 'should return customer from retry');
  assertEquals(result.id, CREATED_CUSTOMER.id, 'should return the retried customer');
});

// Tier 2: no CardCode, name matches exactly
await testAsync('Tier2 — no CardCode, exact name match', async () => {
  const supabase = makeMockSupabase({ customer: { maybeSingle: NAME_CUSTOMER } });
  const job = { id: 4, sap_card_code: null, customer_firstName: 'GATHERFOOD', customer_lastName: 'PTE LTD' };
  const result = await resolveCustomer(job, supabase);
  assert(result !== null, 'should return a customer');
  assertEquals(result.id, NAME_CUSTOMER.id);
});

// No name and no job id → null (cannot create placeholder)
await testAsync('no match → returns null when no derivable name', async () => {
  const supabase = makeMockSupabase({ customer: { maybeSingle: null, insert: null } });
  const job = { sap_card_code: null, customer_firstName: '.', customer_lastName: '.' };
  const result = await resolveCustomer(job, supabase);
  assertEquals(result, null, 'should return null when nothing matches');
});

const PLACEHOLDER_CUSTOMER = {
  id: 'uuid-cp',
  customer_code: 'CP00001',
  customer_name: 'AIFM job 5',
};

await testAsync('Tier3 — placeholder when only placeholders in name but job id present', async () => {
  const supabase = makeMockSupabase({
    customer: { maybeSingle: null, insert: PLACEHOLDER_CUSTOMER },
  });
  const job = { id: 5, sap_card_code: null, customer_firstName: '.', customer_lastName: '.' };
  const result = await resolveCustomer(job, supabase);
  assert(result !== null, 'should create/use placeholder customer');
  assertEquals(result.customer_code, 'CP00001');
  assertEquals(result.customer_name, 'AIFM job 5');
});

// sap_card_code present but no name → fallback to aifmCustomerName for Tier1b insert
await testAsync('Tier1b — uses sap_bp_card_name for insert when available', async () => {
  const captured = {};
  const supabase = {
    from: () => ({
      select: () => ({
        eq: function() { return this; },
        is: function() { return this; },
        limit: function() { return this; },
        ilike: function() { return this; },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
      }),
      insert: (payload) => {
        captured.payload = payload;
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'new-id', ...payload }, error: null }),
          }),
        };
      },
    }),
  };
  const job = {
    id: 6,
    sap_card_code: 'C004462',
    sap_bp_card_name: 'NICHOLAS TONG (SAP NAME)',
    customer_firstName: 'NICHOLAS', customer_lastName: 'TONG',
  };
  await resolveCustomer(job, supabase);
  assertEquals(captured.payload?.customer_name, 'NICHOLAS TONG (SAP NAME)', 'should prefer sap_bp_card_name');
  assertEquals(captured.payload?.customer_code, 'C004462');
  assert(!('source' in captured.payload), '"source" column does not exist on customer table — must not be included');
});

console.log(bold('\n── matchTechnicianToAifmName ─────────────────────────'));

test('exact normalized match (case/spacing)', () => {
  const techs = [{ id: 'a', full_name: 'Phyllis Ang' }];
  const m = matchTechnicianToAifmName('PHYLLIS  ang', techs);
  assertEquals(m.id, 'a');
  assertEquals(m.match, 'exact');
});

test('order-independent: all name tokens appear in full_name', () => {
  const techs = [{ id: 'b', full_name: 'Wee Jie Chua' }];
  const m = matchTechnicianToAifmName('Chua Wee Jie', techs);
  assert(m !== null, 'should match');
  assertEquals(m.id, 'b');
  assertEquals(m.match, 'token');
});

test('prefers fewer extra words when several technicians match tokens', () => {
  const techs = [
    { id: 'long', full_name: 'Phyllis Ang Yeo Secondary' },
    { id: 'short', full_name: 'Phyllis Ang' },
  ];
  const m = matchTechnicianToAifmName('Phyllis Ang', techs);
  assertEquals(m.id, 'short');
});

test('2-char token must match a whole word (not substring of longer name)', () => {
  const techs = [{ id: '1', full_name: 'Andrew Smith' }];
  const m = matchTechnicianToAifmName('An Smith', techs);
  assertEquals(m, null);
});

test('AIFM team code Z vs portal Y — matches on person name after code strip', () => {
  const techs = [{ id: 'y3', full_name: 'Y3 Teik Leong Lian' }];
  const m = matchTechnicianToAifmName('3 Teik Leong Lian', techs);
  assert(m !== null, 'should match Y3 tech when AIFM code is Z');
  assertEquals(m.id, 'y3');
});

test('trailing period on AIFM name does not block match', () => {
  const techs = [{ id: 'y3', full_name: 'Y3 Teik Leong Lian' }];
  const m = matchTechnicianToAifmName('Teik Leong Lian .', techs);
  assert(m !== null, 'should match despite trailing period');
  assertEquals(m.id, 'y3');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
if (failed === 0) {
  console.log(bold(green(`  All ${passed} tests passed ✓`)));
} else {
  console.log(bold(red(`  ${failed} test(s) FAILED`) + yellow(` (${passed} passed)`)));
  process.exit(1);
}
console.log('');
