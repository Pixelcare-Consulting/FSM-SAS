import { getSupabaseClient } from '../supabase/client';
import { getSupabaseAdmin } from '../supabase/server';
import { userService } from '../supabase/database';
import { invalidateSessionCache, resolveSessionCredentials } from './requireSession';
import { serverLogActivity } from '../../utils/serverLogActivity';
import {
  writeAuditLogFromRequest,
  AUDIT_CATEGORIES,
  AUDIT_ACTIONS,
  AUDIT_STATUS,
} from '../services/auditLog';
import {
  isRequestSecure,
  buildClearSessionCookies,
} from './cookieSecurity';

/**
 * Portal logout using cookie and/or Bearer + X-Uid credentials.
 * Clears DB session flags, session cache, cookies, and optional SAP B1 session.
 *
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @param {{ user?: object }} [options] Pre-validated session user from requireSession (optional)
 */
export async function runPortalLogout(req, res, options = {}) {
  const isSecure = isRequestSecure(req);
  const creds = resolveSessionCredentials(req);
  const sessionUser = options.user || null;

  const uid = sessionUser?.id || creds.uid || null;
  const userEmail =
    sessionUser?.username ||
    sessionUser?.email ||
    req.cookies?.email ||
    creds.email ||
    null;
  const userName =
    sessionUser?.technicians?.[0]?.full_name ||
    sessionUser?.technicians?.full_name ||
    req.cookies?.fullName ||
    null;

  const logoutReason =
    (typeof req.body === 'object' && req.body?.reason) ||
    req.query?.reason ||
    'user_initiated';

  const auditLogout = (action, extra = {}, status = AUDIT_STATUS.SUCCESS) =>
    writeAuditLogFromRequest(req, {
      userId: uid,
      userEmail,
      userName,
      action,
      category: AUDIT_CATEGORIES.AUTH,
      description: action.replace(/_/g, ' ').toLowerCase(),
      details: extra,
      status,
    });

  try {
    await serverLogActivity(uid, 'LOGOUT_INITIATED', {
      timestamp: new Date().toISOString(),
      reason: logoutReason,
      authMode: creds.authMode,
      userAgent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    });

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (signOutErr) {
        console.warn('Supabase Auth signOut on logout:', signOutErr?.message);
      }
    }

    if (uid) {
      invalidateSessionCache(uid);
      try {
        const supabaseAdmin = getSupabaseAdmin();
        await userService.update(
          uid,
          { is_logged_in: false, current_session_id: null },
          supabaseAdmin
        );
      } catch (sessionClearErr) {
        console.warn('Failed to clear portal session flags on logout:', sessionClearErr.message);
      }
    }

    const cookiesToClear = buildClearSessionCookies(isSecure);
    res.setHeader('Set-Cookie', cookiesToClear);

    const b1Session = req.cookies?.B1SESSION;
    if (b1Session) {
      try {
        await fetch(`${process.env.SAP_SERVICE_LAYER_BASE_URL}Logout`, {
          method: 'POST',
          headers: {
            Cookie: `B1SESSION=${b1Session}`,
          },
        });

        await serverLogActivity(uid, 'SAP_B1_LOGOUT_SUCCESS', {
          timestamp: new Date().toISOString(),
          sessionId: b1Session.substring(0, 8) + '...',
        });
      } catch (error) {
        console.warn('Failed to invalidate SAP B1 session:', error);
        await serverLogActivity(uid, 'SAP_B1_LOGOUT_FAILED', {
          timestamp: new Date().toISOString(),
          error: error.message,
        });
      }
    }

    await serverLogActivity(uid, 'LOGOUT_SUCCESS', {
      timestamp: new Date().toISOString(),
      reason: logoutReason,
      clearedCookies: cookiesToClear.length,
    });

    await auditLogout(AUDIT_ACTIONS.LOGOUT, {
      clearedCookies: cookiesToClear.length,
      reason: logoutReason,
      authMode: creds.authMode,
    });

    return res.status(200).json({
      success: true,
      message: 'Logout successful',
      cleared: cookiesToClear.length,
    });
  } catch (error) {
    console.error('Logout error:', error);

    await serverLogActivity(uid, 'LOGOUT_FAILED', {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
    });
    await auditLogout(AUDIT_ACTIONS.LOGOUT, { error: error.message }, AUDIT_STATUS.FAILURE);

    res.setHeader('Set-Cookie', buildClearSessionCookies(isSecure));

    return res.status(500).json({
      message: 'Partial logout completed with errors',
      error: error.message,
    });
  }
}
