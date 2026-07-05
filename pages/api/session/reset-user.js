import { requireSession } from '../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { userService } from '../../../lib/supabase/database';
import { invalidateListCache } from '../../../lib/supabase/listQueryHelpers';
import {
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
  writeAuditLogFromRequest,
} from '../../../lib/services/auditLog';

function isAdminRequest(req, session) {
  if (req.cookies?.isAdmin === 'true') return true;
  const role = session?.user?.role;
  return role === 'ADMIN';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  if (!isAdminRequest(req, session)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const actorId = session.user?.id || req.cookies?.uid || null;
  const actorEmail = req.cookies?.email || null;
  const actorName = req.cookies?.fullName || null;

  const { userId, reason } = req.body || {};
  const targetUserId = userId != null ? String(userId).trim() : '';
  const resetReason =
    reason != null && String(reason).trim() !== ''
      ? String(reason).trim()
      : 'admin_initiated_user_session_reset';

  if (!targetUserId) {
    return res.status(400).json({ message: 'userId is required' });
  }

  const supabaseAdmin = getSupabaseAdmin();

  let before = null;
  try {
    before = await userService.findById(targetUserId, supabaseAdmin);
  } catch (error) {
    console.warn('[session/reset-user] Failed to read target user state:', error?.message || error);
  }

  const prevHadSessionId =
    before?.current_session_id != null && String(before.current_session_id).trim() !== '';

  try {
    await userService.update(
      targetUserId,
      { is_logged_in: false, current_session_id: null },
      supabaseAdmin
    );

    invalidateListCache('session-users:');

    await writeAuditLogFromRequest(req, {
      userId: actorId,
      userEmail: actorEmail,
      userName: actorName,
      action: AUDIT_ACTIONS.SESSION_RESET,
      category: AUDIT_CATEGORIES.AUTH,
      description: 'Admin reset user session',
      entityType: 'user',
      entityId: targetUserId,
      entityLabel: before?.username || targetUserId,
      details: {
        reason: resetReason,
        targetUserId,
        targetUsername: before?.username ?? null,
        prevHadSessionId,
        prevIsLoggedIn: before?.is_logged_in ?? null,
      },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[session/reset-user] Error:', error?.message || error);

    await writeAuditLogFromRequest(req, {
      userId: actorId,
      userEmail: actorEmail,
      userName: actorName,
      action: AUDIT_ACTIONS.SESSION_RESET,
      category: AUDIT_CATEGORIES.AUTH,
      description: 'Admin reset user session failed',
      entityType: 'user',
      entityId: targetUserId,
      entityLabel: before?.username || targetUserId,
      details: {
        reason: resetReason,
        targetUserId,
        targetUsername: before?.username ?? null,
        prevHadSessionId,
        error: error?.message || String(error),
      },
      status: AUDIT_STATUS.FAILURE,
    });

    return res.status(500).json({ message: 'Internal server error' });
  }
}

