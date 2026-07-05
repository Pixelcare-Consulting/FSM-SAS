# Phase 2 – Job sync to SAP: cron and scheduled runs

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|--------|
| `/api/jobs/sync-to-sap` | POST | Sync a **single** job to SAP. Body: `{ "jobId": "<uuid>" }`. Creates or updates the Activity in SAP; requires SAP session cookies. |
| `/api/jobs/sync-hourly` | POST | Sync **many** jobs that have never been synced (`sap_activity_id` is null). Body: `{ "limit": 50 }` (optional; default 50, max 200). Requires SAP session cookies. |

Both require **SAP session cookies** (`B1SESSION`, `ROUTEID`) on the request. These are set when a user logs in to SAP Business One (e.g. via the portal’s SAP login flow).

---

## When sync runs automatically

- **Create Job** (CreateJobs.js): After each job is saved to Supabase, the client calls `POST /api/jobs/sync-to-sap` with the new `jobId` (non-blocking).
- **Edit Job** (EditJobs.js): After the job is updated in Supabase, the client calls `POST /api/jobs/sync-to-sap` with the same `jobId` (non-blocking). If the job already has `sap_activity_id`, SAP is updated via PATCH; otherwise a new Activity is created.
- **Create job from lead** (`POST /api/leads/:leadId/create-job`): After the job is created, the API calls `syncJobToSAP` with the new job id (server-side, same request).

---

## Running sync-hourly (batch of unsynced jobs)

### Option 1: Manual / “Sync to SAP” button

On the Jobs page, a “Sync unsynced to SAP” (or similar) button can call:

```js
fetch('/api/jobs/sync-hourly', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ limit: 50 }),
  credentials: 'include'
});
```

The user must be logged in to SAP so that the request carries the session cookies.

### Option 2: External cron (e.g. every hour)

To run `POST /api/jobs/sync-hourly` on a schedule (e.g. every hour):

1. **With user session:** Use a tool that keeps a session (e.g. browser automation or a dedicated “sync runner” that logs in to SAP and then calls the API). Not ideal for unattended cron.
2. **With technical user (recommended for unattended):**
   - Implement SAP login in `sapService` using a technical user (e.g. `loginWithTechnicalUser()` that returns session cookies).
   - Configure env vars (e.g. `SAP_TECHNICAL_USER`, `SAP_TECHNICAL_PASSWORD`, and any company DB).
   - In a server-side cron job (e.g. Vercel Cron, GitHub Actions, or OS cron):
     - Log in to SAP with the technical user to get cookies.
     - Call `syncJobToSAP` in a loop for each job with `sap_activity_id` null (or call an internal function that does the same as `sync-hourly`), or call your app’s `POST /api/jobs/sync-hourly` with the cookies attached.

Example (pseudo) for a Node cron script:

```js
// 1. Login to SAP (implement in sapService)
const cookies = await sapService.loginWithTechnicalUser();
// 2. Call sync-hourly with those cookies (e.g. internal call or fetch with cookie header)
await syncHourlyWithCookies(cookies, { limit: 100 });
```

### Option 3: Vercel Cron (Pro plan only for hourly)

If the app is on **Vercel Pro** (or Enterprise), add in `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/sync-jobs-to-sap", "schedule": "0 * * * *" }]
}
```

**Hobby plan:** Vercel only allows cron jobs **once per day** ([pricing docs](https://vercel.com/docs/cron-jobs/usage-and-pricing)). Hourly expressions like `0 * * * *` **fail deployment**. Do not use `vercel.json` crons for hourly sync on Hobby.

The cron route is `GET/POST /api/cron/sync-jobs-to-sap` with `CRON_SECRET` (Bearer or `?secret=`). It logs in via `SAP_B1_*` env vars and respects `JOB_SYNC_CRON_*` time window (default 7am–11:59pm Asia/Manila).

### Option 4: External scheduler (free — recommended on Vercel Hobby)

Keep `vercel.json` **without** a `crons` block. Trigger the same endpoint from outside Vercel:

| Method | How |
|--------|-----|
| **GitHub Actions** | `.github/workflows/job-sync-cron.yml` — set repo secrets `CRON_SECRET`, `JOB_SYNC_CRON_BASE_URL` |
| **Script + Task Scheduler** | `node scripts/run-hourly-job-sync-cron.mjs` (Windows Task Scheduler or Linux cron) |
| **cron-job.org / similar** | Hourly HTTP GET to `https://YOUR_APP/api/cron/sync-jobs-to-sap?secret=YOUR_CRON_SECRET` |

Ensure production Vercel env has `CRON_SECRET`, `SAP_B1_*`, and optional `JOB_SYNC_CRON_TZ` / `JOB_SYNC_CRON_START_HOUR` / `JOB_SYNC_CRON_END_HOUR`.

### Option 3 (legacy): sync-hourly path

Older docs referenced `/api/jobs/sync-hourly` in `vercel.json`. Prefer `/api/cron/sync-jobs-to-sap` (server-side SAP login, no user cookies).

```json
{
  "crons": [{ "path": "/api/jobs/sync-hourly", "schedule": "0 * * * *" }]
}
```

The cron request will **not** include user cookies. So you must either:

- Protect the route with a secret (e.g. `CRON_SECRET` header) and **inside the route** perform technical-user login to SAP, then run the same sync logic (recommended), or  
- Not use Vercel Cron for this and use Option 2 or 4 instead (external cron + technical user).

---

## Database

- **jobs:** `sap_activity_id` (SAP Activity id), `last_synced_at` (last successful sync).
- **job_sync_logs:** One row per sync attempt (job_id, direction, action, status, request/response payload, error_message).

Migrations:

- `lib/supabase/migrations/add_jobs_sap_activity_id_and_last_synced.sql`
- `lib/supabase/migrations/create_job_sync_logs_table.sql`

Run these on your Supabase instance before using sync.
