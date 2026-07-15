# Supabase Resource Monitoring & Safe Rollout

Operational checklist for reducing Supabase load spikes, rolling out database changes safely, and verifying improvements after deploy.

## Index DDL — Off-Peak Rollout Checklist

Run index creation during low-traffic windows (evenings/weekends, Singapore time). Avoid applying heavy DDL during active business hours.

### Before rollout

- [ ] Export a baseline log sample: **Dashboard → Logs → API** (or Postgres), save as `docs/supabase_logs.csv`
- [ ] Note current **Query Performance** top queries and p95 latency
- [ ] Confirm no other migrations or index builds are in flight
- [ ] Prepare batched `CREATE INDEX CONCURRENTLY` statements (one index per statement)

### Batch GIN / pg_trgm indexes

- [ ] Apply indexes in **small batches** (1–2 indexes per batch), not all at once
- [ ] Always use `CREATE INDEX CONCURRENTLY` on production tables with live traffic
- [ ] Wait for each index build to finish (`pg_stat_progress_create_index`) before starting the next
- [ ] **Monitor between batches**: CPU, active connections, and API error rate for 5–15 minutes
- [ ] If CPU or connection count spikes, pause until metrics normalize

### After rollout

- [ ] Run `ANALYZE` on affected tables if the planner does not pick up new indexes promptly
- [ ] Re-check Query Performance for improved scan types (index scans vs seq scans)

> **Lesson learned:** `pg_trgm` GIN indexes were once applied on production **during traffic**, which caused a measurable spike in connections and CPU. **Do not repeat** — schedule all trigram/GIN index work off-peak with `CONCURRENTLY` and batch pauses.

---

## Performance Composite Indexes & RLS Fix (2026-07)

Migration files (apply manually in Supabase SQL editor — **do not run during business hours**):

| Order | File | Purpose |
|-------|------|---------|
| 1 | `lib/supabase/migrations/add_performance_composite_indexes.sql` | 10 composite/partial indexes for jobs list, notifications, scheduler, address details |
| 2 | `lib/supabase/migrations/fix_rls_auth_initplan.sql` | `company_memos` RLS: `(select auth.uid())` initplan fix |

### Off-peak rollout steps

1. Export baseline: **Dashboard → Logs → API** (or Postgres) → save as `docs/supabase_logs.csv`
2. Note **Query Performance** top queries and p95 latency (especially jobs list, notifications, scheduler)
3. Confirm no other index builds or migrations are in flight
4. Run **one** `CREATE INDEX CONCURRENTLY` statement from `add_performance_composite_indexes.sql` at a time (Supabase SQL editor does not wrap in a transaction — paste one statement per execution)
5. Wait for each build to finish (`SELECT * FROM pg_stat_progress_create_index;`) before starting the next
6. Pause **5–15 minutes** between batches; monitor CPU, active connections, and API error rate
7. After all 10 indexes complete, run:

```sql
ANALYZE jobs;
ANALYZE notifications;
ANALYZE technician_jobs;
ANALYZE job_schedule;
ANALYZE customer_location;
ANALYZE customer_address_details;
```

8. Re-open **Dashboard → Reports → Query Performance** and confirm the top `pgrst` `jobs` window query (scheduled_end) and notifications list drop in share / mean latency.

9. Run `fix_rls_auth_initplan.sql` in full (policy DDL is lightweight; safe off-peak)

Suggested batch groupings (pause between batches):

- **Batch A:** `idx_jobs_active_sched_start_created_at`, `idx_jobs_active_sched_end_start`, `idx_jobs_active_undated_created_at`
- **Batch B:** `idx_notifications_worker_hidden_created_at`, `idx_notifications_broadcast_hidden_created_at`, `idx_notifications_worker_hidden_read`
- **Batch C:** `idx_technician_jobs_job_id_active`, `idx_job_schedule_job_id_jsdate`, `idx_customer_location_customer_id_id`
- **Batch D:** `idx_customer_address_details_customer_location_id` (skip if already created by the FK migration)

### Post-deploy verification checklist

