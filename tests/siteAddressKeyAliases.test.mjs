import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAddressDetailsMaps } from '../lib/customers/addressDetailsMaps.js';
import { resolveCustomerAddressDetailRow } from '../lib/utils/siteAddressKeyAliases.js';

test('buildAddressDetailsMaps keys by address_name and customer_location_id', () => {
  const locId = '11111111-1111-1111-1111-111111111111';
  const { data, dataByCustomerLocationId } = buildAddressDetailsMaps([
    {
      id: 'a1',
      address_name: '82 COLLYER QUAY, 049327, S',
      address_type: 'S',
      address_notes: 'Gate code 1234',
      customer_location_id: locId,
    },
  ]);

  assert.equal(dataByCustomerLocationId[locId].address_notes, 'Gate code 1234');
  assert.ok(Object.keys(data).length > 0);
});

test('resolveCustomerAddressDetailRow prefers PortalLocationId FK', () => {
  const locId = '22222222-2222-2222-2222-222222222222';
  const { data, dataByCustomerLocationId } = buildAddressDetailsMaps([
    {
      id: 'a2',
      address_name: 'other-key',
      address_notes: 'FK match',
      customer_location_id: locId,
    },
  ]);

  const row = resolveCustomerAddressDetailRow(data, dataByCustomerLocationId, {
    PortalLocationId: locId,
    AddressName: 'unrelated',
  });

  assert.equal(row.address_notes, 'FK match');
});

test('resolveCustomerAddressDetailRow falls back to PortalFullAddress keys', () => {
  const siteKey = '82 COLLYER QUAY, MONTI AT 1-PAVILION ITALIAN RESTAURANT, Singapore, 049327';
  const { data, dataByCustomerLocationId } = buildAddressDetailsMaps([
    {
      id: 'a3',
      address_name: siteKey,
      address_type: 'S',
      address_notes: 'Notes via full address',
    },
  ]);

  const row = resolveCustomerAddressDetailRow(data, dataByCustomerLocationId, {
    AddressName: '',
    PortalFullAddress: siteKey,
    AddressType: 'bo_ShipTo',
  });

  assert.equal(row.address_notes, 'Notes via full address');
});
