/**
 * API endpoint to list Google Forms from database
 * GET /api/google-forms/list - Get all active Google Forms
 */

import { getSupabaseAdmin } from '../../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('google_forms')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching Google Forms:', error);
      return res.status(500).json({
        error: 'Failed to fetch Google Forms',
        message: error.message
      });
    }

    return res.status(200).json({
      success: true,
      forms: data || []
    });

  } catch (error) {
    console.error('Error in Google Forms list API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

