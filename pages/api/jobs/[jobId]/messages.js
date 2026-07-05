import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { userService } from '../../../../lib/supabase/database';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
} from '../../../../lib/services/auditLog';

/**
 * POST /api/jobs/[jobId]/messages
 * Send a job chat message. For ADMIN messages, admin_id is set server-side from the logged-in user.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { jobId } = req.query;
    const { message, technician_job_id, sender_type } = req.body || {};

    if (!jobId || !message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Missing jobId or message',
      });
    }

    const messageText = message.trim();
    if (!messageText) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot be empty',
      });
    }

    let uid = req.cookies?.uid;
    if (!uid && req.headers?.cookie) {
      const match = req.headers.cookie.match(/uid=([^;]+)/);
      if (match) uid = decodeURIComponent(match[1].trim());
    }
    if (!uid) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - not logged in',
      });
    }

    let userData = null;
    try {
      userData = await userService.findById(uid);
    } catch (e) {
      console.warn('Messages API: user not found by uid', uid, e?.message);
      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    const resolvedSenderType = sender_type === 'TECHNICIAN' ? 'TECHNICIAN' : 'ADMIN';
    const adminUserId = resolvedSenderType === 'ADMIN' ? (userData?.id ?? uid) : null;
    if (resolvedSenderType === 'ADMIN' && !adminUserId) {
      return res.status(401).json({
        success: false,
        message: 'User id not available',
      });
    }

    const insertPayload = {
      job_id: jobId,
      technician_job_id: technician_job_id || null,
      sender_type: resolvedSenderType,
      message: messageText,
      image_url: null,
    };
    if (resolvedSenderType === 'ADMIN') {
      insertPayload.admin_id = String(adminUserId);
    }

    if (resolvedSenderType === 'ADMIN') {
      console.log('Messages API: inserting with admin_id', { admin_id: insertPayload.admin_id, uid, jobId: jobId?.slice(0, 8) });
    }

    const supabase = getSupabaseAdmin();
    const { data: inserted, error } = await supabase
      .from('job_technician_admin_messages')
      .insert(insertPayload)
      .select('id, job_id, technician_job_id, sender_type, message, image_url, admin_id, created_at, updated_at, deleted_at, deleted_by_user_ids')
      .single();

    if (error) {
      console.error('Messages API insert error:', error);
      return res.status(500).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }

    let data = inserted;
    if (resolvedSenderType === 'ADMIN' && inserted?.id && insertPayload.admin_id) {
      const { data: updated, error: updateErr } = await supabase
        .from('job_technician_admin_messages')
        .update({ admin_id: insertPayload.admin_id })
        .eq('id', inserted.id)
        .select('id, job_id, technician_job_id, sender_type, message, image_url, admin_id, created_at, updated_at, deleted_at, deleted_by_user_ids')
        .single();
      if (!updateErr && updated) {
        data = updated;
      } else if (updateErr) {
        console.error('Messages API admin_id update error:', updateErr);
      }
    }

    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.JOB_MESSAGE_CREATE,
      category: AUDIT_CATEGORIES.JOB,
      entityType: 'job',
      entityId: jobId,
      description: 'Job chat message created',
      details: {
        message_id: data?.id,
        sender_type: resolvedSenderType,
        technician_job_id: technician_job_id || null,
      },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error('Messages API error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to send message',
    });
  }
}
