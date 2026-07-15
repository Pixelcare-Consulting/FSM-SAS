/**
 * API timing instrumentation for portal + field BFF routes.
 * Emits one structured JSON log per request (stdout) — no Supabase writes.
 *
 * Log shape: { type: "api_timing", source, path, method, status, ms, uid? }
 * Source from X-Client-Source: mobile | web | system | cron (default web; invalid → api).
 */

const KNOWN_SOURCES = new Set(['mobile', 'web', 'system', 'cron']);

/**
 * @param {import('next').NextApiRequest} req
 * @returns {string}
 */
export function resolveClientSource(req) {
  const raw = String(req.headers['x-client-source'] || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'web';
  if (KNOWN_SOURCES.has(raw)) return raw;
  return 'api';
}

/**
 * @param {import('next').NextApiRequest} req
 * @returns {string|null}
 */
export function resolveRequestUid(req) {
  const headerUid = req.headers['x-uid'] || req.headers['x-user-id'];
  if (headerUid && typeof headerUid === 'string' && headerUid.trim()) {
    return headerUid.trim();
  }
  const cookieUid = req.cookies?.uid;
  if (cookieUid && typeof cookieUid === 'string' && cookieUid.trim()) {
    return cookieUid.trim();
  }
  return null;
}

/**
 * @param {import('next').NextApiRequest} req
 * @returns {string}
 */
function resolveRequestPath(req) {
  const url = typeof req.url === 'string' ? req.url : '';
  const path = url.split('?')[0] || '';
  return path || 'unknown';
}

/**
 * Wrap a Pages API handler to emit api_timing JSON on response finish.
 * @param {(req: import('next').NextApiRequest, res: import('next').NextApiResponse, ...rest: any[]) => any} handler
 */
export function withApiMetrics(handler) {
  return async function apiMetricsWrapped(req, res, ...rest) {
    const startedAt = Date.now();
    let logged = false;

    const logTiming = () => {
      if (logged) return;
      logged = true;
      const uid = resolveRequestUid(req);
      const payload = {
        type: 'api_timing',
        source: resolveClientSource(req),
        path: resolveRequestPath(req),
        method: req.method || 'UNKNOWN',
        status: res.statusCode || 200,
        ms: Date.now() - startedAt,
      };
      if (uid) payload.uid = uid;
      console.log(JSON.stringify(payload));
    };

    res.on('finish', logTiming);
    res.on('close', logTiming);

    try {
      return await handler(req, res, ...rest);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500);
      }
      logTiming();
      throw error;
    }
  };
}
