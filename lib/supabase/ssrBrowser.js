/**
 * Cookie-aware browser client via @supabase/ssr (portal Auth JWT cookies).
 * Optional gradual alternative to lib/supabase/client.js — does not replace
 * custom uid/sessionId portal cookies or field Bearer auth.
 */

import { createBrowserClient } from '@supabase/ssr';

/**
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createSupabaseSsrBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase SSR browser client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  return createBrowserClient(url, anonKey);
}
