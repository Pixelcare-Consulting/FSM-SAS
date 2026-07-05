/**
 * Browser: emit in-app job notifications via API (service-role insert — reliable vs client RLS).
 */
export async function emitJobStakeholderNotifications({
  jobId,
  jobNumber,
  jobTitle,
  assigneeUserIds = [],
  kind = 'new',
  createdByUserId = null,
  updateSummary = null,
} = {}) {
  try {
    const res = await fetch('/api/notifications/job-stakeholders', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        jobNumber,
        jobTitle,
        assigneeUserIds,
        kind,
        createdByUserId,
        updateSummary,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[emitJobStakeholderNotifications]', payload.error || res.status);
      return { ok: false, ...payload };
    }
    const inserted = payload?.inserted;
    if (typeof window !== 'undefined' && (inserted === undefined || inserted > 0)) {
      window.dispatchEvent(new CustomEvent('fsm:notifications-refresh'));
    }
    return { ok: true, ...payload };
  } catch (e) {
    console.warn('[emitJobStakeholderNotifications]', e?.message || e);
    return { ok: false, error: e?.message || 'fetch failed' };
  }
}

/**
 * Browser: follow-up created — notifies job assignees + active ADMINs (service-role insert).
 */
export async function emitFollowUpStakeholderNotifications({
  jobId,
  jobNumber,
  jobTitle,
  followUpType,
  notes,
  followUpTechnicianId = null,
  createdByUserId = null,
  dueDate = null,
} = {}) {
  try {
    const res = await fetch('/api/notifications/follow-up-stakeholders', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        jobNumber,
        jobTitle,
        followUpType,
        notes,
        followUpTechnicianId,
        createdByUserId,
        dueDate,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[emitFollowUpStakeholderNotifications]', payload.error || res.status);
      return { ok: false, ...payload };
    }
    const inserted = payload?.inserted;
    if (typeof window !== 'undefined' && (inserted === undefined || inserted > 0)) {
      window.dispatchEvent(new CustomEvent('fsm:notifications-refresh'));
    }
    return { ok: true, ...payload };
  } catch (e) {
    console.warn('[emitFollowUpStakeholderNotifications]', e?.message || e);
    return { ok: false, error: e?.message || 'fetch failed' };
  }
}
