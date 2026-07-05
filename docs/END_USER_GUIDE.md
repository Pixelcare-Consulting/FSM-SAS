# FSM Portal — End User Guide

This guide explains how to use the Field Service Management (FSM) portal for day-to-day work: signing in, navigating menus, managing customers and jobs, scheduling technicians, and running reports.

Routes shown below match the top navigation (`routes/dashboard/NavbarTopRoutes.js`) and URL rewrites in `next.config.js`.

---

## 1. Introduction

The FSM portal is your central workspace for:

- Viewing dashboard metrics and workload
- Managing customers (portal leads, SAP customers, SAP leads)
- Creating, assigning, and completing jobs
- Scheduling technicians
- Tracking follow-ups and running reports

Most users access the portal at your company URL and sign in with the credentials provided by your administrator.

---

## 2. Getting Started

### Sign in

1. Open the portal sign-in page (`/sign-in`, rewritten to `/authentication/sign-in`).
2. Enter your email and password.
3. After a successful sign-in, you are redirected to the dashboard (`/dashboard` → `/dashboard/overview`).

### Sign out

1. Click your avatar or name in the top-right corner.
2. Choose **Sign Out** from the user menu.

### Session

- Your session stays active while you use the portal. If you are idle for an extended period, you may be asked to sign in again.
- Closing the browser does not always end your session immediately; use **Sign Out** on shared devices.

---

## 3. Navigating the Portal

### Top navigation bar

The main menu runs horizontally below the company logo:

| Menu | Route | Purpose |
|------|-------|---------|
| Dashboard | `/dashboard` | Metrics and overview |
| Customers | (submenu) | Portal, SAP, and SAP lead records |
| Technicians | (submenu) | Technician list and scheduler |
| Jobs | (submenu) | Job list and actions |
| Follow-Ups | `/follow-ups` | Callback and task tracking |
| Memos | `/dashboard/company-memos` | Admin announcements (admins only) |
| Reports | `/dashboard/reports` | Operational and catalog reports |
| Release Notes | `/dashboard/whats-new` | Product updates and changelog |

### Mobile navigation

On smaller screens, tap the **hamburger menu** (three lines) to expand the same top menu. Search, notifications, and your user menu remain in the header.

### Global search

- Use the **search bar** in the top header on any dashboard page.
- Type a name, job number, customer, or keyword; results appear as you type.
- Press **Enter** or submit to open the full search results page (`/dashboard/search?q=…`).
- Search covers customers, leads, workers, jobs, and follow-ups.

### Notifications

- The **bell icon** in the header shows job and system notifications.
- Click a notification to open the related record when a link is available.
- You can mark items read or clear notifications from the dropdown.

### User menu

Click your profile avatar (top right):

| Item | Route |
|------|-------|
| Profile | `/dashboard/profile/myprofile` |
| Settings | `/dashboard/settings` |
| Audit Logs | `/dashboard/audit-logs` |
| Help & Support | `/dashboard/help` |
| Sign Out | (ends session) |

---

## 4. Role-Based Access

| Capability | All users | Technician | Administrator |
|------------|-----------|------------|---------------|
| Dashboard, search, notifications | Yes | Yes | Yes |
| View/update assigned jobs | Yes | Yes | Yes |
| Jobs list (all jobs) | Varies by role | Often limited to own work | Yes |
| Sync Jobs to SAP (jobs list) | — | — | Typically admins / dispatchers |
| Technicians & Scheduler | View / limited edit | Own schedule | Full access |
| Customers (Portal / SAP / Leads) | View / edit per permissions | Usually view | Full access |
| Follow-Ups | Yes | Yes | Yes |
| Reports | Yes | Yes | Yes |
| Settings | Profile-related | Limited | Full (company, email, job config) |
| Memos (top nav) | — | — | Yes (`adminOnly`) |
| Audit Logs | — | — | Typically admins |
| Company memos management | — | — | Yes (via Settings or Memos) |

Your administrator assigns roles when your account is created. If a menu item is missing, contact your admin.

---

## 5. Dashboard

**Route:** `/dashboard`

