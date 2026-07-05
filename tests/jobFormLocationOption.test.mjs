import assert from 'node:assert/strict';

import { resolveCustomerLocationStreet } from '../lib/customers/supabaseCustomerSapShim.js';
import {
  buildJobFormLocationPatch,
  mapCustomerLocationToJobFormOption,
} from '../lib/jobs/mapJobFormLocationOption.js';

// C004426-style multi-site: unit in site_id, street on shared linked location.
const sharedLocationId = 'loc-holland';
const hollandSite = {
  id: 'cl-holland',
  site_id: '#02-01 SUSHIRO HOLLAND SHOPPING CENTRE',
  building: '',
  street: '',
  block: '',
  address: '',
  city: '',
  country_name: 'Singapore',
  zip_code: '278996',
  address_type: 'bo_ShipTo',
  location_id: sharedLocationId,
  locations: {
    id: sharedLocationId,
    location_name:
      '7 HOLLAND VILLAGE WAY, #02-01 SUSHIRO HOLLAND SHOPPING CENTRE, Singapore, 278996',
    street: '7 HOLLAND VILLAGE WAY',
    address: null,
  },
};

const sharedLocationIds = new Set([sharedLocationId]);

assert.equal(
  resolveCustomerLocationStreet(hollandSite, { sharedLocationIds }),
  '7 HOLLAND VILLAGE WAY'
);

const hollandOption = mapCustomerLocationToJobFormOption(hollandSite, sharedLocationIds);
assert.equal(hollandOption.siteId, '#02-01 SUSHIRO HOLLAND SHOPPING CENTRE');
assert.equal(hollandOption.street, '7 HOLLAND VILLAGE WAY');
assert.equal(hollandOption.building, '#02-01 SUSHIRO HOLLAND SHOPPING CENTRE');
assert.equal(hollandOption.zipCode, '278996');

const formPatch = buildJobFormLocationPatch(
  { ...hollandOption, value: hollandOption.siteId },
  { address: {} }
);
assert.equal(formPatch.locationName, '#02-01 SUSHIRO HOLLAND SHOPPING CENTRE');
assert.equal(formPatch.address.streetAddress, '7 HOLLAND VILLAGE WAY');
assert.equal(formPatch.address.buildingNo, '#02-01 SUSHIRO HOLLAND SHOPPING CENTRE');
assert.equal(formPatch.address.postalCode, '278996');

console.log('jobFormLocationOption tests passed');
