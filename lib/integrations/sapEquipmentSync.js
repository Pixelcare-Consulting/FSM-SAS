/**
 * Sync SAP Customer Equipment Cards (OINS) into portal public.equipments for one customer.
 *
 * SAP READ-ONLY: only GETs CustomerEquipmentCards / Items / ItemGroups / Manufacturers.
 *
 * Match key is item_code + serial_number (SAP InternalSerialNum is only unique per item).
 * Portal rows no longer in SAP are soft-deleted unless a job still references them.
 */

import sapService from '../services/sapService.js';

const SAP_PAGE_SIZE = 500;
const ITEM_LOOKUP_CHUNK = 20;
const TERMINATED_STATUS = 'sns_Terminated';

const CARD_SELECT = [
  'EquipmentCardNum',
  'CustomerCode',
  'ItemCode',
  'ItemDescription',
  'InternalSerialNum',
  'ManufacturerSerialNum',
  'StatusOfSerialNumber',
  'Street',
  'Block',
  'BuildingFloorRoom',
  'ZipCode',
  'U_API_StartWarrantyDate',
  'U_API_ExpiredWarrantyDate',
].join(',');

function escapeODataLiteral(value) {
  return String(value || '').trim().replace(/'/g, "''");
}

function norm(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function equipmentMatchKey(itemCode, serialNumber) {
  return `${norm(itemCode)}::${norm(serialNumber)}`;
}

function toDateOnly(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Follow odata.nextLink until every page is read. */
async function fetchAllPages(endpoint, sessionCookies) {
  const rows = [];
  let next = endpoint;
  while (next) {
    const data = await sapService.makeRequest(
      next,
      { headers: { Prefer: `odata.maxpagesize=${SAP_PAGE_SIZE}` }, quiet: true },
      sessionCookies
    );
    if (Array.isArray(data?.value)) rows.push(...data.value);
    next = data?.['odata.nextLink'] || data?.['@odata.nextLink'] || null;
  }
  return rows;
}

export async function fetchSapEquipmentCardsByCardCode(cardCode, sessionCookies) {
  const code = escapeODataLiteral(cardCode);
  if (!code || !sessionCookies) return [];
  const filter = encodeURIComponent(`CustomerCode eq '${code}'`);
  return fetchAllPages(
    `CustomerEquipmentCards?$select=${CARD_SELECT}&$filter=${filter}`,
    sessionCookies
  );
}

/**
 * Item group / brand names for the given item codes. Lookup tables are cached on `cache`
 * so a multi-customer sync only reads ItemGroups / Manufacturers once.
 */
async function fetchItemMeta(itemCodes, sessionCookies, cache) {
  if (!cache.groups) {
    const groups = await fetchAllPages('ItemGroups?$select=Number,GroupName', sessionCookies);
    cache.groups = new Map(groups.map((g) => [g.Number, g.GroupName]));
  }
  if (!cache.manufacturers) {
    const mfrs = await fetchAllPages('Manufacturers?$select=Code,ManufacturerName', sessionCookies);
    cache.manufacturers = new Map(mfrs.map((m) => [m.Code, m.ManufacturerName]));
  }
  cache.items = cache.items || new Map();

  const missing = [...new Set(itemCodes.filter(Boolean))].filter((c) => !cache.items.has(c));
  for (let i = 0; i < missing.length; i += ITEM_LOOKUP_CHUNK) {
    const chunk = missing.slice(i, i + ITEM_LOOKUP_CHUNK);
    const filter = encodeURIComponent(
      chunk.map((c) => `ItemCode eq '${escapeODataLiteral(c)}'`).join(' or ')
    );
    const items = await fetchAllPages(
      `Items?$select=ItemCode,ItemName,ItemsGroupCode,Manufacturer&$filter=${filter}`,
      sessionCookies
    );
    for (const item of items) {
      cache.items.set(item.ItemCode, {
        itemName: item.ItemName || null,
        itemGroup: cache.groups.get(item.ItemsGroupCode) || null,
        brand: cache.manufacturers.get(item.Manufacturer) || null,
      });
    }
    // Remember misses so they are not re-queried for every customer.
    for (const c of chunk) if (!cache.items.has(c)) cache.items.set(c, null);
  }

  return cache.items;
}

function equipmentLocationFromCard(card) {
  const parts = [card.Street, card.Block, card.BuildingFloorRoom, card.ZipCode]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** Columns SAP owns; portal-only fields (equipment_type, notes) are left untouched on update. */
function equipmentRowFromCard(card, itemMeta) {
  const meta = itemMeta?.get(card.ItemCode) || null;
  return {
    item_code: String(card.ItemCode || '').trim(),
    serial_number: String(card.InternalSerialNum || '').trim() || null,
    item_name:
      String(card.ItemDescription || '').trim() || meta?.itemName || String(card.ItemCode).trim(),
    model_series: String(card.ManufacturerSerialNum || '').trim() || null,
    item_group: meta?.itemGroup || null,
    brand: meta?.brand || null,
    equipment_location: equipmentLocationFromCard(card),
    warranty_start_date: toDateOnly(card.U_API_StartWarrantyDate),
    warranty_end_date: toDateOnly(card.U_API_ExpiredWarrantyDate),
  };
}

/** SAP values win when present; a blank SAP field never wipes an existing portal value. */
function buildUpdatePatch(existing, next) {
  const patch = {};
  for (const [k, v] of Object.entries(next)) {
    if (v == null) continue;
    if ((existing[k] ?? null) !== v) patch[k] = v;
  }
  return patch;
}

async function fetchEquipmentIdsLinkedToJobs(supabase, equipmentIds) {
  const linked = new Set();
  for (let i = 0; i < equipmentIds.length; i += 200) {
    const { data, error } = await supabase
      .from('job_equipments')
      .select('equipment_id')
      .in('equipment_id', equipmentIds.slice(i, i + 200));
    if (error) throw new Error(`job_equipments lookup: ${error.message}`);
    for (const r of data || []) linked.add(r.equipment_id);
  }
  return linked;
}

/**
 * Read-only diff of SAP equipment cards vs portal rows for one customer. Shared by the sync
 * (which applies it) and the delta-sync preview (which only reports it).
 */
async function planCustomerEquipmentSync(supabase, customerId, cardCode, sessionCookies, cache) {
  const cards = (await fetchSapEquipmentCardsByCardCode(cardCode, sessionCookies)).filter(
    (c) => c?.ItemCode && c.StatusOfSerialNumber !== TERMINATED_STATUS
  );

  const itemMeta = cards.length
    ? await fetchItemMeta(
        cards.map((c) => c.ItemCode),
        sessionCookies,
        cache
      )
    : null;

  const { data: existingRows, error: selErr } = await supabase
    .from('equipments')
    .select(
      'id, item_code, serial_number, item_name, model_series, item_group, brand, equipment_location, warranty_start_date, warranty_end_date'
    )
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .range(0, 9999);
  if (selErr) throw new Error(`equipments select: ${selErr.message}`);

  // First row per key wins; later duplicates (old job-form bug) are left alone.
  const existingByKey = new Map();
  for (const row of existingRows || []) {
    const key = equipmentMatchKey(row.item_code, row.serial_number);
    if (!existingByKey.has(key)) existingByKey.set(key, row);
  }

  const inserts = [];
  const updates = [];
  const seenKeys = new Set();

  for (const card of cards) {
    const next = equipmentRowFromCard(card, itemMeta);
    const key = equipmentMatchKey(next.item_code, next.serial_number);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const existing = existingByKey.get(key);
    if (!existing) {
      inserts.push({ customer_id: customerId, ...next });
      continue;
    }
    const patch = buildUpdatePatch(existing, next);
    if (Object.keys(patch).length > 0) updates.push({ key, existing, patch });
  }

  // An empty SAP result is not trusted for removals (mirrors location sync's stale-delete guard).
  const stale = cards.length
    ? (existingRows || []).filter(
        (row) => !seenKeys.has(equipmentMatchKey(row.item_code, row.serial_number))
      )
    : [];
  const linked = stale.length
    ? await fetchEquipmentIdsLinkedToJobs(
        supabase,
        stale.map((r) => r.id)
      )
    : new Set();

  return {
    sapCards: cards.length,
    inserts,
    updates,
    removals: stale.filter((r) => !linked.has(r.id)),
    keptLinked: stale.filter((r) => linked.has(r.id)),
  };
}

function equipmentChangeLabel(row) {
  return {
    itemCode: row.item_code || null,
    serialNumber: row.serial_number || null,
    itemName: row.item_name || null,
  };
}

/**
 * Dry run of `syncCustomerEquipmentsFromSap` — reads SAP + Supabase only, no writes.
 *
 * @returns {Promise<{ sapCards: number, toInsert: number, toUpdate: number, toRemove: number, keptLinked: number, changes: object[] }>}
 */
export async function previewCustomerEquipmentChanges(
  supabase,
  customerId,
  cardCode,
  sessionCookies,
  { cache = {} } = {}
) {
  const result = { sapCards: 0, toInsert: 0, toUpdate: 0, toRemove: 0, keptLinked: 0, changes: [] };
  if (!customerId || !cardCode || !sessionCookies) return result;

  const plan = await planCustomerEquipmentSync(supabase, customerId, cardCode, sessionCookies, cache);
  result.sapCards = plan.sapCards;
  result.toInsert = plan.inserts.length;
  result.toUpdate = plan.updates.length;
  result.toRemove = plan.removals.length;
  result.keptLinked = plan.keptLinked.length;
  result.changes = [
    ...plan.inserts.map((row) => ({ action: 'add', ...equipmentChangeLabel(row) })),
    ...plan.updates.map(({ existing, patch }) => ({
      action: 'update',
      ...equipmentChangeLabel(existing),
      fields: Object.keys(patch),
    })),
    ...plan.removals.map((row) => ({ action: 'remove', ...equipmentChangeLabel(row) })),
  ];
  return result;
}

/** True when the preview found equipment the sync would write (job-linked keeps excluded). */
export function hasEquipmentChanges(equipmentChanges) {
  if (!equipmentChanges) return false;
  return (
    (equipmentChanges.toInsert || 0) + (equipmentChanges.toUpdate || 0) + (equipmentChanges.toRemove || 0) > 0
  );
}

/**
 * @param {object} supabase
 * @param {string} customerId portal customer.id
 * @param {string} cardCode SAP CardCode
 * @param {object} sessionCookies SAP session
 * @param {{ cache?: object }} [options] share `cache` across customers in one sync run
 * @returns {Promise<{ sapCards: number, inserted: number, updated: number, removed: number, keptLinked: number }>}
 */
export async function syncCustomerEquipmentsFromSap(
  supabase,
  customerId,
  cardCode,
  sessionCookies,
  { cache = {} } = {}
) {
  const result = { sapCards: 0, inserted: 0, updated: 0, removed: 0, keptLinked: 0 };
  if (!customerId || !cardCode || !sessionCookies) return result;

  const plan = await planCustomerEquipmentSync(supabase, customerId, cardCode, sessionCookies, cache);
  result.sapCards = plan.sapCards;
  result.keptLinked = plan.keptLinked.length;
  const now = new Date().toISOString();

  for (const { key, existing, patch } of plan.updates) {
    const { error } = await supabase
      .from('equipments')
      .update({ ...patch, updated_at: now })
      .eq('id', existing.id);
    if (error) throw new Error(`equipments update ${key}: ${error.message}`);
    result.updated++;
  }

  for (let i = 0; i < plan.inserts.length; i += 500) {
    const chunk = plan.inserts.slice(i, i + 500);
    const { error } = await supabase.from('equipments').insert(chunk);
    if (error) throw new Error(`equipments insert: ${error.message}`);
    result.inserted += chunk.length;
  }

  const toRemove = plan.removals.map((r) => r.id);
  for (let i = 0; i < toRemove.length; i += 200) {
    const ids = toRemove.slice(i, i + 200);
    const { error } = await supabase
      .from('equipments')
      .update({ deleted_at: now, updated_at: now })
      .in('id', ids);
    if (error) throw new Error(`equipments soft-delete: ${error.message}`);
    result.removed += ids.length;
  }

  return result;
}
