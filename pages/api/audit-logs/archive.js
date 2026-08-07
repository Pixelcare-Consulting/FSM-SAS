import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { invalidateListCache } from '../../../lib/supabase/listQueryHelpers';
import {
  previewAuditLogsArchive,
  archiveAuditLogs,
} from '../../../lib/services/auditLog';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const mode = String(body.mode || '').toLowerCase();
    const before = body.before;

    if (mode !== 'preview' && mode !== 'delete') {
      return res.status(400).json({
        success: false,
        error: 'mode must be "preview" or "delete"',
      });
    }

    const supabase = getSupabaseAdmin();

    if (mode === 'preview') {
      const result = await previewAuditLogsArchive({ supabase, before });
      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }
      return res.status(200).json({
        success: true,
        before: result.before,
        toDelete: result.toDelete,
        toKeep: result.toKeep,
      });
    }

    const result = await archiveAuditLogs({
      supabase,
      before,
      req,
    });

    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error });
    }

    invalidateListCache('audit-logs:');

    return res.status(200).json({
      success: true,
      before: result.before,
      deleted: result.deleted,
      toKeep: result.toKeep,
    });
  } catch (err) {
    console.error('[api/audit-logs/archive]', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal error',
    });
  }
}
