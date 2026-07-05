/**
 * API endpoint to clean up duplicate leads
 * POST /api/leads/cleanup-duplicates - Remove duplicate leads based on email + timestamp or response ID
 */

import { leadService } from '../../../lib/supabase/database';
import { getSupabaseAdmin } from '../../../lib/supabase/server';

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    
    // Get all leads
    const { data: allLeads, error: fetchError } = await supabase
      .from('leads')
      .select('id, email, submitted_at, google_form_response_id, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (fetchError) {
      throw fetchError;
    }

    if (!allLeads || allLeads.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No leads found',
        removed: 0,
        kept: 0
      });
    }

    // Group by unique keys
    const seenByResponseId = new Map(); // google_form_response_id -> first lead ID
    const seenByEmailTimestamp = new Map(); // email_timestamp -> first lead ID
    const duplicatesToRemove = [];

    for (const lead of allLeads) {
      let isDuplicate = false;

      // Check by response ID first (most reliable)
      if (lead.google_form_response_id) {
        if (seenByResponseId.has(lead.google_form_response_id)) {
          // This is a duplicate by response ID
          duplicatesToRemove.push(lead.id);
          isDuplicate = true;
        } else {
          seenByResponseId.set(lead.google_form_response_id, lead.id);
        }
      }

      // Also check by email + timestamp (fallback for old records)
      if (!isDuplicate && lead.email && lead.submitted_at) {
        const key = `${lead.email}_${lead.submitted_at}`;
        if (seenByEmailTimestamp.has(key)) {
          // This is a duplicate by email + timestamp
          duplicatesToRemove.push(lead.id);
        } else {
          seenByEmailTimestamp.set(key, lead.id);
        }
      }
    }

    // Soft delete duplicates
    let removed = 0;
    if (duplicatesToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from('leads')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', duplicatesToRemove);

      if (deleteError) {
        throw deleteError;
      }

      removed = duplicatesToRemove.length;
    }

    return res.status(200).json({
      success: true,
      message: `Cleanup completed: ${removed} duplicate(s) removed, ${allLeads.length - removed} unique lead(s) kept`,
      removed,
      kept: allLeads.length - removed,
      total: allLeads.length
    });

  } catch (error) {
    console.error('Error in cleanup-duplicates API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

