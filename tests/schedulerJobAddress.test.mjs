import assert from 'node:assert/strict';

import { resolveJobDisplayAddress } from '../lib/jobs/resolveJobDisplayAddress.js';

const sushiLocation = {
  id: 'loc-sushi',
  location_name: '#04-07/08 100AM SUSHIRO 100 TRAS STREET, SINGAPORE, 079027',
};

const staleScheduleAddress =
  '30 VICTORIA STREET, #01-01/02 CHIJMES (GYUKAKU), Singapore, 187996';

// Linked location must win over stale job_schedule.address (C004426 regression).
// Scheduler buildLocation delegates to this same resolver.
assert.equal(
  resolveJobDisplayAddress(
    { description: '', location_id: 'loc-sushi', location: sushiLocation },
    { scheduleAddress: staleScheduleAddress }
  ),
  sushiLocation.location_name
);

// Legacy: no linked location — fall back to schedule address.
assert.equal(
  resolveJobDisplayAddress(
    { description: '' },
    { scheduleAddress: '11 KENG CHEOW STREET, Singapore, 059508' }
  ),
  '11 KENG CHEOW STREET, Singapore, 059508'
);

// Empty schedule + location — use location.
assert.equal(
  resolveJobDisplayAddress({
    description: '',
    location: { location_name: '38 IMBIAH ROAD, Singapore, 098465' },
  }),
  '38 IMBIAH ROAD, Singapore, 098465'
);

// customer_location row wins when matched by location_id (scheduler API enrichment).
const customerLocations = [
  {
    location_id: 'loc-sushi',
    site_id: '#04-07/08 100AM SUSHIRO',
    street: '100 TRAS STREET',
    building: '#04-07/08 100AM SUSHIRO',
    zip_code: '079027',
    country_name: 'Singapore',
    address: sushiLocation.location_name,
  },
];

assert.equal(
  resolveJobDisplayAddress(
    { description: '', location_id: 'loc-sushi' },
    { scheduleAddress: staleScheduleAddress, customerLocations }
  ),
  '100 TRAS STREET, #04-07/08 100AM SUSHIRO, Singapore, 079027'
);

console.log('schedulerJobAddress tests passed');