- **Total Jobs** and **Active Jobs** summarize workload.
- Use time filters: **Today**, **This Week**, **This Month**, **This Year**.
- Charts show job status and type distribution.
- Click through to Jobs or Reports for detail.

---

## 6. Customers — Portal Customers

**Route:** `/customer-leads`

- Lists leads and portal sign-ups before they become full customers.
- Review contact details, source, and status.
- **Convert** a lead to a customer when they are ready for jobs and SAP alignment.
- After conversion, manage the customer in SAP Customers or assign jobs.

---

## 7. Customers — SAP Customers

**Route:** `/customers` (rewrites to `/dashboard/customers/list`)

- Master customer data synced from SAP Business One.
- Search and open a customer to view contacts, service locations, documents, and job history.
- Customer detail: `/customers/view/:id`
- Data refreshes on a schedule or when sync is triggered; refresh the page if you expect new B1 data.

---

## 8. Customers — SAP Leads

**Route:** `/leads` (rewrites to `/dashboard/leads/list`)

- SAP-sourced lead records (separate from portal customer leads).
- Use for prospects maintained in SAP before they become customers.
- Open a lead: `/leads/view/:leadCode`
- Convert or link to customers per your company workflow.

---

## 9. Jobs

**Route:** `/jobs` (rewrites to `/dashboard/jobs/list-jobs`)

- Filter by status, date, customer, or technician.
- **Create job:** `/jobs/create` → create form with customer, type, priority, and schedule.
- **View job:** `/jobs/view/:jobId`
- **Edit job:** `/jobs/edit-jobs/:id`
- Update status as work progresses (Pending → Scheduled → In Progress → Completed).
- Generate or view jobsheet PDFs from the job detail screen when available.

### Sync jobs to SAP

Use **Sync Jobs** on the jobs list (top right, next to **Add New Job**) to send portal jobs that are not yet in SAP Business One.

**When to use it**

- After creating or importing jobs in the portal that must appear in SAP Activities.
- When jobs show as unsynced (no SAP activity link yet).
- To retry failed syncs for a specific day or date range.

**Steps**

1. Open **Jobs** (`/jobs`).
2. Click **Sync Jobs**.
3. In the confirmation window, choose a **date filter** (by job created date):
   - **All unsynced** — every unsynced job in the portal.
   - **Today**, **Yesterday**, **Last 7 days**, or **Last 30 days** — smaller batches.
   - **Custom range** — pick **From** / **To**, then **Apply**.
4. Review the summary:
   - **In range** — total jobs matching the filter.
   - **Already in SAP** — jobs already synced in that range.
   - **To sync** — unsynced jobs that will be sent.
5. Click **Proceed to sync** (count shown on the button).
6. Keep the browser tab **open** until the progress screen finishes. Do not refresh the page during sync.
7. When complete, read the **Sync to SAP — Results** window. Fix any failed jobs (customer, address, or data issues), then run **Sync Jobs** again with a narrower filter if needed.

**Tips**

- Start with **Today** or a short range when troubleshooting failures.
- Only unsynced jobs are processed; synced jobs are skipped.
- Single jobs also sync when saved from the job edit screen (background sync).
- If sync errors persist, contact your portal administrator with the error message from the results window.

---

## 10. Technicians & Scheduler

| Area | Route |
|------|-------|
| Technicians list | `/workers` |
| Add technician | `/workers/create` |
| Technician profile | `/workers/view/:id` |
| Scheduler | `/scheduler` |

- Maintain technician profiles, skills, and availability on the Technicians list.
- Use the **Technicians Scheduler** to assign jobs by date and technician (drag-and-drop or assignment controls).
- Check availability and skills before assigning urgent work.

---

## 11. Follow-Ups

**Route:** `/follow-ups`

- Tasks linked to jobs or customers (callbacks, parts, inspections).
- Create follow-ups after completing a job so nothing is missed.
- Filter and sort by due date or status.

---

## 12. Reports

**Route:** `/dashboard/reports`

