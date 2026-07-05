# AIFM Open API and SAP alignment (portal)

This document complements the read-only preview at `/dashboard/integrations/aifm-jobs` (`POST /api/integrations/aifm/jobs`). It describes how AI Field Management job payloads map into Supabase and the existing SAP Activity sync.

## Credentials and endpoints

- **Company Api Secret** (AIFM admin) → `AIFM_API_TOKEN`. The portal API calls `POST /api/v1/authorize` with JSON **`secret`** (per AI-FM PDF), then `POST /api/v1/jobs` with **`api_token`** plus dates and **`Authorization: Bearer`**.
- **Base URL:** e.g. APAC `https://apacapiopen.aifieldmanagement.com` (`AIFM_BASE_URL`).
- **Flow:** authorize → Bearer token → `POST /api/v1/jobs` with `start_date` / `end_date` (empty range in AIFM defaults to current day only; use explicit ranges for “latest” windows).

## AIFM → Supabase identifiers (SAP linking)

| AIFM field | Supabase | Notes |
|------------|----------|--------|
| `personal_job_id` | `service_call.call_number` → `jobs.service_call_id` | SAP Service Call # for `ServiceCalls({id})` PATCH and `U_API_JOB_SCHEDULE.U_CallID` |
| `job_po_number` | `sales_order.document_number` → `jobs.sales_order_id` | SAP SO# → `ServiceCallActivities.U_API_PONo` |

Implemented in:

- `lib/integrations/aifmSapIdentifiers.js` — upsert + link
- `pages/api/integrations/aifm/import-jobs.js` — on each import
- `scripts/backfill-aifm-service-call-so.mjs` — `pnpm aifm:backfill-sc-so` for existing jobs

Dry-run (no Supabase writes): `pnpm aifm:backfill-sc-so:dry` or `--dry-run` / `--dryrun` / `-n`

Migration: `lib/supabase/migrations/add_jobs_sales_order_id.sql`

## Recommended import order

1. **Customer:** Resolve or create `customer` (assign-customers / masterlist). Required before `service_call` rows (`customer_id` NOT NULL).
2. **Job:** Import via AIFM integration (identifiers linked automatically when `personal_job_id` / `job_po_number` present).
3. **SAP:** `POST /api/jobs/sync-to-sap` or Jobs list **Sync to SAP** → `syncJobToSAP`.

### Dry-run job sync (mapping audit)

No SAP session required — reads Supabase only:

```bash
pnpm job:sync-sap:dry --job-number=2026-001071
pnpm job:sync-sap:dry --job-id=<uuid> --out=logs/sync-dry-run.txt
pnpm job:sync-sap:dry --job-number=2026-001071 --json
```

API: `POST /api/jobs/sync-to-sap` with `{ "jobId": "…", "dryRun": true }` (SAP cookies not required).

Logs: FSM field → SAP field table + JSON payloads for Activities, `U_API_JOB_SCHEDULE`, `ServiceCalls` PATCH.

## SAP sync order (per job)

1. `POST` or `PATCH` `/b1s/v1/Activities` — portal job + customer (`lib/utils/sapActivityTransform.js`)
2. `POST`/`PATCH` `/b1s/v1/U_API_JOB_SCHEDULE` — schedule row; **`U_CallID` = service call number**, not Activity code (`lib/services/sapJobIncentivePush.js`)
3. `PATCH` `/b1s/v1/ServiceCalls({call_number})` — `ServiceCallActivities` line with `ActivityCode`, `U_API_PONo`, tech list (`lib/services/sapServiceCallJobAssign.js`)

Service call PATCH is skipped (non-fatal) when no `service_call` link or call not found in SAP (404).

## Field mapping (jobs)

| AIFM field | Portal / notes |
|------------|----------------|
| `id` | Idempotency via `[AIFM:<id>]` in `jobs.description` |
| `personal_job_id` | `service_call.call_number` (not `job_number`) |
| `job_po_number` | `sales_order.document_number`; also `PO:` line in description |
| `job_description` | `description` (below markers) |
| `job_priority` | `LOW` / `MEDIUM` / `HIGH` / `URGENT` |
| `status` | Portal `jobs.status` (often SAP numeric id string) |
| `job_start_date` + `job_start_time`, end / duration | `scheduled_start` / `scheduled_end`, `job_schedule` |
| `id_customer`, names | `customer_id`, `[CUSTOMER:…]` tag |
| `assigned_teches` | `technician_jobs` |

## Preview: SAP CardCode column

On `/dashboard/integrations/aifm-jobs`, with **Resolve SAP CardCode** enabled, `POST /api/integrations/aifm/jobs` deduplicates AIFM customer display names and queries SAP `BusinessPartners` with **`CardType eq 'C'`**. Requires portal user + SAP session cookies (`B1SESSION`, `ROUTEID`).

## Enrich from SAP (sql10 / sql05)

After `pnpm aifm:backfill-sc-so`, pull SAP details into Supabase:

```bash
pnpm aifm:enrich-sc-so-sap:dry
# or: pnpm aifm:enrich-sc-so-sap --dry-run
pnpm aifm:enrich-sc-so-sap
pnpm aifm:enrich-sc-so-sap --job=2026-001071
```

| SAP query | ParamList | Updates |
|-----------|-----------|---------|
| `sql10` | `CardCode='…'` | `service_call`: subject, description, `customer_name_sap`, `sap_create_date`, `sap_create_time` |
| `sql05` | `CardCode='…'&ServiceCallID='…'` | `sales_order`: `document_status`, `document_total`, `sap_found` |

Migration: `lib/supabase/migrations/extend_service_call_sales_order_sap_fields.sql`

Requires SAP env login (`SAP_B1_*`) or extend script to use browser cookies.

## Related code

- Identifiers: `lib/integrations/aifmSapIdentifiers.js`
- SAP enrich: `lib/integrations/sapScSoEnrichment.js`, `scripts/enrich-sc-so-from-sap.mjs`
- SAP Activity payload: `lib/utils/sapActivityTransform.js`
- Service Call PATCH: `lib/utils/sapServiceCallTransform.js`, `lib/services/sapServiceCallJobAssign.js`
- Sync orchestration: `lib/services/jobSyncToSap.js`, `pages/api/jobs/sync-to-sap.js`
- Batch unsynced: `pages/api/jobs/sync-hourly.js`, `docs/PHASE2_CRON_SYNC.md`