- [ ] Re-export logs to `docs/supabase_logs.csv` (same filters as baseline)
- [ ] Compare busiest-second request counts (group by second on `timestamp`)
- [ ] **Query Performance:** jobs list query uses index scan on `idx_jobs_active_sched_start_created_at`; reduced `temp_blks_written`
- [ ] **Query Performance:** notifications path uses `worker_id + hidden + created_at`; lower `shared_blks`
- [ ] **Query Performance:** scheduler chunk queries benefit from `technician_jobs` / `job_schedule` / `customer_location` indexes
- [ ] Grep exported logs: no `jobs?...limit=2000` on `/rest/v1/jobs` (overview should use `dashboard_overview_periods_json` RPC)
- [ ] **Smoke test:** login → dashboard → notifications bell → jobs list (default date browse) → scheduler week view
- [ ] Confirm overview charts load via `periods.Today` without slim-jobs fallback warnings in server logs
- [ ] **RLS:** company memos insert (admin) and update (creator / non-restricted) still work from the portal

---

## Post-Deploy Verification

After app or database changes that target request volume or query cost:

1. **Re-export logs** from Supabase (same time window and filters as baseline) to `docs/supabase_logs.csv`
2. **Compare busiest-second request counts** between baseline and post-deploy exports:
   - Group rows by second on the `timestamp` column
   - Compare peak `log_count` / requests-per-second at login and scheduler load
3. **Spot-check routes** that should improve:
   - `/rest/v1/` bursts during login warmup
   - Scheduler-related API paths under `/api/scheduler/`
4. **Functional smoke test**: login, open dashboard, open scheduler week view, open jobs list

Document the before/after peak RPS and date in your deploy notes or MR.

### Baseline vs targets (2026-07-07 login spike)

| Metric | Baseline (`docs/supabase_logs.csv`) | Target after deploy |
|--------|-------------------------------------|---------------------|
| REST calls in first ~3s after login | **36+** | **< 15** in first 5s |
| Busiest single second | **21 requests** | **< 10** |
| Dashboard overview job scan | `jobs?...limit=2000` with nested `technician_jobs` | **None** — use `dashboard_overview_periods_json` RPC |
| Parallel `dashboard_job_count_in_range` | **4×** per overview load | **0** (folded into RPC) |
| Login warmup parallel API hits | **9 concurrent** | **Phased** (2 → 3 → deferred) |
| Scheduler chunk concurrency | **4** | **2** |
| Scheduler server cache TTL | **90s** | **180s** |
| Session `findByIdForSession` dedupe | **None** | **In-flight Map per uid:sessionId** |
| Index DDL during traffic | `pg_trgm` GIN builds in SQL editor | **Off-peak only**, `CONCURRENTLY`, batched |

**How to verify after deploy:** re-export logs to `docs/supabase_logs.csv`, group by second on `timestamp`, grep for `limit=2000` on `/rest/v1/jobs` (should be zero), confirm overview charts load via `periods.Today`, and check server logs for no slim-jobs fallback warnings.

---

## Supabase Dashboard Monitoring Checklist

Review regularly (daily during incidents, weekly in steady state):

### Query Performance

- [ ] Sort by **total time** and **mean time** — identify regressions after deploys
- [ ] Watch for new top queries on `users`, `jobs`, `technician_jobs`, `job_schedules`
- [ ] Check for sequential scans on large tables that should use new indexes

### CPU & memory

- [ ] **Database → Reports → CPU** — sustained >70% warrants investigation
- [ ] Correlate CPU spikes with deploy time, cron jobs, or index builds

### Connections

- [ ] **Database → Reports → Connections** — watch for pool exhaustion or login stampedes
- [ ] Compare peak connections before/after warmup throttling or session-cache changes

### API / Edge logs

- [ ] Filter 5xx and slow requests (`latency` column in exported CSV)
- [ ] Compare error rate during login windows vs off-peak

### Auth

- [ ] Auth health checks should remain 200; spikes in session validation queries should drop after dedupe/cache tuning

---

## Session clients vs DB pooling (what shares what)

Supabase has three different “client” concepts in this app. Mixing them up leads to wrong expectations about connections and logouts.

