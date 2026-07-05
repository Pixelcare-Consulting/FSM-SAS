# Portal update log — 19 May 2026

Use this when creating a memo in **Folder: Update Logs**. Published entries appear on **What's New** (`/dashboard/whats-new`) for all portal users.

| Field | Suggested value |
|-------|-----------------|
| **Subject** | Portal Update Log — 19 May 2026 |
| **Folder** | Update Logs (requires `@pixelcareconsulting.com` login) |
| **Priority** | Medium |
| **Expires** | 30 days from publish (optional) |
| **Show in header ticker** | On (or Off if you only want sign-in) |
| **Display upon sign in** | On (recommended for update logs) |

## Memo body (Quill editor)

Open the memo in the editor (do **not** paste raw HTML tags as plain text). Either:

1. Use the toolbar to format (headings, lists, bold), or  
2. Copy the **plain-text outline** below and apply styles in Quill.

After opening an existing memo with broken HTML, reload the edit page — the editor will normalize it; click **Save** to store proper formatting.

---

**Portal Update Log — 19 May 2026**

Summary of improvements deployed to the SAS&ME portal today.

**Jobs & SAP synchronization**

- Hourly job sync now supports **preview mode** with improved counts and pagination; sync can run without SAP session cookies where appropriate.
- Jobs list: confirmation modal, **live progress feed**, and clearer alerts during sync.
- AIFM import: dry-run option, stronger SAP identifier alignment, service-call / sales-order enrichment, and audit logging for sync actions.
- Equipment API falls back to Supabase when SAP session is unavailable.
- Job contacts, quotations, and customer masterlist sync improvements for data integrity.

**Incentives & reporting**

- Incentive settings: SAP UDT income and hours now respect selected labor month/quarter with clearer UI feedback.

**Admin & audit**

- **Audit Logs** page and Quick Menu entry for traceability.
- Login/logout and migration actions recorded where applicable.

**Customer & job UI**

- Create/Edit job: improved address normalization and location handling.
- Quotations tab: clearer API error messages.

If anything looks wrong after sync, contact your system administrator and reference this date.

---

## HTML variant (if you paste via source/HTML)

```html
<h2>Portal Update Log — 19 May 2026</h2>
<p>Summary of improvements deployed to the SAS&amp;ME portal today.</p>
<h3>Jobs &amp; SAP synchronization</h3>
<ul>
  <li>Hourly job sync: <strong>preview mode</strong>, improved counts, pagination; reduced dependency on SAP session cookies.</li>
  <li>Jobs list: confirmation modal, <strong>live progress feed</strong>, clearer alerts during sync.</li>
  <li>AIFM import: dry-run, SAP identifier alignment, service-call / sales-order enrichment, audit logging.</li>
  <li>Equipment API: Supabase fallback when SAP session unavailable.</li>
  <li>Job contacts, quotations, and customer masterlist sync improvements.</li>
</ul>
<h3>Incentives &amp; reporting</h3>
<ul>
  <li>Incentive settings: SAP UDT totals respect selected labor month/quarter.</li>
</ul>
<h3>Admin &amp; audit</h3>
<ul>
  <li><strong>Audit Logs</strong> page and Quick Menu entry.</li>
  <li>Login/logout and migration actions logged where applicable.</li>
</ul>
<h3>Customer &amp; job UI</h3>
<ul>
  <li>Create/Edit job: improved address normalization.</li>
  <li>Quotations: clearer error messages.</li>
</ul>
<p><em>If anything looks wrong after sync, contact your administrator and reference 19 May 2026.</em></p>
```
