# Multiple reassignment: product and technical proposal

This document proposes ways to support **multiple reassignment** scenarios for end users. It does **not** prescribe implementation; it clarifies what “multiple” can mean, trade-offs, and a sensible rollout order.

## Current behavior (baseline)

Today the worker scheduler treats a displayed job as tied to **one active assignee** for reassignment purposes:

- Reassignment updates the **`technician_jobs`** row for that assignment (single `technician_id`).
- **`job_schedule`** is kept in sync for display (e.g. `job_tech` label) without changing appointment times.
- The Job Details UI offers a **single-select** technician list and one **confirm** action.

So “1 is to 1” is accurate for **one job card ↔ one primary technician row** in the current model.

---

## What “multiple reassignment” might mean (clarify with stakeholders)

Before designing UI or APIs, align on which scenarios matter:

| Scenario | User intent | Typical UI |
|----------|-------------|------------|
| **A. Crew / multi-assignee** | Same job, **several technicians** at once (lead + helper, or rotating crew). | List of assignees on the job; add/remove people; optional roles. |
| **B. Bulk jobs → one tech** | Dispatcher selects **many jobs** and assigns them all to **one** technician. | Multi-select on calendar or list + “Assign to…” |
| **C. One job → handoff chain** | Less common in field service: reassign **sequentially** over time (not simultaneous). | History + current assignee; past assignees read-only. |
| **D. Split assignment** | Same job **time window** but **different people** on different **sub-intervals** (e.g. morning tech vs afternoon). | Per-segment assignees or sub-tasks (heavier model). |

Most field-service products start with **A** and/or **B**. **D** is a larger product decision (often deferred).

---

## Recommended product directions

### 1) Multi-assignee on a single job (Scenario A)

**Idea:** A job can have **N ≥ 1** technicians linked for the same scheduled work, with clear **roles** or at least a **primary** contact for notifications and reporting.

**UX principles**

- **Primary vs additional:** Users need a default for “who owns the job on the schedule row” (color, name on card, notifications). Without this, every downstream screen duplicates ambiguity.
- **Add, don’t only replace:** Prefer “**Add technician**” + “**Remove**” alongside “**Replace primary**” so power users don’t have to swap one-for-one.
- **Conflict visibility:** If someone is already on another job at the same time, surface a **warning** (policy: block vs warn is a business rule).
- **Scheduler density:** Multiple people on one job can be shown as **stacked avatars**, a “+N” badge, or **duplicate rows** per technician (see Visualization options below).

**Data / domain (conceptual)**

- Today’s model centers on **one `technician_jobs` row per logical assignment** in the scheduler service path. True multi-assignee implies either:
  - **Multiple rows** in `technician_jobs` (or equivalent) for the same `job_id`, with constraints (e.g. one primary), or
  - A **junction** table `job_technicians` with role + ordering, while keeping one row for “schedule driver” if needed.

**Operational notes**

- **Notifications:** Define whether all assignees receive “new assignment” or only the primary.
- **SAP / external sync:** If job ownership in SAP is singular, decide **system-of-record** for “official” technician vs portal-only crew list.

---

### 2) Bulk reassignment (Scenario B)

**Idea:** Dispatcher selects **multiple jobs** (same day, same customer route, or arbitrary filter) and assigns them to **one** technician in one confirmation step.

**UX**

- Calendar: **multi-select** job cards (checkbox or ctrl-click) → **Reassign selected (N)**.
- Optional: **preview list** of affected job numbers and conflicts before commit.

**Backend**

- Atomic **batch** API (all succeed or clear partial-failure reporting) vs sequential calls with a summary toast. For operations, a **result report** (“3 ok, 1 failed: reason”) is usually necessary.

This can ship **independently** of multi-assignee if the data model stays 1:1 per job row.

---

## Visualization options for the scheduler (when N > 1)

| Option | Pros | Cons |
|--------|------|------|
| **Single row, multi-avatar** | Compact; matches one time slot | Harder to drag per-person; unclear in day view |
| **One row per technician (duplicate job)** | Drag-drop per person; clear capacity view | More vertical space; must keep edits in sync |
| **Primary row + “helpers” in tooltip/modal** | Simple calendar | Detail hidden until click |

The right choice depends on whether users **schedule by person** (rows = techs) or **by job** (columns = time).

---

## API and service-layer considerations (high level)

- **Reassign today** is “**change assignee only**, don’t touch times” — preserve that invariant for parity endpoints.
- Multi-assignee likely needs:
  - **List assignees** for a job.
  - **Add assignee** / **Remove assignee** / **Set primary** (or **Replace primary**) as explicit operations instead of overloading a single dropdown.
- Consider **idempotency** and **audit** (who added/removed whom, when) for dispatch accountability.

---

## Phased rollout (suggested)

1. **Phase 0 — Clarify scope:** Decide A vs B vs both; confirm SAP/single-owner constraints.
2. **Phase 1 — Bulk reassignment (B):** Highest ROI if dispatchers juggle many cards; minimal change if each job stays 1:1.
3. **Phase 2 — Multi-assignee (A) with primary:** Multiple links + one primary; scheduler shows primary on card, full crew in Job Details.
4. **Phase 3 — Advanced:** Warnings/rules engine, segment-level assignees (D), or skill-based suggestions.

---

## Open questions checklist

Use this in discovery workshops:

1. Can a **single job** legally have **more than one** technician in your ERP / billing?
2. Should **all** technicians get **mobile notifications**, or only the **primary**?
3. When reassigning, must **history** of prior assignees be visible?
4. Is **overlap** with other jobs **blocked** or only **warned**?
5. Should **crew** members have **equal** weight or **lead/helper** roles?

---

## Summary

- **“Multiple reassignment”** should be split into **multi-assignee on one job** vs **bulk assign many jobs**; they solve different problems and can ship on different timelines.
- The **current** system matches **one primary `technician_id`** per assignment path used in the scheduler; evolving that requires explicit **data** and **UX** rules (especially **primary** and **notifications**).
- A practical sequence is: **clarify scenarios → bulk reassignment (optional quick win) → multi-assignee with primary → advanced rules and visualization**.

---

*Document status: proposal only — no implementation attached.*
