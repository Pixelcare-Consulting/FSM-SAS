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

function normalizeUserIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((v) => (v != null ? String(v).trim() : ''))
    .filter(Boolean);
  return [...new Set(ids)];
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

  const { userIds, reason } = req.body || {};
  const targetUserIds = normalizeUserIds(userIds);
  const resetReason =
    reason != null && String(reason).trim() !== ''
      ? String(reason).trim()
      : 'admin_initiated_user_session_reset_batch';

  if (targetUserIds.length === 0) {
    return res.status(400).json({ message: 'userIds is required' });
  }

  if (targetUserIds.length > 200) {
    return res.status(400).json({ message: 'Too many userIds (max 200)' });
  }

  const supabaseAdmin = getSupabaseAdmin();

  let resetCount = 0;
  const failedIds = [];

  for (const targetUserId of targetUserIds) {
    let before = null;
    try {
      before = await userService.findById(targetUserId, supabaseAdmin);
    } catch (error) {
      console.warn(
        '[session/reset-users] Failed to read target user state:',
        targetUserId,
        error?.message || error
      );
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

      resetCount += 1;

      await writeAuditLogFromRequest(req, {
        userId: actorId,
        userEmail: actorEmail,
        userName: actorName,
        action: AUDIT_ACTIONS.SESSION_RESET,
        category: AUDIT_CATEGORIES.AUTH,
        description: 'Admin batch reset user session',
        entityType: 'user',
        entityId: targetUserId,
        entityLabel: before?.username || targetUserId,
        details: {
          reason: resetReason,
          targetUserId,
          targetUsername: before?.username ?? null,
          prevHadSessionId,
          prevIsLoggedIn: before?.is_logged_in ?? null,
          batch: true,
          batchSize: targetUserIds.length,
        },
        status: AUDIT_STATUS.SUCCESS,
      });
    } catch (error) {
      failedIds.push(targetUserId);
      console.error(
        '[session/reset-users] Error resetting user:',
        targetUserId,
        error?.message || error
      );

      await writeAuditLogFromRequest(req, {
        userId: actorId,
        userEmail: actorEmail,
        userName: actorName,
        action: AUDIT_ACTIONS.SESSION_RESET,
        category: AUDIT_CATEGORIES.AUTH,
        description: 'Admin batch reset user session failed',
        entityType: 'user',
        entityId: targetUserId,
        entityLabel: before?.username || targetUserId,
        details: {
          reason: resetReason,
          targetUserId,
          targetUsername: before?.username ?? null,
          prevHadSessionId,
          error: error?.message || String(error),
          batch: true,
          batchSize: targetUserIds.length,
        },
        status: AUDIT_STATUS.FAILURE,
      });
    }
  }

  const ok = failedIds.length === 0 && resetCount === targetUserIds.length;
  const anySuccess = resetCount > 0;

  return res.status(anySuccess ? 200 : 500).json({
    success: ok,
    resetCount,
    failedIds: failedIds.length ? failedIds : undefined,
  });
}

