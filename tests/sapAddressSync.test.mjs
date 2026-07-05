import assert from 'node:assert/strict';

import {
  formatSapAddressLine,
  resolveSapBuildingLine,
  mergeCustomerLocationRow,
  findExistingLocationRow,
  shouldPreferExistingLocationField,
} from '../lib/integrations/sapAddressLocationHelpers.js';
import { computeAddressChangesForEntity } from '../lib/integrations/sapDeltaSyncAddressPreview.js';
import { formatPortalBpAddressSubtitle } from '../lib/utils/formatPortalBpAddress.js';

// HILLION RESIDENCES — unit in AddressName, empty Building
const hillionSap = {
  AddressName: '#16-24 HILLION RESIDENCES',
  AddressType: 'bo_ShipTo',
  Street: '10 JELEBU ROAD',
  Building: '',
  ZipCode: '677672',
  Country: 'SG',
};

assert.equal(resolveSapBuildingLine(hillionSap), '#16-24 HILLION RESIDENCES');
assert.equal(
  formatSapAddressLine(hillionSap),
  '10 JELEBU ROAD, #16-24 HILLION RESIDENCES, Singapore, 677672'
);

// ION ORCHARD — Building populated
const ionSap = {
  AddressName: '#55-01 ION ORCHARD',
  AddressType: 'bo_ShipTo',
  Street: '2 ORCHARD TURN',
  Building: '#55-01 ION ORCHARD (1 ATICO)',
  ZipCode: '238801',
  Country: 'SG',
};

assert.equal(resolveSapBuildingLine(ionSap), '#55-01 ION ORCHARD (1 ATICO)');
assert.equal(
  formatSapAddressLine(ionSap),
  '2 ORCHARD TURN, #55-01 ION ORCHARD (1 ATICO), Singapore, 238801'
);

// SHAW HOUSE — unit only in AddressName
const shawSap = {
  AddressName: '#03-K1/K2 SHAW HOUSE SUSHIRO ISETAN SCOTTS',
  Street: '350 ORCHARD ROAD',
  Building: '',
  ZipCode: '238868',
  Country: 'SG',
};

assert.equal(
  formatSapAddressLine(shawSap),
  '350 ORCHARD ROAD, #03-K1/K2 SHAW HOUSE SUSHIRO ISETAN SCOTTS, Singapore, 238868'
);

// merge — preserve longer portal address
const existing = {
  address: '350 ORCHARD ROAD, #03-K1/K2 SHAW HOUSE SUSHIRO ISETAN SCOTTS, Singapore, 238868',
  street: '350 ORCHARD ROAD',
  building: '#03-K1/K2 SHAW HOUSE SUSHIRO ISETAN SCOTTS',
};
const incoming = {
  address: '350 ORCHARD ROAD, Singapore, 238868',
  street: '350 ORCHARD ROAD',
  building: '#03-K1/K2 SHAW HOUSE SUSHIRO ISETAN SCOTTS',
  city: null,
  block: null,
  country_name: 'Singapore',
  zip_code: '238868',
  address_type: 'bo_ShipTo',
};

assert.equal(shouldPreferExistingLocationField(existing.address, incoming.address), true);
const merged = mergeCustomerLocationRow(existing, incoming);
assert.equal(merged.address, existing.address);

// ship ` - 1` alias — portal suffix matches SAP site_id
const portalShipSuffix = {
  id: 'loc-1',
  site_id: '#04-10 THE RIVERSIDE PIAZZA - 1',
  address_type: 'bo_ShipTo',
};
const sapShipRow = {
  site_id: '#04-10 THE RIVERSIDE PIAZZA',
  address_type: 'bo_ShipTo',
};
assert.equal(findExistingLocationRow([portalShipSuffix], sapShipRow), portalShipSuffix);

// reverse alias — SAP ship has ` - 1`
const portalShipBase = {
  id: 'loc-2',
  site_id: '#04-10 THE RIVERSIDE PIAZZA',
  address_type: 'bo_ShipTo',
};
const sapShipSuffix = {
  site_id: '#04-10 THE RIVERSIDE PIAZZA - 1',
  address_type: 'bo_ShipTo',
};
assert.equal(findExistingLocationRow([portalShipBase], sapShipSuffix), portalShipBase);

// display fallback for truncated row shape
const truncatedUi = {
  AddressName: '#16-24 HILLION RESIDENCES',
  Street: '10 JELEBU ROAD',
  Building: '',
  BuildingFloorRoom: '',
  ZipCode: '677672',
  Country: 'SG',
  PortalFullAddress: '',
};
assert.equal(
  formatPortalBpAddressSubtitle(truncatedUi),
  '10 JELEBU ROAD, #16-24 HILLION RESIDENCES, Singapore, 677672'
);

// preview — add / update / remove / unchanged
const previewExisting = [
  {
    id: 'bill-1',
    site_id: 'BILL-MAIN',
    address_type: 'bo_BillTo',
    address: '1 BILL STREET, Singapore',
    street: '1 BILL STREET',
    building: null,
    block: null,
    city: null,
    country_name: 'Singapore',
    zip_code: null,
  },
  {
    id: 'ship-old',
    site_id: 'OLD SHIP SITE',
    address_type: 'bo_ShipTo',
    address: '99 OLD ROAD, Singapore',
    street: '99 OLD ROAD',
    building: null,
    block: null,
    city: null,
    country_name: 'Singapore',
    zip_code: null,
  },
];
const previewSap = [
  {
    AddressName: 'BILL-MAIN',
    AddressType: 'bo_BillTo',
    Street: '1 BILL STREET',
    Country: 'SG',
  },
  {
    AddressName: 'NEW SHIP SITE',
    AddressType: 'bo_ShipTo',
    Street: '10 JELEBU ROAD',
    Building: '#16-24 HILLION RESIDENCES',
    ZipCode: '677672',
    Country: 'SG',
  },
];
const previewChanges = computeAddressChangesForEntity(previewExisting, previewSap);
assert.equal(previewChanges.length, 3);
const billChange = previewChanges.find((c) => c.label.startsWith('BILL-MAIN'));
assert.ok(billChange.action === 'unchanged' || billChange.action === 'update');
const shipAdd = previewChanges.find((c) => c.label.startsWith('NEW SHIP SITE'));
assert.equal(shipAdd.action, 'add');
assert.equal(shipAdd.before, null);
const shipRemove = previewChanges.find((c) => c.label.startsWith('OLD SHIP SITE'));
assert.equal(shipRemove.action, 'remove');
assert.equal(shipRemove.after, null);

console.log('sapAddressSync tests passed');
