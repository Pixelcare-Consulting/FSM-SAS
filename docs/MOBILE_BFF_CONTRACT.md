# Mobile BFF contract

Field app clients must call this portal’s `/api/v1/field/*` (and login) instead of writing/reading FSM data directly via the Supabase SDK. Attribution uses `X-Client-Source` so slow requests show as `source=mobile` vs `web` in portal `api_timing` logs.

Related: [`MOBILE_TECHNICIAN_LABOR_CONTRACT.md`](./MOBILE_TECHNICIAN_LABOR_CONTRACT.md), [`WORKFLOW.md`](./WORKFLOW.md) (job completed email), [`SUPABASE_RESOURCE_MONITORING.md`](./SUPABASE_RESOURCE_MONITORING.md).

## Base URL

Use the deployed portal origin (same host as the web portal), e.g. `https://<portal-host>`, with the versioned prefix **`/api/v1/field`**. Breaking changes later will ship as `/api/v2/field/*` beside v1; do not call unversioned `/api/field/*` (it does not exist).

## Auth

1. Prefer `POST /api/v1/field/login` with `{ email, password }` and `X-Client-Source: mobile`.
   - **Technician-only:** returns `403` with `No technician profile for this user` when the account has no technician row (office/admin users cannot field-login).
   - Legacy `POST /api/login` still accepts the same payload and returns the same `sessionId` / `user` shape (no technician requirement) for older clients.
2. Response includes:
   - `sessionId` — portal single-device session (store securely)
   - `user.uid` — public `users.id`
   - `user.technicianId` — technician row id (always present after successful field login)
3. On every authenticated `/api/v1/field/*` request send:
   - `Authorization: Bearer <sessionId>`
   - `X-Uid: <uid>`
   - `X-Client-Source: mobile`
4. Prefer `POST /api/v1/field/logout` with Bearer + `X-Uid` (+ `X-Client-Source: mobile`) to clear `users.current_session_id`. Also clear stored tokens client-side. Legacy `POST /api/logout` works for cookie clients; it also accepts Bearer + `X-Uid`.
5. Cookie auth (`uid` + `sessionId`) still works for same-origin web; mobile should prefer Bearer + `X-Uid`.

Session is validated against `users.current_session_id` (single device). A new login elsewhere invalidates the previous session (401).

**Web-only:** root `proxy.js` + `@supabase/ssr` refreshes **Supabase Auth JWT cookies** on portal page navigations. That is not DB connection pooling, and it does **not** apply to `/api/v1/field/*`. Mobile must keep Bearer + `X-Uid`; do not depend on browser Auth cookie refresh. Portal API authority remains `requireSession` (see [`SUPABASE_RESOURCE_MONITORING.md`](./SUPABASE_RESOURCE_MONITORING.md) — “Session clients vs DB pooling”).

### Verify with curl (mobile headers)

```bash
# Login (field) → store sessionId + user.uid (+ technicianId)
curl -s -X POST "https://<portal-host>/api/v1/field/login" \
  -H "Content-Type: application/json" \
  -H "X-Client-Source: mobile" \
  -d '{"email":"<email>","password":"<password>"}'

curl -s "https://<portal-host>/api/v1/field/jobs" \
  -H "Authorization: Bearer <sessionId>" \
  -H "X-Uid: <uid>" \
  -H "X-Client-Source: mobile"

# Logout
curl -s -X POST "https://<portal-host>/api/v1/field/logout" \
  -H "Authorization: Bearer <sessionId>" \
  -H "X-Uid: <uid>" \
  -H "X-Client-Source: mobile"
```

Use a **technician user that has live assignments**. Opening the URL alone in a browser uses whoever is cookie-logged into the portal — often an office account with zero field assignments → `{ "jobs": [], "meta": { "assignmentCount": 0, ... } }`, which is a successful auth + empty list, not a missing route.

### CORS

Set server env `MOBILE_CORS_ORIGINS` to a comma-separated allowlist of mobile origins (e.g. `capacitor://localhost,https://app.example.com`). Preflight `OPTIONS` is handled on `/api/v1/field/*` (including `login` / `logout`) and `/api/login`.

## Headers (every field call)

