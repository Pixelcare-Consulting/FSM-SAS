import {
  loginSessionCookiesFromEnvironment,
  unwrapSapEnvironmentLogin,
} from './sapService.js';

/**
 * True when SAP Service Layer rejected the B1 session (HTTP 401, SAP 301, timeout text).
 * @param {Error|{status?: number, message?: string}|number|string|null} errorOrStatus
 * @param {string} [bodyText]
 */
export function isSapSessionExpired(errorOrStatus, bodyText) {
  let status = null;
  let text = String(bodyText || '');

  if (typeof errorOrStatus === 'number') {
    status = errorOrStatus;
  } else if (typeof errorOrStatus === 'string') {
    text = errorOrStatus;
  } else if (errorOrStatus && typeof errorOrStatus === 'object') {
    status = errorOrStatus.status ?? errorOrStatus.statusCode ?? null;
    if (!text) {
      text = String(
        errorOrStatus.body || errorOrStatus.message || errorOrStatus.details || ''
      );
    }
  }

  if (status === 401 || status === 301) return true;
  if (/Invalid session or session already timeout/i.test(text)) return true;

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (parsed) {
    const code = parsed?.error?.code ?? parsed?.error?.error?.code;
    if (Number(code) === 301 || String(code) === '301' || String(code) === '-301') {
      return true;
    }
  } else if (/"code"\s*:\s*-?301\b/.test(text)) {
    return true;
  }

  return false;
}

/**
 * Run SAP work with existing cookies; on a dead B1SESSION, env re-login once and retry.
 * @param {{b1session?: string, routeid?: string}|null} sessionCookies
 * @param {(cookies: {b1session?: string, routeid?: string}|null) => Promise<any>} execute
 */
export async function withSapSessionRetry(sessionCookies, execute) {
  try {
    return await execute(sessionCookies);
  } catch (err) {
    if (!isSapSessionExpired(err)) throw err;

    const sapLogin = await loginSessionCookiesFromEnvironment();
    const fresh = unwrapSapEnvironmentLogin(sapLogin);
    if (!fresh?.b1session || !fresh?.routeid) throw err;

    return execute(fresh);
  }
}
