import { getSupabaseAdmin } from '../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { workerId, action, details } = req.body;
    
    const supabase = getSupabaseAdmin();
    
    // Insert activity log
    // worker_id is NULL for system-level activities, UUID for user activities
    const { error } = await supabase
      .from('recent_activities')
      .insert({
        worker_id: workerId && workerId !== 'SYSTEM' ? workerId : null,
        action,
        details: details || {},
        timestamp: new Date().toISOString(),
        type: 'session_management'
      });

    if (error) {
      throw error;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Logging error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 