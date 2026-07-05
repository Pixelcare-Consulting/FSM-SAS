import assert from 'node:assert/strict';

import {
  enrichAifmJobsWithSupabaseMasterlist,
} from '../lib/integrations/aifmSupabaseMasterlistEnrichment.js';

const jobs = [
  {
    id: 101,
    customer_firstName: 'MELIANA',
    customer_lastName: 'YEO',
  },
  {
    id: 102,
    customer_firstName: 'GATHERFOOD',
    customer_lastName: 'PTE LTD',
  },
  {
    id: 103,
    customer_name: 'UNKNOWN CUSTOMER',
  },
];

const masterlistRows = [
  {
    id: 'cust-1',
    customer_code: 'C000001',
    customer_name: 'YEO MELIANA',
    phone_number: '61234567',
    email: 'meliana@example.com',
  },
  {
    id: 'cust-2',
    customer_code: 'C000002',
    customer_name: 'GATHERFOOD PTE LTD',
    phone_number: '69876543',
    email: 'ops@gatherfood.example',
  },
];

const result = enrichAifmJobsWithSupabaseMasterlist(jobs, masterlistRows);

assert.equal(result.matched, 2);
assert.equal(result.totalCustomers, 2);
assert.equal(result.jobs[0].customer_name, 'YEO MELIANA');
assert.equal(result.jobs[0].customer_phone, '61234567');
assert.equal(result.jobs[0].customer_email, 'meliana@example.com');
assert.equal(result.jobs[0].sap_card_code, 'C000001');
assert.equal(result.jobs[0].sap_bp_card_name, 'YEO MELIANA');
assert.equal(result.jobs[0].sap_card_match, 'supabase_masterlist_exact');
assert.equal(result.jobs[0].supabase_masterlist_customer_id, 'cust-1');
assert.equal(result.jobs[2].customer_name, 'UNKNOWN CUSTOMER');
assert.equal(result.jobs[2].sap_card_code ?? null, null);

const leadJobs = [{ id: 201, customer_name: 'TAN SOCK TING' }];
const leadRows = [
  { id: 'lead-1', lead_code: 'L004458', lead_name: 'TAN SOCK TING', phone_number: '6591122513' },
];
const leadResult = enrichAifmJobsWithSupabaseMasterlist(leadJobs, masterlistRows, leadRows);
assert.equal(leadResult.matched, 1);
assert.equal(leadResult.matchedLeads, 1);
assert.equal(leadResult.jobs[0].sap_card_code, 'L004458');
assert.equal(leadResult.jobs[0].sap_card_match, 'supabase_masterlist_lead_exact');

const customerWins = enrichAifmJobsWithSupabaseMasterlist(
  [{ id: 202, customer_name: 'YEO MELIANA' }],
  masterlistRows,
  [{ id: 'lead-x', lead_code: 'L999999', lead_name: 'YEO MELIANA' }]
);
assert.equal(customerWins.jobs[0].sap_card_code, 'C000001');
assert.equal(customerWins.matchedLeads, 0);

const tanTrap = enrichAifmJobsWithSupabaseMasterlist(
  [
    {
      id: 235912,
      customer_name: 'TAN',
      customer_firstName: 'SOCK TING',
      customer_lastName: 'TAN',
      aifm_customer_account_name: 'TAN SOCK TING',
    },
  ],
  [
    {
      id: 'wrong-tan',
      customer_code: 'L003894',
      customer_name: 'TAN',
    },
    {
      id: 'right-tan',
      customer_code: 'L004458',
      customer_name: 'TAN SOCK TING',
    },
  ],
  []
);
assert.equal(tanTrap.jobs[0].sap_card_code, 'L004458');
assert.equal(tanTrap.jobs[0].sap_bp_card_name, 'TAN SOCK TING');

console.log('aifmSupabaseMasterlistEnrichment tests passed');
