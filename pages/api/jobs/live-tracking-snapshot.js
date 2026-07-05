import { getSupabaseAdmin } from '../../../lib/supabase/server';
import {
  locationLatLng,
} from '../../../lib/liveTracking/fetchLiveTrackingSnapshot';
import { getListCache, logResponseSize, setListCache } from '../../../lib/supabase/listQueryHelpers';

const CACHE_TTL_MS = 30000;
const LIVE_TRACKING_SELECT = `
  id,
  job_number,
  title,
  status,
  scheduled_start,
  scheduled_end,
  customer:customer_id ( customer_name ),
  location:location_id (
    location_name,
    current_latitude,
    current_longitude,
    destination_latitude,
    destination_longitude
  ),
  technician_jobs (
    technician_id,
    assignment_status,
    deleted_at,
    technician:technician_id ( id, full_name )
  )
`;

function dayBounds(dayStr) {
  const day = dayStr ? new Date(`${dayStr}T12:00:00`) : new Date();
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function mapJobStatus(status) {
  const s = String(status || '').toUpperCase();
  if (s.includes('PROGRESS') || s === 'STARTED') return 'En route';
  if (s.includes('OVERDUE')) return 'Delayed';
  return 'Created';
}

function fmtHm(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

function locationAddress(job) {
  const loc = job?.location;
  const name = String(loc?.location_name || '').trim();
  const title = String(job?.title || '').trim();
  if (name && title && name !== title) return `${name} · ${title}`;
  return name || title || '';
}

function pickAssignment(job) {
  const rows = job?.technician_jobs;
  if (!Array.isArray(rows)) return null;
  return (
    rows.find(
      (tj) =>
        !tj?.deleted_at &&
        (tj.assignment_status === 'ASSIGNED' || tj.assignment_status === 'STARTED')
    ) || null
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, max-age=30');

  const dateParam = typeof req.query.date === 'string' ? req.query.date.trim() : null;
  const dateKey = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : new Date().toISOString().slice(0, 10);

  const cacheKey = `live-tracking-snapshot:${dateKey}`;
  const cached = getListCache(cacheKey, CACHE_TTL_MS);
  if (cached) {
    logResponseSize('jobs/live-tracking-snapshot (cached)', cached);
    return res.status(200).json(cached);
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { start, end } = dayBounds(dateKey);

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select(LIVE_TRACKING_SELECT)
      .is('deleted_at', null)
      .gte('scheduled_start', start.toISOString())
      .lte('scheduled_start', end.toISOString())
      .order('scheduled_start', { ascending: true })
      .limit(500);

    if (error) throw error;

    const raw = jobs || [];
    let skippedNoCoords = 0;
    const stops = [];

    for (const job of raw) {
      const tj = pickAssignment(job);
      if (!tj?.technician_id) continue;

      const ll = locationLatLng(job.location);
      if (!ll) {
        skippedNoCoords += 1;
        continue;
      }

      stops.push({
        id: String(job.id),
        jobRef: String(job.job_number || job.id).slice(0, 32),
        customer: String(job.customer?.customer_name || job.title || 'Customer'),
        address: locationAddress(job),
        status: mapJobStatus(job.status),
        jobStatus: String(job.status || '—').trim() || '—',
        assignmentStatus: String(tj.assignment_status || '—').trim() || '—',
        windowStart: fmtHm(job.scheduled_start),
        windowEnd: fmtHm(job.scheduled_end),
        lat: ll.lat,
        lng: ll.lng,
        driverId: String(tj.technician_id),
        seq: 0,
        _sort: job.scheduled_start ? new Date(job.scheduled_start).getTime() : 0,
      });
    }

    stops.sort((a, b) => (a._sort || 0) - (b._sort || 0));

    const byDriver = {};
    for (const s of stops) {
      if (!byDriver[s.driverId]) byDriver[s.driverId] = [];
      byDriver[s.driverId].push(s);
    }
    Object.values(byDriver).forEach((list) => {
      list.forEach((s, i) => {
        s.seq = i;
        delete s._sort;
      });
    });

    const driverIdSet = new Set(stops.map((s) => s.driverId));
    const techSeen = new Map();

    for (const job of raw) {
      const tj = pickAssignment(job);
      if (!tj?.technician_id || techSeen.has(tj.technician_id)) continue;
      const tech = tj.technician;
      techSeen.set(tj.technician_id, {
        id: String(tj.technician_id),
        name: tech?.full_name || `Tech ${String(tj.technician_id).slice(0, 8)}`,
        vehicle: '—',
      });
    }

    const drivers = Array.from(techSeen.values()).filter((d) => driverIdSet.has(d.id));

    const payload = {
      ok: true,
      drivers,
      stops,
      skippedNoCoords,
      fetchedAt: new Date().toISOString(),
    };

    setListCache(cacheKey, payload, CACHE_TTL_MS);
    logResponseSize('jobs/live-tracking-snapshot', payload);

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Live tracking snapshot API error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Unable to load live tracking snapshot.',
      drivers: [],
      stops: [],
      skippedNoCoords: 0,
    });
  }
}
