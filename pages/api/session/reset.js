import { requireSession } from '../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { userService } from '../../../lib/supabase/database';
import {
  writeAuditLogFromRequest,
  AUDIT_CATEGORIES,
  AUDIT_ACTIONS,
  AUDIT_STATUS,
} from '../../../lib/services/auditLog';
import {
  isRequestSecure,
  buildClearSessionCookies,
} from '../../../lib/auth/cookieSecurity';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const isSecure = isRequestSecure(req);
  const session = await requireSession(req, res);
  if (!session) return;

  const uid = session.user?.id || req.cookies?.uid || null;
  const userEmail = req.cookies?.email || null;
  const userName = req.cookies?.fullName || null;

  const supabaseAdmin = getSupabaseAdmin();

  let before = null;
  try {
    if (uid) {
      before = await userService.findById(uid, supabaseAdmin);
    }
  } catch (error) {
    console.warn('[session/reset] Failed to read current user state:', error?.message || error);
  }

  const prevHadSessionId =
    before?.current_session_id != null && String(before.current_session_id).trim() !== '';

  try {
    if (!uid) {
      await writeAuditLogFromRequest(req, {
        action: AUDIT_ACTIONS.SESSION_RESET,
        category: AUDIT_CATEGORIES.AUTH,
        description: 'Session reset failed (missing uid)',
        details: { reason: 'missing_uid' },
        status: AUDIT_STATUS.FAILURE,
      });
      return res.status(401).json({ message: 'Unauthorized - No session' });
    }

    await userService.update(uid, { is_logged_in: false, current_session_id: null }, supabaseAdmin);

    res.setHeader('Set-Cookie', buildClearSessionCookies(isSecure));

    await writeAuditLogFromRequest(req, {
      userId: uid,
      userEmail,
      userName,
      action: AUDIT_ACTIONS.SESSION_RESET,
      category: AUDIT_CATEGORIES.AUTH,
      description: 'Session reset',
      details: {
        reason: 'user_initiated_session_reset',
        prevHadSessionId,
        prevIsLoggedIn: before?.is_logged_in ?? null,
      },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[session/reset] Error:', error?.message || error);

    await writeAuditLogFromRequest(req, {
      userId: uid,
      userEmail,
      userName,
      action: AUDIT_ACTIONS.SESSION_RESET,
      category: AUDIT_CATEGORIES.AUTH,
      description: 'Session reset failed',
      details: {
        reason: 'server_error',
        error: error?.message || String(error),
        prevHadSessionId,
      },
      status: AUDIT_STATUS.FAILURE,
    });

    res.setHeader('Set-Cookie', buildClearSessionCookies(isSecure));
    return res.status(500).json({ message: 'Internal server error' });
  }
}