| Report | Route |
|--------|-------|
| Forms Report | `/dashboard/reports/forms` |
| Job Status Record Search | `/dashboard/reports/job-status` |
| Monthly Charts | `/dashboard/reports/monthly-charts` |
| Hours worked by employee | `/dashboard/reports/hours-by-employee` |
| Job categories | `/dashboard/reports/job-categories` |

Use reports for compliance, payroll support, and operational review. Hours reports support period filters (last week, this week, custom range).

---

## 13. Settings

**Route:** `/dashboard/settings`

Administrators configure the portal here. Common sections:

- **Company Information** — logo, name, contact details
- **Google Forms** — field form URLs
- **Pay Now Details** — payment info on jobsheet PDFs
- **Scheduling Windows** — default time slots
- **Follow-Up Tasks** — types and workflows
- **Job Statuses** — names and colors
- **Job Incentives** — SAP sync and incentive settings
- **Notifications** — SMS and push
- **Email Settings** — automated emails
- **Company memos** — header ticker and sign-in announcements (admin)

Technicians and dispatchers typically use Settings only for personal preferences where exposed.

---

## 14. Admin Memos

**Route:** `/dashboard/company-memos` (top nav, **admin only**)

- Create and publish company-wide memos.
- High-priority memos can appear in the header ticker and on sign-in.
- **Release Notes** (`/dashboard/whats-new`) shows published product updates for all users.

---

## 15. Profile & Audit Logs

| Area | Route |
|------|-------|
| My profile | `/dashboard/profile/myprofile` |
| Audit Logs | `/dashboard/audit-logs` |

- **Profile** — your name, contact, and technician details (redirects to your user profile).
- **Audit Logs** — filterable history of auth, jobs, customers, SAP, settings, and memo events (primarily for administrators).

---

## 16. Common Workflows

### Dispatch a job

1. Open **Jobs** → create or select a job (`/jobs/create` or `/jobs`).
2. Set customer, type, priority, and scheduled window.
3. Open **Technicians Scheduler** (`/scheduler`) and assign a technician.
4. Confirm the job status is **Scheduled** and the technician receives notification if enabled.

### Convert a portal lead

1. Go to **Portal Customers** (`/customer-leads`).
2. Open the lead and review details.
3. Use **Convert** / create customer.
4. Assign jobs from **Jobs** using the new customer record.

### Complete a job

1. Open the job from **Jobs** or your assigned list.
2. Record work performed, forms, and time if required.
3. Set status to **Completed**.
4. Generate or send jobsheet PDF if your process requires it.

### Create a follow-up

1. From the job or **Follow-Ups** (`/follow-ups`), add a follow-up task.
2. Set due date, type, and notes.
3. Track until closed.

### Run a report

1. Open **Reports** (`/dashboard/reports`).
2. Choose the report (e.g. Monthly Charts, Hours by employee).
3. Apply date or status filters and export or review on screen.

### Sync jobs to SAP

1. Open **Jobs** (`/jobs`).
2. Click **Sync Jobs**.
3. Select a date filter (e.g. **Today** for recent failures, or **All unsynced** for a full catch-up).
4. Confirm the **To sync** count, then click **Proceed to sync**.
5. Leave the tab open until sync completes; review results and re-sync failed jobs after fixing data.

---

## 17. Mobile Tips

- Use the hamburger menu for navigation; pin the portal to your home screen for quick access.
- Search works from the header on most pages; use full search for long result lists.
- Job detail and scheduler views may require horizontal scrolling on small screens—rotate to landscape when assigning jobs.
- Sign out on shared tablets used in the field.

---

## 18. Getting Help

- **In-app help:** `/dashboard/help` — navigation map, role guide, workflows, tips, and FAQ.
- **Help desk:** Use **Open help desk** on the Help page (Freshworks support portal).
- **Release Notes:** `/dashboard/whats-new` for recent changes.
- **Administrator:** For access, SAP sync, or configuration issues, contact your company portal admin.

---

*Internal staff: this document lives in `docs/END_USER_GUIDE.md`. A Word copy for end users is at `docs/END_USER_GUIDE.docx`. Regenerate with `npm run docs:end-user-word` after editing the markdown.*
