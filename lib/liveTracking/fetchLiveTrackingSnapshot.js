/** @typedef {{ id: string, name: string, vehicle: string }} LiveDriver */
/** @typedef {{ id: string, jobRef: string, customer: string, address: string, status: string, jobStatus: string, assignmentStatus: string, windowStart: string, windowEnd: string, lat: number, lng: number, driverId: string, seq: number }} LiveStop */

function dayBounds(mapDate) {
  const start = new Date(mapDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(mapDate);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function parseCoord(v) {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/** @param {Record<string, unknown>|null|undefined} loc */
export function locationLatLng(loc) {
  if (!loc || typeof loc !== "object") return null;
  let lat = parseCoord(loc.current_latitude);
  let lng = parseCoord(loc.current_longitude);
  if (lat == null || lng == null) {
    lat = parseCoord(loc.destination_latitude);
    lng = parseCoord(loc.destination_longitude);
  }
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Live tracking snapshot via server API (slim select + 30s cache).
 * @param {Date} mapDate
 * @returns {Promise<{ ok: boolean, error?: string, message?: string, drivers: LiveDriver[], stops: LiveStop[], skippedNoCoords: number }>}
 */
export async function fetchLiveTrackingSnapshot(mapDate) {
  const dateKey =
    mapDate instanceof Date && !Number.isNaN(mapDate.getTime())
      ? mapDate.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  try {
    const response = await fetch(`/api/jobs/live-tracking-snapshot?date=${encodeURIComponent(dateKey)}`);
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        error: body.error || `HTTP_${response.status}`,
        message: body.error || "Failed to load live tracking snapshot.",
        drivers: [],
        stops: [],
        skippedNoCoords: 0,
      };
    }

    return {
      ok: Boolean(body.ok),
      error: body.error,
      message: body.message,
      drivers: body.drivers || [],
      stops: body.stops || [],
      skippedNoCoords: body.skippedNoCoords ?? 0,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || "FETCH_ERROR",
      message: err?.message || "Failed to load live tracking snapshot.",
      drivers: [],
      stops: [],
      skippedNoCoords: 0,
    };
  }
}

export { dayBounds };
