# Mobile technician labor contract

The portal does **not** set `started_at`, `completed_at`, or `accumulated_hours` on `technician_jobs`. The mobile app owns these fields. Supabase materializes `technician_hours` via `fn_create_technician_hours_on_completion` when an assignment becomes `COMPLETED`.

## Fields on `technician_jobs`

| Column | Owner | Purpose |
|--------|-------|---------|
| `started_at` | Mobile | First start of work on this assignment |
| `completed_at` | Mobile | When the technician marks the assignment complete |
| `accumulated_hours` | Mobile | Running total of labor across sessions (multi-day jobs) |
| `assignment_status` | Mobile | `ASSIGNED` → `STARTED` → `COMPLETED` (or `CANCELLED`) |

## Event contract

| Event | Mobile writes |
|-------|----------------|
| Start job | `started_at = now()`, `assignment_status = 'STARTED'` |
| End session (multi-day) | `accumulated_hours += session_hours` (do not clear `started_at`) |
| Complete job | `completed_at = now()`, `assignment_status = 'COMPLETED'` |
| Overnight shift | Real `started_at` / `completed_at`; DB caps span per calendar day (16h/day in Asia/Singapore) |

## Rules

1. **Do not set `completed_at` unless `assignment_status = 'COMPLETED'`.** In-progress rows with `completed_at` inflate labor (e.g. 192h while still In Progress).
2. **Prefer `accumulated_hours` for multi-day work.** The DB function uses it when `> 0` instead of raw timestamp span.
3. **Set `started_at` only on first start** for the assignment; do not backdate to unrelated dates.
4. On completion, the trigger upserts `technician_hours` using `fn_compute_technician_labor_hours` (guards stale `started_at` >7 days before `jobs.scheduled_start`).

## DB behavior (after migration)

- On `technician_jobs` update to `COMPLETED`: trigger inserts/updates `technician_hours` (`ON CONFLICT DO UPDATE`).
- Labor order of precedence: `accumulated_hours` → guarded `(completed_at - started_at)` with per-day cap → `0` if corrupt or incomplete.
- Portal `syncTechnicianJobsOnJobCompleted` is unchanged; incentives panel reads `technician_hours`.

## Related files

- `lib/supabase/migrations/fix_technician_hours_trigger.sql` — functions + trigger
- `lib/supabase/migrations/backfill_technician_hours.sql` — one-shot cache refresh
- `scripts/diagnose-technician-labor-outliers.sql` — diagnosis queries