| Header | Value |
|--------|--------|
| `Authorization` | `Bearer <sessionId>` |
| `X-Uid` | `<uid>` from login |
| `X-Client-Source` | `mobile` |
| `Content-Type` | `application/json` (POST bodies) |

## Endpoints

### `POST /api/v1/field/assignments/start`

Start work on an assignment (labor contract: first `started_at` only).

```json
{ "technicianJobId": "<uuid>", "startedAt": "<ISO optional>" }
```

Sets `assignment_status=STARTED`. Does not overwrite existing `started_at`.

### `POST /api/v1/field/assignments/accumulate-hours`

Multi-day session end — add hours without completing.

```json
{ "technicianJobId": "<uuid>", "sessionHours": 2.5 }
```

Increments `accumulated_hours`. Does **not** set `completed_at`.

### `POST /api/v1/field/assignments/complete`

Complete assignment + optional signature + job status/email path (replaces separate Supabase write + `technician-complete`).

```json
{
  "technicianJobId": "<uuid>",
  "completedAt": "<ISO optional>",
  "signature": {
    "signatureImageUrl": "https://...",
    "customerName": "Jane Doe",
    "customerFeedback": "optional",
    "signedAt": "<ISO optional>"
  }
}
```

- Sets `assignment_status=COMPLETED` and `completed_at` (labor rule: never set `completed_at` unless COMPLETED).
- Upserts `job_signatures` when `signature` is present.
- Runs the same completion/email flow as `POST /api/jobs/[jobId]/technician-complete`.

### `POST /api/v1/field/signatures`

Signature-only upsert (ownership checked). Prefer bundling signature into `assignments/complete` when finishing a job.

```json
{
  "technicianJobId": "<uuid>",
  "signatureImageUrl": "https://...",
  "customerName": "Jane Doe",
  "customerFeedback": "optional",
  "signedAt": "<ISO optional>"
}
```

### `GET /api/v1/field/jobs?from=&to=&limit=`

Slim list of jobs assigned to the authenticated technician. Optional ISO `from` / `to` filter on `jobs.scheduled_start`. Max `limit` 200 (default 100).

Response shape:

```json
{
  "jobs": [{ "assignment": {}, "job": {} }],
  "meta": {
    "technicianId": "<uuid>",
    "assignmentCount": 0,
    "matchedJobCount": 0
  }
}
```

- `assignmentCount` — non-deleted `technician_jobs` rows for this tech (before date filter drops jobs).
- `matchedJobCount` — length of `jobs` after joining live jobs and applying `from`/`to`.
- Empty `jobs` with `assignmentCount: 0` means authenticated tech has no assignments (not a dead route).

### `GET /api/v1/field/jobs/[jobId]`

Slim job + this technician’s assignment (+ signature meta). `jobId` may be UUID or `job_number`. Returns 403 if not assigned.

## Tables mobile must stop touching client-side

| Table / columns | Use instead |
|-----------------|-------------|
| `technician_jobs` labor fields (`started_at`, `completed_at`, `accumulated_hours`, `assignment_status` for start/complete) | `/api/v1/field/assignments/*` |
| `job_signatures` inserts | `/api/v1/field/signatures` or `assignments/complete` |
| Job list/detail reads for the field tech | `/api/v1/field/jobs*` |

Realtime / Auth: mobile **may** still use Supabase Auth for token refresh if desired, but **data** CRUD for the above goes through the BFF. Offline queues should target `/api/v1/field/*` when online.

Do **not** use a generic PostgREST proxy through this portal.

## Migration order (mobile repo)

1. Ship portal (this release) with instrumentation + field endpoints.
2. Switch **writes** first: start → accumulate-hours → signatures → complete (highest diagnostic value).
3. Switch **reads** to `GET /api/v1/field/jobs*`.
4. Confirm direct mobile anon/`rest` traffic drops in Supabase API logs; triage slowness with portal logs (`source=mobile`).

## Example `api_timing` log

```json
{"type":"api_timing","source":"mobile","path":"/api/v1/field/assignments/complete","method":"POST","status":200,"ms":342,"uid":"..."}
```

Correlate with Supabase Query Performance by **timestamp + table shape** (`technician_jobs`, `job_signatures`, `jobs`).
