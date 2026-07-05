import { requireSession } from '../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { userService } from '../../../lib/supabase/database';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, no-store');

  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const uid = session.user?.id;
    const supabaseAdmin = getSupabaseAdmin();
    const user = await userService.findById(uid, supabaseAdmin);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentSessionId = user.current_session_id ?? null;

    return res.status(200).json({
      success: true,
      session: {
        // Preserve nulls so UI can show "Unknown" if legacy rows weren't backfilled
        is_logged_in:
          user.is_logged_in === null || user.is_logged_in === undefined
            ? null
            : Boolean(user.is_logged_in),
        current_session_id_present: currentSessionId != null && String(currentSessionId).trim() !== '',
        updated_at: user.updated_at ?? null,
      },
    });
  } catch (error) {
    console.error('[session/status] Error:', error?.message || error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

