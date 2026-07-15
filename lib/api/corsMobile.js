/**
 * CORS helper for mobile field BFF (`/api/field/*`) and login.
 * Allowed origins from MOBILE_CORS_ORIGINS (comma-separated).
 * When unset/empty: no Origin echo (same-origin portal only);
 * login may pass `fallbackStar: true` for legacy `*` without credentials.
 */

const DEFAULT_ALLOW_HEADERS = [
  'Authorization',
  'Content-Type',
  'X-Uid',
  'X-User-Id',
  'X-Client-Source',
  'X-Requested-With',
  'Accept',
  'Accept-Version',
  'Content-Length',
  'Content-MD5',
  'Date',
  'X-Api-Version',
  'X-CSRF-Token',
].join(', ');

/**
 * @returns {string[]}
 */
export function getMobileCorsOrigins() {
  const raw = String(process.env.MOBILE_CORS_ORIGINS || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Apply CORS headers. Returns true if the request was fully handled (OPTIONS).
 *
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @param {{
 *   methods?: string,
 *   allowHeaders?: string,
 *   fallbackStar?: boolean,
 * }} [options]
 * @returns {boolean}
 */
export function applyMobileCors(req, res, options = {}) {
  const {
    methods = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    allowHeaders = DEFAULT_ALLOW_HEADERS,
    fallbackStar = false,
  } = options;

  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const allowed = getMobileCorsOrigins();

  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  } else if (fallbackStar && allowed.length === 0) {
    // Legacy login behavior when MOBILE_CORS_ORIGINS is unset
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowed.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', allowHeaders);
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
