/**
 * Phase 2: Sync a job to SAP Activities (create or update).
 * POST /api/jobs/sync-to-sap
 * Body: { jobId: string }
 * Requires SAP session cookies (B1SESSION, ROUTEID).
 */

import { getSupabaseAdmin } from '../../../lib/supabase/server';
import sapService from '../../../lib/services/sapService';
import { syncJobToSAP } from '../../../lib/services/jobSyncToSap';
import { previewJobSyncToSAP } from '../../../lib/services/jobSyncSapPlan';
import {
  AUDIT_SOURCE,
  logJobSyncResult,
} from '../../../lib/services/auditLog';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const sessionCookies = sapService.getSessionCookies(req);
  if (!sessionCookies) {
    return res.status(401).json({
      success: false,
      error: 'SAP session required',
      message: 'Please log in to SAP Business One and try again.'
    });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  const jobId = body.jobId;
  const dryRun = body.dryRun === true || body.dry_run === true;
  if (!jobId) {
    return res.status(400).json({ success: false, error: 'jobId is required' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  if (dryRun) {
    const preview = await previewJobSyncToSAP({ jobId, supabase, sessionCookies });
    if (!preview.success) {
      return res.status(500).json({ success: false, error: preview.error });
    }
    return res.status(200).json({
      success: true,
      dryRun: true,
      message: 'Dry run — no SAP calls or DB updates',
      log: preview.log,
      plan: preview.plan,
    });
  }

  const result = await syncJobToSAP({ jobId, supabase, sessionCookies });

  if (result.success) {
    await logJobSyncResult({
      req,
      jobId,
      jobNumber: result.job_number,
      result,
      source: AUDIT_SOURCE.API,
    });

    return res.status(200).json({
      success: true,
      message: 'Job synced to SAP',
      sap_activity_id: result.sap_activity_id
    });
  }

  await logJobSyncResult({
    req,
    jobId,
    jobNumber: result.job_number,
    result,
    source: AUDIT_SOURCE.API,
  });

  return res.status(500).json({
    success: false,
    error: result.error || 'Sync failed'
  });
}
