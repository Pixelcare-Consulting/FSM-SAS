import { createClient } from '@supabase/supabase-js';

// Supabase client configuration for browser/client-side usage
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not set. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Create a single supabase client for the browser
let supabaseClient = null;

export function getSupabaseClient() {
  if (typeof window === 'undefined') {
    // Server-side: return null or handle differently
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
  }

  return supabaseClient;
}

// Export default client
export const supabase = typeof window !== 'undefined' ? getSupabaseClient() : null;

// Test connection function
export async function testSupabaseConnection() {
  try {
    if (typeof window === 'undefined') {
      return { success: false, error: 'Client-side only' };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { success: false, error: 'Supabase client not initialized' };
    }

    // Test database connection
    const { data, error } = await client
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

