import assert from 'node:assert/strict';

import { buildAifmCustomerDirectoryMap } from '../lib/integrations/aifmApiClient.js';
import {
  accountDisplayNamesForSapLookup,
  buildFsmImportPreview,
  buildJobAuditRecord,
  formatAifmJobContactLabel,
  fsmResolveTierHint,
  getAifmCustomerIdFromJob,
  resolveAifmAccountFromDirectory,
} from '../lib/integrations/aifmCustomerSapResolver.js';

const directoryRow = {
  id: 46817,
  customer_name: 'TAN SOCK TING',
  first_name: 'SOCK TING',
  last_name: 'TAN',
};

const job235912 = {
  id: 235912,
  id_customer: 46817,
  customer_name: 'TAN',
  customer_firstName: 'SOCK TING',
  customer_lastName: 'TAN',
};

const job236127 = {
  id: 236127,
  id_customer: 46817,
  customer_name: 'TAN',
  customer_firstName: 'JANICE',
  customer_lastName: 'ONG',
};

const map = buildAifmCustomerDirectoryMap([directoryRow]);

assert.equal(getAifmCustomerIdFromJob(job235912), '46817');

const account = resolveAifmAccountFromDirectory(job235912, map);
assert.equal(account.accountName, 'TAN SOCK TING');
assert.notEqual(account.accountName, job235912.customer_name);

const variants = accountDisplayNamesForSapLookup(directoryRow);
assert.ok(variants.includes('TAN SOCK TING'));
assert.ok(
  variants.some((v) => v.includes('SOCK') && v.includes('TAN')),
  'expected name permutations from first/last'
);

/** Mirrors resolveSapCardCodeForNameVariants — verifies C before L. */
async function resolveWithMocks(variants, sessionCookies) {
  const triedNames = [];
  const calls = { customer: 0, lead: 0 };
  for (const name of variants) {
    const n = String(name || '').trim();
    if (!n || triedNames.includes(n)) continue;
    triedNames.push(n);
    calls.customer++;
    if (n === 'TAN SOCK TING') {
      return {
        cardCode: 'C000999',
        cardType: 'C',
        matchType: 'exact',
        triedNames,
        calls,
      };
    }
    calls.lead++;
    if (n === 'NEVER_USED') {
      return { cardCode: 'L000001', cardType: 'L', matchType: 'exact', triedNames, calls };
    }
  }
  return { cardCode: null, cardType: null, matchType: null, triedNames, calls };
}

const sapHit = await resolveWithMocks(['TAN SOCK TING'], {});
assert.equal(sapHit.cardCode, 'C000999');
assert.equal(sapHit.calls.customer, 1);
assert.equal(sapHit.calls.lead, 0);

const missThenLead = await resolveWithMocks(['NOPE', 'TAN SOCK TING'], {});
assert.equal(missThenLead.cardCode, 'C000999');
assert.equal(missThenLead.calls.customer, 2);

const offline = await buildJobAuditRecord(job236127, map, null, { skipSap: true });
assert.equal(offline.accountName, 'TAN SOCK TING');
assert.equal(offline.jobContact, 'ONG JANICE');
assert.equal(offline.contactDiffersFromAccount, true);
assert.ok(offline.notes.includes('sap_skipped'));

const offline912 = await buildJobAuditRecord(job235912, map, null, { skipSap: true });
const fsm = buildFsmImportPreview(job235912, {
  ...offline912,
  suggestedCardCode: 'L004458',
  sapCardType: 'L',
});
assert.equal(fsm.customerResolution.importDisplayName, 'TAN SOCK TING');
assert.ok(fsm.fsm.description.includes('[CUSTOMER:TAN SOCK TING]'));
assert.ok(fsm.fsm.description.includes('[AIFM:235912]'));
assert.equal(fsmResolveTierHint({ suggestedCardCode: 'L004458' }), 'tier2b_sap_lead');
assert.equal(fsmResolveTierHint({ suggestedCardCode: 'C000001' }), 'tier1_masterlist_customer');
assert.equal(fsmResolveTierHint({ suggestedCardCode: null }), 'tier3_placeholder');

console.log('aifmCustomerSapResolver.test.mjs: OK');
