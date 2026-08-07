import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { userService } from '../../../../lib/supabase/database';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
} from '../../../../lib/services/auditLog';
import { markJobMessagesRead } from '../../../../lib/jobs/jobMessageReads';
import { invalidateListCache } from '../../../../lib/supabase/listQueryHelpers';

const MESSAGE_SELECT =
  'id, job_id, technician_job_id, sender_type, message, image_url, admin_id, created_at, updated_at, deleted_at, deleted_by_user_ids';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolve a technician_jobs.id for the job (column is NOT NULL in production).
 */
async function resolveTechnicianJobId(supabase, jobId, requestedId) {
  if (requestedId && UUID_RE.test(String(requestedId))) {
    const { data } = await supabase
      .from('technician_jobs')
      .select('id')
      .eq('id', requestedId)
      .eq('job_id', jobId)
      .is('deleted_at', null)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const { data: fallback, error } = await supabase
    .from('technician_jobs')
    .select('id')
    .eq('job_id', jobId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('Messages API: technician_jobs lookup failed', error.message);
  }
  return fallback?.id || null;
}

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

    if (!userData?.id && !uid) {
      return res.status(401).json({
        success: false,
        message: 'User id not available',
      });
    }

    const resolvedSenderType = sender_type === 'TECHNICIAN' ? 'TECHNICIAN' : 'ADMIN';
    const adminUserId =
      resolvedSenderType === 'ADMIN' ? String(userData?.id ?? uid) : null;

    const supabase = getSupabaseAdmin();
    const resolvedTechnicianJobId = await resolveTechnicianJobId(
      supabase,
      jobId,
      technician_job_id
    );

    if (!resolvedTechnicianJobId) {
      return res.status(400).json({
        success: false,
        message:
          'This job has no technician assignment yet. Assign a technician before sending messages.',
      });
    }

    const insertPayload = {
      job_id: jobId,
      technician_job_id: resolvedTechnicianJobId,
      sender_type: resolvedSenderType,
      message: messageText,
      image_url: null,
    };

    let includeAdminId = false;
    if (resolvedSenderType === 'ADMIN' && adminUserId && UUID_RE.test(adminUserId)) {
      // Intended: users.id. Production may still FK to technicians(user_id) — retry without on failure.
      includeAdminId = true;
      insertPayload.admin_id = adminUserId;
    }

    if (resolvedSenderType === 'ADMIN') {
      console.log('Messages API: inserting with admin_id', {
        admin_id: insertPayload.admin_id || null,
        uid,
        jobId: String(jobId).slice(0, 8),
        technician_job_id: resolvedTechnicianJobId,
      });
    }

    let { data: inserted, error } = await supabase
      .from('job_technician_admin_messages')
      .insert(insertPayload)
      .select(MESSAGE_SELECT)
      .single();

    // Wrong production FK (technicians.user_id): retry without admin_id so send still works.
    if (
      error &&
      includeAdminId &&
      /admin_id|technicians|foreign key/i.test(String(error.message || ''))
    ) {
      console.warn(
        'Messages API: admin_id rejected by FK; retrying without admin_id',
        error.message
      );
      delete insertPayload.admin_id;
      const retry = await supabase
        .from('job_technician_admin_messages')
        .insert(insertPayload)
        .select(MESSAGE_SELECT)
        .single();
      inserted = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Messages API insert error:', error);
      return res.status(500).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }

    let data = inserted;

    // Sender's own message should never appear unread for them.
    if (data?.id && resolvedSenderType === 'ADMIN' && adminUserId) {
      try {
        await markJobMessagesRead(supabase, adminUserId, [data.id]);
        invalidateListCache('job-messages-');
      } catch (readErr) {
        console.warn('Messages API: mark own message read failed', readErr?.message);
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
        technician_job_id: resolvedTechnicianJobId,
        admin_id: data?.admin_id || null,
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
