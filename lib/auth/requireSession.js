/**
 * Single-device-per-user session validation.
 * Validates that the request's sessionId (cookie or Bearer) matches users.current_session_id.
 * When a user logs in on a new device, the old device's sessionId no longer matches
 * and subsequent requests return 401.
 *
 * Auth modes:
 * - Cookie: `uid` + `sessionId` (+ optional `email` fallback for uid)
 * - Bearer: `Authorization: Bearer <sessionId>` + `X-Uid` (or `X-User-Id`)
 */

import { userService } from '../supabase/database';
import { getSupabaseAdmin } from '../supabase/server';
import { SESSION_ERROR_CODES } from './sessionTabSync';
import {
  getCachedSessionUser,
  invalidateCachedSessionUser,
  resolveSessionUserWithDedupe,
  setCachedSessionUser,
} from './sessionValidationCache';

const UNAUTHORIZED_MESSAGE = 'Session expired. Another device may have logged in. Please log in again.';

export { SESSION_ERROR_CODES };

/** Clear cached session rows for a user (e.g. on logout or session reset). */
export function invalidateSessionCache(uid) {
  invalidateCachedSessionUser(uid);
}

function sendUnauthorized(res, code, message, requiresLogin = true) {
  const status = code === SESSION_ERROR_CODES.USER_INACTIVE ? 403 : 401;
  res.status(status).json({
    code,
    message,
    requiresLogin,
  });
}

/**
 * Extract Bearer token from Authorization header.
 * @param {import('next').NextApiRequest} req
 * @returns {string|null}
 */
export function getBearerToken(req) {
  const raw = req.headers?.authorization;
  if (!raw || typeof raw !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Resolve uid + sessionId from cookies or Bearer + X-Uid.
 * @param {import('next').NextApiRequest} req
 * @returns {{ uid: string|null, sessionId: string|null, email: string|null, authMode: 'cookie'|'bearer'|'none' }}
 */
export function resolveSessionCredentials(req) {
  const cookieUid = req.cookies?.uid || null;
  const cookieSessionId = req.cookies?.sessionId || null;
  const email = req.cookies?.email || null;

  if (cookieUid && cookieSessionId) {
    return {
      uid: cookieUid,
      sessionId: cookieSessionId,
      email,
      authMode: 'cookie',
    };
  }

  const bearer = getBearerToken(req);
  const headerUidRaw = req.headers['x-uid'] || req.headers['x-user-id'];
  const headerUid =
    typeof headerUidRaw === 'string' && headerUidRaw.trim()
      ? headerUidRaw.trim()
      : null;

  if (bearer && headerUid) {
    return {
      uid: headerUid,
      sessionId: bearer,
      email,
      authMode: 'bearer',
    };
  }

  if (cookieUid || cookieSessionId) {
    return {
      uid: cookieUid,
      sessionId: cookieSessionId,
      email,
      authMode: 'cookie',
    };
  }

  if (bearer || headerUid) {
    return {
      uid: headerUid,
      sessionId: bearer,
      email,
      authMode: 'bearer',
    };
  }

  return { uid: null, sessionId: null, email, authMode: 'none' };
}

/**
 * Validates session for single-device-per-user. Sends 401 and returns null if invalid.
 * Accepts cookie sessionId+uid or Authorization Bearer sessionId + X-Uid.
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @returns {Promise<{ user: object } | null>} User data if valid, null if 401 was sent
 */
export async function requireSession(req, res) {
  let { uid, sessionId, email, authMode } = resolveSessionCredentials(req);

  if (!uid && email) {
    try {
      const db = getSupabaseAdmin();
      const userByEmail = await userService.findByEmailForSession(email, db);
      if (userByEmail?.id) {
        uid = userByEmail.id;
      }
    } catch (error) {
      console.error('[requireSession] Email fallback error:', error.message);
      sendUnauthorized(res, SESSION_ERROR_CODES.DB_ERROR, UNAUTHORIZED_MESSAGE, false);
      return null;
    }
  }

  if (!uid) {
    console.warn('[requireSession] NO_UID', {
      path: req.url,
      authMode,
      hasEmail: !!email,
      hasSessionId: !!sessionId,
      hasB1Session: !!req.cookies?.B1SESSION,
    });
    sendUnauthorized(
      res,
      SESSION_ERROR_CODES.NO_UID,
      'Unauthorized - No session'
    );
    return null;
  }

  if (!sessionId) {
    sendUnauthorized(res, SESSION_ERROR_CODES.NO_SESSION_ID, UNAUTHORIZED_MESSAGE);
    return null;
  }

  const cachedUser = getCachedSessionUser(uid, sessionId);
  if (cachedUser) {
    if (cachedUser.status !== 'ACTIVE') {
      sendUnauthorized(res, SESSION_ERROR_CODES.USER_INACTIVE, 'Account is not active');
      return null;
    }
    return { user: cachedUser };
  }

  try {
    const db = getSupabaseAdmin();
    let userData = await resolveSessionUserWithDedupe(uid, sessionId, () =>
      userService.findByIdForSession(uid, db)
    );
    if (!userData && email) {
      userData = await userService.findByEmailForSession(email, db);
    }
    if (!userData) {
      sendUnauthorized(res, SESSION_ERROR_CODES.USER_NOT_FOUND, UNAUTHORIZED_MESSAGE);
      return null;
    }

    if (userData.status !== 'ACTIVE') {
      sendUnauthorized(res, SESSION_ERROR_CODES.USER_INACTIVE, 'Account is not active');
      return null;
    }

    const storedSessionId = userData.current_session_id;
    if (storedSessionId !== null && storedSessionId !== sessionId) {
      console.warn('[requireSession] SESSION_MISMATCH', {
        path: req.url,
        authMode,
        uidPresent: !!uid,
        uidPrefix: uid ? String(uid).slice(0, 8) : null,
        cookieSessionPrefix: sessionId ? String(sessionId).slice(0, 8) : null,
        storedSessionPrefix: storedSessionId ? String(storedSessionId).slice(0, 8) : null,
        hasEmail: !!email,
      });
      sendUnauthorized(res, SESSION_ERROR_CODES.SESSION_MISMATCH, UNAUTHORIZED_MESSAGE);
      return null;
    }

    setCachedSessionUser(uid, sessionId, userData);
    return { user: userData };
  } catch (error) {
    console.error('[requireSession] Error:', error.message);
    sendUnauthorized(res, SESSION_ERROR_CODES.DB_ERROR, UNAUTHORIZED_MESSAGE, false);
    return null;
  }
}

/**
 * Alias for mobile/Bearer callers — same validation as requireSession.
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @returns {Promise<{ user: object } | null>}
 */
export async function requireSessionOrBearer(req, res) {
  return requireSession(req, res);
}
