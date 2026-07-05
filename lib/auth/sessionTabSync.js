/**
 * Cross-tab session coordination: shared activity timestamps and logout locks.
 * Used by useSessionCheck, useIdleTimeout, and ActivityTracker.
 */

export const SESSION_ACTIVITY_KEY = 'sas_portal_last_activity_at';
export const SESSION_LOGOUT_CHANNEL = 'sas_portal_session_logout';
export const SESSION_LOGOUT_LOCK_KEY = 'sas_portal_logout_lock';
export const SESSION_LOGOUT_MSG_KEY = 'sas_portal_session_logout_msg';

/** Grace period after login before forced logout on 401 (cookie propagation race). */
export const POST_LOGIN_GRACE_MS = 15 * 1000;

const LOGOUT_LOCK_TTL_MS = 5000;

let logoutChannel = null;
let logoutInProgress = false;

export const SESSION_ERROR_CODES = {
  NO_UID: 'NO_UID',
  NO_SESSION_ID: 'NO_SESSION_ID',
  SESSION_MISMATCH: 'SESSION_MISMATCH',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_INACTIVE: 'USER_INACTIVE',
  DB_ERROR: 'DB_ERROR',
};

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getSharedLastActivityAt() {
  if (typeof window === 'undefined') return Date.now();
  try {
    const stored = localStorage.getItem(SESSION_ACTIVITY_KEY);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  } catch {
    return Date.now();
  }
}

export function setSharedLastActivityAt(timestamp = Date.now()) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSION_ACTIVITY_KEY, String(timestamp));
  } catch {
    // private mode / quota
  }
}

export function subscribeToSharedActivity(callback) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event) => {
    if (event.key !== SESSION_ACTIVITY_KEY || !event.newValue) return;
    const ts = parseInt(event.newValue, 10);
    if (Number.isFinite(ts)) callback(ts);
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

function getLogoutChannel() {
  if (typeof window === 'undefined') return null;
  if (!logoutChannel && typeof BroadcastChannel !== 'undefined') {
    try {
      logoutChannel = new BroadcastChannel(SESSION_LOGOUT_CHANNEL);
    } catch {
      logoutChannel = null;
    }
  }
  return logoutChannel;
}

export function isLogoutInProgress() {
  return logoutInProgress;
}

export function broadcastSessionLogout(message) {
  const channel = getLogoutChannel();
  if (channel) {
    try {
      channel.postMessage({ type: 'SESSION_LOGOUT', message, at: Date.now() });
    } catch {
      // ignore
    }
  }
  try {
    localStorage.setItem(SESSION_LOGOUT_MSG_KEY, message || '');
    localStorage.setItem(`${SESSION_LOGOUT_LOCK_KEY}_signal`, String(Date.now()));
    localStorage.removeItem(`${SESSION_LOGOUT_LOCK_KEY}_signal`);
  } catch {
    // storage event for other tabs
  }
}

export function subscribeToSessionLogout(callback) {
  if (typeof window === 'undefined') return () => {};
  const cleanups = [];

  const channel = getLogoutChannel();
  if (channel) {
    const handler = (event) => {
      if (event.data?.type === 'SESSION_LOGOUT') {
        callback(event.data.message);
      }
    };
    channel.addEventListener('message', handler);
    cleanups.push(() => channel.removeEventListener('message', handler));
  }

  const onStorage = (event) => {
    if (event.key !== `${SESSION_LOGOUT_LOCK_KEY}_signal`) return;
    try {
      const msg =
        localStorage.getItem(SESSION_LOGOUT_MSG_KEY) ||
        'Session ended. Please log in again.';
      callback(msg);
    } catch {
      callback('Session ended. Please log in again.');
    }
  };
  window.addEventListener('storage', onStorage);
  cleanups.push(() => window.removeEventListener('storage', onStorage));

  return () => cleanups.forEach((fn) => fn());
}

export function tryAcquireLogoutLock() {
  if (typeof window === 'undefined') return true;
  try {
    const now = Date.now();
    const existing = localStorage.getItem(SESSION_LOGOUT_LOCK_KEY);
    if (existing) {
      const ts = parseInt(existing, 10);
      if (Number.isFinite(ts) && now - ts < LOGOUT_LOCK_TTL_MS) {
        return false;
      }
    }
    localStorage.setItem(SESSION_LOGOUT_LOCK_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

export function clientHasIdentityCookies(getCookie) {
  return Boolean(getCookie('uid') || getCookie('email'));
}

/**
 * True within ~15s after login — avoids false logout while cookies propagate.
 */
export function isWithinPostLoginGrace(getCookie) {
  const raw = getCookie('loginAt') || getCookie('LAST_ACTIVITY');
  if (!raw) return false;
  const ts = parseInt(raw, 10);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < POST_LOGIN_GRACE_MS;
}

/**
 * Decide whether a 401 auth error should trigger logout.
 * @param {object} errData - JSON body from API
 * @param {Function} getCookie - e.g. Cookies.get
 * @param {Function} [retryFetch] - optional async () => Response
 */
export async function shouldLogoutOnAuthError(errData, getCookie, retryFetch) {
  const code = errData?.code;
  const requiresLogin = errData?.requiresLogin;

  if (!requiresLogin) return { logout: false };
  if (code === SESSION_ERROR_CODES.DB_ERROR) return { logout: false };

  const hasIdentity = clientHasIdentityCookies(getCookie);

  if (code === SESSION_ERROR_CODES.USER_INACTIVE) {
    return {
      logout: true,
      message: errData.message || 'Account is not active',
    };
  }

  if (code === SESSION_ERROR_CODES.NO_SESSION_ID && hasIdentity) {
    return { logout: false };
  }

  if (code === SESSION_ERROR_CODES.NO_SESSION_ID && !hasIdentity) {
    return {
      logout: true,
      message: errData.message || 'Session expired. Please log in again.',
    };
  }

  if (code === SESSION_ERROR_CODES.NO_UID && hasIdentity) {
    if (retryFetch) {
      for (let i = 0; i < 2; i += 1) {
        await sleep(1500);
        try {
          const retryRes = await retryFetch();
          if (retryRes?.ok) return { logout: false };
        } catch {
          // continue
        }
      }
    }
    if (hasIdentity) return { logout: false };
  }

  if (
    code === SESSION_ERROR_CODES.SESSION_MISMATCH ||
    code === SESSION_ERROR_CODES.USER_NOT_FOUND
  ) {
    return {
      logout: true,
      message: errData.message || 'Session expired. Please log in again.',
    };
  }

  if (code === SESSION_ERROR_CODES.NO_UID && !hasIdentity) {
    return {
      logout: true,
      message: errData.message || 'Unauthorized - No session',
    };
  }

  // Legacy responses without structured code
  if (!code && requiresLogin) {
    if (hasIdentity) return { logout: false };
    return {
      logout: true,
      message: errData.message || 'Session expired. Please log in again.',
    };
  }

  return { logout: false };
}

/**
 * Perform coordinated logout — only one tab calls /api/logout.
 */
export async function coordinatedSessionLogout({
  message,
  reason,
  redirect,
}) {
  if (logoutInProgress) return;
  logoutInProgress = true;

  broadcastSessionLogout(message);

  const acquired = tryAcquireLogoutLock();
  if (acquired) {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'session_invalid' }),
      });
    } catch (error) {
      console.error('[sessionTabSync] Logout request failed:', error);
    }
  }

  if (typeof redirect === 'function') {
    redirect(message);
  }
}
