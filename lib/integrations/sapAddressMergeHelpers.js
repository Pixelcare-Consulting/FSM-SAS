import {
  portalLocationCompositeKey,
  sapAddressToLocationRow,
} from './sapAddressLocationHelpers.js';

function addressFieldRichness(addr) {
  if (!addr || typeof addr !== 'object') return 0;
  const fields = [
    addr.AddressName,
    addr.Street,
    addr.Building,
    addr.BuildingFloorRoom,
    addr.Block,
    addr.City,
    addr.ZipCode,
    addr.Country,
    addr.CountryName,
    addr.Address2,
    addr.Address3,
  ];
  return fields.filter((v) => String(v || '').trim()).length;
}

export function sapAddressMergeKey(addr) {
  const row = sapAddressToLocationRow(addr);
  if (!row.site_id) return null;
  return portalLocationCompositeKey(row);
}

/**
 * Union OData BPAddresses and SQL CRD1 rows by site_id + address_type.
 * Prefer the row with more populated fields (SQL is usually richer).
 */
export function mergeSapBpAddressSources(odataRows, sqlRows) {
  const merged = new Map();

  for (const addr of odataRows || []) {
    const key = sapAddressMergeKey(addr);
    if (!key) continue;
    merged.set(key, addr);
  }

  for (const addr of sqlRows || []) {
    const key = sapAddressMergeKey(addr);
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing || addressFieldRichness(addr) >= addressFieldRichness(existing)) {
      merged.set(key, addr);
    }
  }

  return {
    bpAddresses: [...merged.values()],
    meta: {
      odataCount: Array.isArray(odataRows) ? odataRows.length : 0,
      sqlCount: Array.isArray(sqlRows) ? sqlRows.length : 0,
      mergedCount: merged.size,
    },
  };
}
