import { companyMemoService } from '../../../lib/supabase/database';
import { getSupabaseAdmin } from '../../../lib/supabase/server';

/**
 * GET portal update / release notes (company memos in Update Logs folder).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const uid = req.cookies?.uid;
  if (!uid) {
    return res.status(401).json({ message: 'Not authenticated', entries: [] });
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return res.status(500).json({ message: 'Server configuration error', entries: [] });
  }

  try {
    const entries = await companyMemoService.listForUpdateLogs(admin);
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json({ entries });
  } catch (e) {
    console.error('[company-memos/update-logs]', e?.message || e);
    return res.status(500).json({ message: 'Failed to load update logs', entries: [] });
  }
}
