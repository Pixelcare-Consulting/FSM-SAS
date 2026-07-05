import {
  createCalendarEvent,
  fetchCalendarEventsForRange,
  fetchCalendarEventById,
  softDeleteCalendarEvent,
  updateCalendarEvent,
} from '../../../lib/calendar/calendarEvents';
import {
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_SOURCE,
  AUDIT_STATUS,
  buildChanges,
  writeAuditLogFromRequest,
} from '../../../lib/services/auditLog';
import { toSingaporeYmd } from '../../../lib/utils/singaporeDateTime';
import { requireAdminUser } from '../company-memos/_auth';

function calendarAuditSnapshot(event) {
  if (!event) return {};
  return {
    scope: event.scope,
    eventType: event.eventType,
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    technicianId: event.technicianId,
  };
}

function parseDateQuery(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const ymd = toSingaporeYmd(trimmed);
  return ymd || null;
}

async function handleGet(req, res) {
  res.setHeader('Cache-Control', 'private, max-age=30');

  const startDate = parseDateQuery(req.query.startDate);
  const endDate = parseDateQuery(req.query.endDate);
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD or ISO)' });
  }

  res.setHeader('Cache-Control', 'private, max-age=30');

  const auth = await requireAdminUser(req, res);
  if (!auth) return;

  const scope = typeof req.query.scope === 'string' ? req.query.scope : null;
  const technicianId =
    typeof req.query.technicianId === 'string' ? req.query.technicianId : null;

  const { data, error } = await fetchCalendarEventsForRange(auth.admin, {
    startDate,
    endDate,
    scope: scope || undefined,
    technicianIds: technicianId ? [technicianId] : null,
  });

  if (error) {
    return res.status(500).json({ error: error.message || 'Failed to load calendar events' });
  }

  return res.status(200).json({ events: data });
}

async function handlePost(req, res) {
  const auth = await requireAdminUser(req, res);
  if (!auth) return;

  const { data, error } = await createCalendarEvent(auth.admin, req.body, auth.uid);
  if (error) {
    await writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.CALENDAR_EVENT_CREATE,
      category: AUDIT_CATEGORIES.CALENDAR,
      entityType: 'calendar_event',
      entityLabel: req.body?.title || 'Calendar event',
      description: `Failed to create calendar event: ${error.message}`,
      details: { payload: req.body, error: error.message },
      status: AUDIT_STATUS.FAILURE,
      source: AUDIT_SOURCE.PORTAL,
    });
    return res.status(400).json({ error: error.message });
  }

  await writeAuditLogFromRequest(req, {
    action: AUDIT_ACTIONS.CALENDAR_EVENT_CREATE,
    category: AUDIT_CATEGORIES.CALENDAR,
    entityType: 'calendar_event',
    entityId: data.id,
    entityLabel: data.title,
    description: `Created calendar event: ${data.title}`,
    details: calendarAuditSnapshot(data),
    status: AUDIT_STATUS.SUCCESS,
    source: AUDIT_SOURCE.PORTAL,
  });

  return res.status(201).json(data);
}

async function handlePut(req, res) {
  const auth = await requireAdminUser(req, res);
  if (!auth) return;

  const id = typeof req.query.id === 'string' ? req.query.id : req.body?.id;
  if (!id) {
    return res.status(400).json({ error: 'Event id is required' });
  }

  const beforeResult = await fetchCalendarEventById(auth.admin, id);
  const { data, error } = await updateCalendarEvent(auth.admin, id, req.body);

  if (error) {
    await writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.CALENDAR_EVENT_UPDATE,
      category: AUDIT_CATEGORIES.CALENDAR,
      entityType: 'calendar_event',
      entityId: id,
      entityLabel: beforeResult.data?.title || id,
      description: `Failed to update calendar event: ${error.message}`,
      details: { error: error.message },
      status: AUDIT_STATUS.FAILURE,
      source: AUDIT_SOURCE.PORTAL,
    });
    return res.status(400).json({ error: error.message });
  }

  await writeAuditLogFromRequest(req, {
    action: AUDIT_ACTIONS.CALENDAR_EVENT_UPDATE,
    category: AUDIT_CATEGORIES.CALENDAR,
    entityType: 'calendar_event',
    entityId: data.id,
    entityLabel: data.title,
    description: `Updated calendar event: ${data.title}`,
    details: calendarAuditSnapshot(data),
    changes: buildChanges(calendarAuditSnapshot(beforeResult.data), calendarAuditSnapshot(data)),
    status: AUDIT_STATUS.SUCCESS,
    source: AUDIT_SOURCE.PORTAL,
  });

  return res.status(200).json(data);
}

async function handleDelete(req, res) {
  const auth = await requireAdminUser(req, res);
  if (!auth) return;

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) {
    return res.status(400).json({ error: 'Event id is required' });
  }

  const beforeResult = await fetchCalendarEventById(auth.admin, id);
  const { data, error } = await softDeleteCalendarEvent(auth.admin, id);

  if (error) {
    await writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.CALENDAR_EVENT_DELETE,
      category: AUDIT_CATEGORIES.CALENDAR,
      entityType: 'calendar_event',
      entityId: id,
      entityLabel: beforeResult.data?.title || id,
      description: `Failed to delete calendar event: ${error.message}`,
      details: { error: error.message },
      status: AUDIT_STATUS.FAILURE,
      source: AUDIT_SOURCE.PORTAL,
    });
    return res.status(400).json({ error: error.message });
  }

  await writeAuditLogFromRequest(req, {
    action: AUDIT_ACTIONS.CALENDAR_EVENT_DELETE,
    category: AUDIT_CATEGORIES.CALENDAR,
    entityType: 'calendar_event',
    entityId: data.id,
    entityLabel: data.title,
    description: `Deleted calendar event: ${data.title}`,
    details: calendarAuditSnapshot(data),
    status: AUDIT_STATUS.SUCCESS,
    source: AUDIT_SOURCE.PORTAL,
  });

  return res.status(200).json({ ok: true, event: data });
}

export default async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    case 'PUT':
      return handlePut(req, res);
    case 'DELETE':
      return handleDelete(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}