| Layer | What it is | Shared across users? |
|-------|------------|----------------------|
| **`getSupabaseAdmin()`** (`lib/supabase/server.js`) | Process-singleton **service-role** HTTP client for BFF / `requireSession` / admin DB work | Same Node object in one process; **not** one Postgres connection for everyone — PostgREST still uses Supabase’s pooler |
| **Per-user portal session** (`uid` + `sessionId` cookies, or mobile Bearer + `X-Uid`) | App single-device gate via `users.current_session_id` (`requireSession`) | **No** — each login gets its own session id; a new login elsewhere invalidates the previous |
| **Supabase Auth JWT cookies** (browser `AuthContext` / `@supabase/ssr`) | Auth access/refresh tokens for client-side Supabase SDK (Realtime, direct reads) | **No** — each browser has its own JWT |

### Root `proxy.js` + `@supabase/ssr` — JWT refresh, not pooling

Portal UI path in root `proxy.js` builds a **per-request** cookie-aware Supabase client (`createServerClient` with the **anon** key only) and calls `auth.getUser()` so Auth JWT cookies stay valid while the user navigates dashboard pages. (Next.js 16 uses `proxy.js` instead of `middleware.js`.)

That is **session refresh (Auth cookie proxy)**. It does **not**:

- Hold or share one Postgres connection for all users
- Replace `requireSession` / `current_session_id`
- Apply to `/api/v1/field/*` or `/api/cron/*` (portal-path gate excludes those)
- Put the service-role key on the Edge

Field mobile stays on Bearer + `X-Uid` + `getSupabaseAdmin()`; see [`MOBILE_BFF_CONTRACT.md`](./MOBILE_BFF_CONTRACT.md).

Helpers (Pages-friendly, under `lib/supabase/`): `ssrBrowser.js`, `ssrServer.js` — optional gradual use alongside `client.js`. Do not copy App Router `utils/supabase/*` paths blindly.

---

## Related App-Side Mitigations

These code paths reduce burst load on Supabase (see implementation in repo):

| Area | Change | Purpose |
|------|--------|---------|
| Login warmup | Phased prefetch (`lib/session/appWarmup.js`) | Avoid 9 parallel API hits at login |
| Dashboard overview | `dashboard_overview_periods_json` RPC + singleflight (`pages/api/dashboard/overview-stats.js`) | Replace 2000-row job scan and 4 count RPCs |
| Scheduler API | Lower chunk concurrency, longer server cache | Reduce concurrent PostgREST reads |
| Session validation | In-flight dedupe + 45s TTL cache | One `findByIdForSession` per uid:session per wave |
| Admin client singleton | One `getSupabaseAdmin()` reused by API / `database.js` (server path) | Less duplicate service-role client objects; still not DB pooling |
| Portal SSR (`proxy.js`) | `@supabase/ssr` refresh on portal pages only | Fewer Auth JWT expiry surprises on web; not a pooler |
| Mobile BFF | `/api/v1/field/*` + `api_timing` logs (`X-Client-Source`) | Attribute mobile vs web load without extra DB metrics writes |

---

## Correlating `api_timing` logs with Query Performance

Portal routes instrumented with `withApiMetrics` emit one JSON line per request to stdout (PM2 / host logs), for example:

```json
{"type":"api_timing","source":"mobile","path":"/api/v1/field/assignments/complete","method":"POST","status":200,"ms":342,"uid":"..."}
```

| Field | Use |
|-------|-----|
| `source` | `mobile` (field app), `web` (portal UI helpers), `system` / `cron`, or `api` if header unknown |
| `path` / `ms` / `status` | Match slow portal calls to user reports |
| Timestamp of the log line | Align with Supabase **Query Performance** / API log rows in the same window |

**How to triage a slow mobile call**

1. Grep host logs for `"type":"api_timing"` and `"source":"mobile"` around the incident time.
2. Note `path` and wall-clock `ms`.
3. In Supabase Dashboard → Reports → Query Performance (or exported API logs), look for `technician_jobs` / `job_signatures` / `jobs` statements in the same second(s).
4. Prefer fixing the field BFF path or indexes — do **not** write a metrics row to Supabase per request.

Field contract: [`docs/MOBILE_BFF_CONTRACT.md`](./MOBILE_BFF_CONTRACT.md).

---

## Escalation

If CPU or connections remain elevated after off-peak index rollout and app deploy:

1. Pause further DDL
2. Capture Query Performance snapshot and `docs/supabase_logs.csv`
3. Review cron/sync jobs and scheduler polling intervals
4. Consider temporary read replica or compute upgrade via Supabase support
