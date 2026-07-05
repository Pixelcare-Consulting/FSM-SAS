import { getSupabaseAdmin } from '../../../lib/supabase/server';

/**
 * Verify dashboard identity cookies and that the user is an ADMIN in public.users.
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @returns {Promise<{ uid: string, email: string | null, admin: ReturnType<typeof getSupabaseAdmin> } | null>}
 */
export async function requireAdminUser(req, res) {
  const uid = req.cookies?.uid;
  const email =
    typeof req.cookies?.email === 'string' && req.cookies.email.trim()
      ? req.cookies.email.trim()
      : null;
  if (!uid) {
    res.status(401).json({ message: 'Not authenticated' });
    return null;
  }
  if (req.cookies?.isAdmin !== 'true') {
    res.status(403).json({ message: 'Admin access required' });
    return null;
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    res.status(500).json({ message: 'Server configuration error' });
    return null;
  }

  const { data: user, error } = await admin
    .from('users')
    .select('id, role, deleted_at')
    .eq('id', uid)
    .maybeSingle();

  if (error) {
    console.error('[company-memos API] user lookup:', error);
    res.status(500).json({ message: 'Failed to verify user' });
    return null;
  }
  if (!user || user.deleted_at != null || user.role !== 'ADMIN') {
    res.status(403).json({ message: 'Admin access required' });
    return null;
  }

  return { uid, email, admin };
}
