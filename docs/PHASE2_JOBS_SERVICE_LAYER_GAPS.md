# Phase 2 – What’s Done vs Not Done

Based on the Phase 2 plan and the **SAP Jobs Service Layer** (Postman: `POST /b1s/v1/Activities`, `PATCH`, `GET Job List`).

---

## 1. Customers (CRUD)

| Item | Status | Notes |
|------|--------|------|
| **Create Customer** | ✅ Done | Form at `/customers/create`, `POST /api/customers/create` → SAP `BusinessPartners`. Create Customer button in Customers page header. |
| **Read / List** | ✅ Done | Customers list from SAP; view customer detail. |
| **Update Customer** | ❌ Not done | No portal flow that calls SAP `PATCH BusinessPartners('{CardCode}')`. |
| **Delete Customer** | ❌ Not done | No SAP delete/inactivate for customers. |

---

## 2. SAP Jobs Service Layer (Activities API) – **Integrated**

Postman uses:

- **POST** `{{BaseURL}}/b1s/v1/Activities` – Create Job  
- **PATCH** – Patch Job (update)  
- **GET** – Job List  

**Current state:**

- `lib/services/sapService.js` has **Activities** endpoints: `createActivity`, `updateActivity`, `getActivities`, `getActivity`.
- **Create Job** in the portal (CreateJobs.js, create-job from lead) saves to Supabase and calls **POST /api/jobs/sync-to-sap** → SAP `POST /b1s/v1/Activities`.
- **Edit Job** (EditJobs.js) updates Supabase and calls **POST /api/jobs/sync-to-sap** → SAP PATCH when `sap_activity_id` exists.
- **Mapping:** `lib/utils/sapActivityTransform.js` maps portal job + customer to SAP Activity body (CardCode, Details, Notes, StartDate/Time, EndDueDate/EndTime, Priority, U_API_JobStatus, etc.).

| Item | Status |
|------|--------|
| Add to `sapService.js`: `createActivity`, `updateActivity`, `getActivities` | ✅ Done |
| When creating a job in portal → also call SAP `POST /b1s/v1/Activities` | ✅ Done |
| When editing a job in portal → call SAP Job Update (PATCH) API | ✅ Done |
| Map portal job fields to SAP body | ✅ Done |

---

## 3. Hourly Job Sync (PXC FSM → SAP DB)

| Task | Status |
|------|--------|
| **a) Toggle / button on Jobs page for Sync to SAP** | ✅ Done (Sync unsynced jobs button; optional Auto Sync toggle can be added) |
| **b) DB column on `jobs`** (`sap_activity_id`, `last_synced_at`) | ✅ Done (migration: `add_jobs_sap_activity_id_and_last_synced.sql`) |
| **c) Table for syncing logs** (`job_sync_logs`) | ✅ Done (migration: `create_job_sync_logs_table.sql`) |
| **d) Mapping PXC FSM DB ↔ SAP field names** | ✅ Done (`lib/utils/sapActivityTransform.js`) |
| **e) Automated syncing function** | ✅ Done (`POST /api/jobs/sync-hourly`; see Cron below) |
| **f) Test and verify sync completion** | Pending |
| **Mobile app** | TBA |

---

## 4. Edit Job → SAP Job Update API (Phase 2.c)

| Task | Status |
|------|--------|
| On save edited job → call SAP PATCH | ✅ Done (EditJobs.js calls `/api/jobs/sync-to-sap` after update) |
| SAP Job Update (PATCH) API with updated job data | ✅ Done |

---

## 5. Cron / scheduled job sync

- **Endpoint:** `POST /api/jobs/sync-hourly`  
  Body: `{ "limit": 50 }` (optional; default 50, max 200).  
  Syncs jobs where `sap_activity_id` is null (never synced). Requires SAP session cookies.

- **For hourly cron:** Call this endpoint from a scheduler (e.g. Vercel Cron, external cron). The endpoint requires SAP session cookies. Options:
  1. **User-context:** Run the sync from a browser or tool that is logged in to SAP (e.g. “Sync to SAP” button on Jobs page that calls this API).
  2. **Technical user:** Implement SAP login with a technical user in `sapService` (e.g. `loginWithTechnicalUser()`), obtain session cookies, then call `syncJobToSAP` / sync-hourly from a server-side cron. Document the env vars (e.g. `SAP_TECHNICAL_USER`, `SAP_TECHNICAL_PASSWORD`) and cron schedule.

See `docs/PHASE2_CRON_SYNC.md` for cron usage details.

---

## Summary checklist

- [x] **Customers:** Create (form + API + button); Read/List  
- [ ] **Customers:** Update/Delete to SAP  
- [x] **SAP Activities API:** create/update/get in `sapService.js`  
- [x] **Create Job:** After saving to Supabase, call SAP `POST /b1s/v1/Activities`  
- [x] **Edit Job:** On save, call SAP PATCH Job Update API  
- [x] **Hourly Job Sync:** DB columns, sync logs table, mapping, sync-hourly API; optional toggle/button on Jobs page  

Recommended next: **Customers Update/Delete** to SAP; **technical user login** for unattended cron if needed.
