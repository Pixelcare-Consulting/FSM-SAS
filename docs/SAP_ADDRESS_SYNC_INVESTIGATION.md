# SAP Address Sync — Investigation & Manual Restore

Operational guide for missing Business Partner addresses (e.g. **C003911** `#10-01 ORANGETEE BUILDING`).

## Ghost address

A **ghost address** is an FSM portal Bill/Ship row whose `site_id` + type does not exist in SAP. Example: C003911 shows `#10-01` in FSM but SAP only has `#11-01` — `#10-01` is a ghost.

On the next **successful** delta sync (full SAP OData + CRD1 fetch), ghost rows are **removed from FSM**. Rows with active jobs are kept. FSM does **not** push portal addresses to SAP.

---

## Manual restore in SAP (immediate quotation)

Re-key in SAP Business Partner Master Data for **C003911**:

| Field | Value |
|-------|--------|
| Address ID / Building-Floor-Room | `#10-01 ORANGETEE BUILDING` |
| Street / PO Box | `430 LORONG 6 TOA PAYOH` |
| Zip Code | `319402` |
| Country/Region | Singapore |
| Type | Ship To (add Bill To only if quotation requires it) |

Steps:

1. Open SAP B1 → Business Partner Master Data → **C003911**.
2. **Addresses** tab → add row with values above.
3. Click **Update**.
4. Close and reopen the BP — confirm `#10-01` still appears before creating a quotation.
5. Run delta sync for C003911 so FSM picks up the SAP row.

Use FSM **Service Locations** only as a reference for field values when re-keying in SAP.

---

## Investigation checklist

### 1. Preview sync (no writes)

```http
POST /api/customers/sync-delta
Content-Type: application/json

{ "preview": true, "customerCode": "C003911" }
```

Inspect `preview.items[].addressChanges`. If `#10-01` shows action `remove`, the next real sync will delete that ghost row from **FSM** (not SAP).

### 2. Audit log (Supabase `audit_log`)

Around incident time (2–4 PM SGT):

```sql
SELECT created_at, action, entity_id, description, details
FROM audit_log
WHERE entity_id = 'C003911'
   OR details->>'customerCode' = 'C003911'
ORDER BY created_at DESC
LIMIT 50;
```

Look for `SAP_CUSTOMER_DELTA_SYNC`, `CUSTOMER_UPDATE`.

### 3. Compare SAP vs FSM

**FSM** (`customer_location` for C003911):

```sql
SELECT cl.site_id, cl.address_type, cl.street, cl.building, cl.address
FROM customer_location cl
JOIN customer c ON c.id = cl.customer_id
WHERE c.customer_code = 'C003911';
```

**SAP:** Use preview sync `addressChanges` or Service Layer `fetchBpDetails` (OData + CRD1 merge).

### 4. Scheduled customer delta

Confirm whether `pnpm sync:customers:delta:hourly` runs on production (requires `SYNC_DELTA_CRON_SECRET`). GitHub Actions only runs **job** sync hourly, not customer delta.

---

## Root cause notes

- FSM **does not delete or update** SAP addresses for existing customers.
- SAP losing an address while FSM keeps it usually means SAP-side removal or incomplete save, leaving a ghost in FSM until the next delta sync.
- Inbound sync **can** remove FSM ghost rows when SAP fetch is complete; `skipStaleDeletes` guards against incomplete SAP fetches (OData-only gaps).
