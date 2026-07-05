# SAP Address Loss Investigation (C003911 / #10-01)

Operational guide for investigating missing SAP Business Partner addresses when FSM portal still shows the site.

**Incident reference:** Customer `C003911` — SAP lost `#10-01 ORANGETEE BUILDING` while FSM portal retained it (Ship To, notes "CLOSED 5.30PM"). This is a **ghost address**: a portal row that no longer exists in SAP.

---

## What FSM does (and does not do)

- **Inbound:** SAP → FSM via `POST /api/customers/sync-delta` and `fetchBpDetails` in `lib/integrations/aifmSapMasterlistSync.js`.
- FSM **does not write** SAP CRD1 rows (no `updateBusinessPartner` for addresses). SAP-side loss is manual edit, another integration, or SAP validation — not portal sync deleting SAP.
- **Ghost cleanup:** On delta sync, when SAP fetch is complete (OData + SQL CRD1 merge), portal Bill/Ship rows **not present in SAP** are removed from FSM. Rows linked to active jobs are kept.

---

## Ghost address definition

A **ghost address** is a `customer_location` Bill/Ship row in FSM whose `site_id` + `address_type` composite key does not appear in SAP after a full address fetch.

Example: C003911 shows `#10-01` in the portal but SAP only has `#11-01` addresses — `#10-01` is a ghost and will be deleted on the next successful delta sync (unless it has active jobs).

---

## Phase 1 — Investigation checklist (production / staging)

Run these with live SAP credentials (`SAP_B1_*` env vars or browser SAP session).

### 1. Preview sync (no writes)

```http
POST /api/customers/sync-delta
Content-Type: application/json

{
  "preview": true,
  "customerCode": "C003911"
}
```

Inspect `preview.items[].addressChanges` (from `lib/integrations/sapDeltaSyncAddressPreview.js`):

| `action` | Meaning |
|----------|---------|
| `remove` | Next real sync would **delete** that row from **FSM** (ghost cleanup) |
| `add` | SAP has address FSM lacks |
| `update` | Field drift between SAP and FSM |

If `#10-01` shows `remove`, the next real sync will clean up the ghost (when SAP fetch is complete).

### 2. Audit log query

Around incident window (e.g. 2–4 PM SGT on incident date):

```sql
SELECT created_at, action, entity_id, status, details
FROM audit_log
WHERE entity_id = 'C003911'
   OR (details->>'customerCode') = 'C003911'
ORDER BY created_at DESC
LIMIT 50;
```

Look for:

- `SAP_CUSTOMER_DELTA_SYNC` — delta import ran (check `details.removedLabels` for deleted ghosts)
- `CUSTOMER_UPDATE` — portal location edits

### 3. Compare SAP vs Supabase

**SAP (Service Layer + CRD1):**

- OData: `GET BusinessPartners('C003911')?$select=CardCode,CardName,BPAddresses`
- SQL CRD1: via `sapService.getBusinessPartnerAddresses('C003911', cookies)` — full Bill/Ship list

**FSM:**

```sql
SELECT cl.site_id, cl.address_type, cl.street, cl.building, cl.address, cl.zip_code,
       cad.address_notes, cad.status
FROM customer c
JOIN customer_location cl ON cl.customer_id = c.id
LEFT JOIN customer_address_details cad ON cad.customer_location_id = cl.id
WHERE c.customer_code = 'C003911'
ORDER BY cl.address_type, cl.site_id;
```

### 4. Confirm schedulers

- Hourly customer delta: `pnpm sync:customers:delta:hourly` or cron with `SYNC_DELTA_CRON_SECRET` (Render/Vercel/server — **not** in GitHub Actions by default).
- GitHub Actions `job-sync-cron.yml` (3:05 PM SGT) syncs **jobs only**, not BP addresses.

---

## Manual SAP restore — re-key `#10-01` (urgent quotation)

If a quotation requires `#10-01` in SAP, re-key it manually in SAP Business Partner Master Data. FSM will **not** push portal addresses to SAP.

1. Open **SAP B1 → Business Partner Master Data** for **C003911**.
2. Add address row:
   - **Address ID / Building-Floor-Room:** `#10-01 ORANGETEE BUILDING`
   - **Street:** `430 LORONG 6 TOA PAYOH`
   - **Zip:** `319402`
   - **Country:** Singapore
   - **Type:** Ship To (add Bill To only if quotation requires it)
3. Click **Update**.
4. Close and re-open the BP — confirm `#10-01` persists before quoting.
5. Run delta sync for C003911 — FSM will add the row from SAP.

---

## Phase 2 — Code hardening (implemented)

| Fix | File |
|-----|------|
| Merge OData + SQL CRD1 in `fetchBpDetails` | `lib/integrations/aifmSapMasterlistSync.js` |
| Dedupe guards (skip ghost deletes when SAP fetch incomplete) | same |
| Ghost cleanup (remove portal rows not in SAP; job-linked rows protected) | same |
| Sync audit location summary | `pages/api/customers/sync-delta.js` |

---

## Local investigation blockers

Preview sync and SAP CRD1 queries require:

- Valid `SAP_B1_*` environment variables **or** authenticated browser SAP session (`B1SESSION` cookie)
- Access to production/staging SAP company DB where `C003911` exists

Without credentials, use the SQL/API checks above on the target environment only.
