import { getSupabaseAdmin } from '../lib/supabase/server';

export async function serverLogActivity(workerId, action, details) {
  try {
    // Clean up details object to remove undefined values
    const cleanDetails = Object.entries(details || {}).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});

    const supabase = getSupabaseAdmin();
    
    // Insert activity log
    // worker_id is NULL for system-level activities, UUID for user activities
    const { error } = await supabase
      .from('recent_activities')
      .insert({
        worker_id: workerId && workerId !== 'SYSTEM' ? workerId : null,
        action,
        details: cleanDetails,
        timestamp: new Date().toISOString(),
        type: 'session_management'
      });

    if (error) {
      throw error;
    }
    
    console.log('📝 Server activity logged:', { action, details: cleanDetails });
  } catch (error) {
    console.error('❌ Failed to log server activity:', error);
  }
} 