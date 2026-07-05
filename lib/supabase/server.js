import { createClient } from '@supabase/supabase-js';

// Supabase server-side client with service role key for admin operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('Supabase server environment variables are not set. Please configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

// Create server-side Supabase client with service role key
// This bypasses Row Level Security (RLS) and should only be used server-side
let supabaseAdmin = null;

export function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase admin credentials are not configured');
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return supabaseAdmin;
}

// Get a Supabase client for a specific user (for RLS)
export function createServerClient(accessToken) {
  if (!supabaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Supabase credentials are not configured');
  }

  return createClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

// Test admin connection
export async function testSupabaseAdminConnection() {
  try {
    const admin = getSupabaseAdmin();
    
    const { data, error } = await admin
      .from('users')
      .select('id')
      .limit(1);

    if (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }

    return {
      success: true,
      connection: true,
      recordsFound: data?.length || 0
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export { getSupabaseAdmin as supabaseAdmin };

