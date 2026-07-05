/**
 * Browser → transactional job emails (session cookies).
 */

export async function emitJobAssignmentEmails({ jobId, technicianIds = [] } = {}) {
  const ids = Array.isArray(technicianIds)
    ? [...new Set(technicianIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  if (!jobId || !ids.length) return { ok: false, error: 'missing_args' };

  try {
    const res = await fetch('/api/email/job-assigned', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, technicianIds: ids }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[emitJobAssignmentEmails]', payload.error || res.status);
      return { ok: false, ...payload };
    }
    return { ok: true, ...payload };
  } catch (e) {
    console.warn('[emitJobAssignmentEmails]', e?.message || e);
    return { ok: false, error: e?.message || 'fetch failed' };
  }
}

export async function emitJobCompletedEmail({ jobId, previousStatus = '', force = false } = {}) {
  if (!jobId) return { ok: false, error: 'missing_jobId' };
  try {
    const res = await fetch('/api/email/job-completed', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        previousStatus: previousStatus != null ? String(previousStatus) : '',
        force: force === true,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[emitJobCompletedEmail]', payload.error || res.status);
      return { ok: false, ...payload };
    }
    return { ok: true, ...payload };
  } catch (e) {
    console.warn('[emitJobCompletedEmail]', e?.message || e);
    return { ok: false, error: e?.message || 'fetch failed' };
  }
}

export async function emitSendTemplateEmail({
  jobId,
  templateSlug,
  to,
  force = false,
} = {}) {
  if (!jobId || !templateSlug) return { ok: false, error: 'missing_args' };
  try {
    const res = await fetch('/api/email/send-template', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateSlug,
        entityType: 'job',
        entityId: jobId,
        ...(to ? { to } : {}),
        force: force === true,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[emitSendTemplateEmail]', payload.error || res.status);
      return { ok: false, ...payload };
    }
    return { ok: true, ...payload };
  } catch (e) {
    console.warn('[emitSendTemplateEmail]', e?.message || e);
    return { ok: false, error: e?.message || 'fetch failed' };
  }
}

export async function emitDispatchEventEmail({
  jobId,
  triggerId,
  to,
  force = false,
} = {}) {
  if (!jobId || !triggerId) return { ok: false, error: 'missing_args' };
  try {
    const res = await fetch('/api/email/dispatch-event', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        triggerId,
        entityType: 'job',
        entityId: jobId,
        ...(to ? { to } : {}),
        force: force === true,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[emitDispatchEventEmail]', payload.error || res.status);
      return { ok: false, ...payload };
    }
    return { ok: true, ...payload };
  } catch (e) {
    console.warn('[emitDispatchEventEmail]', e?.message || e);
    return { ok: false, error: e?.message || 'fetch failed' };
  }
}
