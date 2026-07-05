import { serialize } from 'cookie';

const HTTP_ONLY_COOKIE_NAMES = new Set(['B1SESSION', 'accessToken']);

export const SESSION_COOKIE_NAMES = [
  'B1SESSION',
  'B1SESSION_EXPIRY',
  'ROUTEID',
  'accessToken',
  'customToken',
  'sessionId',
  'email',
  'isAdmin',
  'uid',
  'workerId',
  'fullName',
  'sapConnectionStatus',
  'LAST_ACTIVITY',
  'loginAt',
];

/**
 * Match login.js Secure detection — only set Secure when request is actually HTTPS.
 */
export function isRequestSecure(req) {
  const forwardedProto =
    req.headers['x-forwarded-proto'] || req.headers['x-forwarded-protocol'];
  const isHttps =
    forwardedProto === 'https' ||
    req.headers['x-forwarded-ssl'] === 'on' ||
    (req.connection && req.connection.encrypted);
  return Boolean(isHttps);
}

/**
 * Build Set-Cookie headers that clear all session/identity cookies.
 */
export function buildClearSessionCookies(isSecure) {
  return SESSION_COOKIE_NAMES.map((name) =>
    serialize(name, '', {
      path: '/',
      maxAge: 0,
      sameSite: 'lax',
      secure: isSecure,
      httpOnly: HTTP_ONLY_COOKIE_NAMES.has(name),
    })
  );
}
