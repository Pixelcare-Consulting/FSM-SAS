/**
 * Pages-friendly @supabase/ssr helpers (anon key + Auth cookies only).
 * Not for service-role admin — use getSupabaseAdmin from ./server.js.
 * Does not validate users.current_session_id (that stays in requireSession).
 */

import { createServerClient as createSsrServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

/**
 * Refresh Supabase Auth JWT cookies on a portal page request.
 * Call from root proxy.js only — never from /api/v1/field or cron.
 *
 * @param {import('next/server').NextRequest} request
 * @returns {Promise<import('next/server').NextResponse>}
 */
export async function updateSupabaseAuthSession(request) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createSsrServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Required: refresh Auth JWT cookies when present. Do not insert logic between
  // createServerClient and getUser() (race / random logout risk).
  await supabase.auth.getUser();

  return supabaseResponse;
}

/**
 * Cookie-aware Supabase client for Pages `getServerSideProps` ({ req, res }).
 * Writes refreshed Auth cookies onto `res` when needed.
 *
 * @param {{ req: import('http').IncomingMessage & { cookies?: Record<string, string> }, res: import('http').ServerResponse }} context
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createSupabaseSsrPagesClient({ req, res }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase SSR pages client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  return createSsrServerClient(url, anonKey, {
    cookies: {
      getAll() {
        const raw = req.headers.cookie || '';
        if (!raw) return [];
        return raw.split(';').map((part) => {
          const idx = part.indexOf('=');
          if (idx === -1) {
            return { name: part.trim(), value: '' };
          }
          return {
            name: part.slice(0, idx).trim(),
            value: part.slice(idx + 1).trim(),
          };
        });
      },
      setAll(cookiesToSet) {
        const existing = res.getHeader('Set-Cookie');
        const list = [];
        if (existing) {
          if (Array.isArray(existing)) list.push(...existing);
          else list.push(String(existing));
        }
        cookiesToSet.forEach(({ name, value, options }) => {
          const parts = [`${name}=${value}`];
          if (options?.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
          if (options?.domain) parts.push(`Domain=${options.domain}`);
          if (options?.path) parts.push(`Path=${options.path}`);
          else parts.push('Path=/');
          if (options?.expires) {
            parts.push(`Expires=${new Date(options.expires).toUTCString()}`);
          }
          if (options?.httpOnly) parts.push('HttpOnly');
          if (options?.secure) parts.push('Secure');
          if (options?.sameSite) {
            const ss =
              typeof options.sameSite === 'string'
                ? options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1)
                : options.sameSite;
            parts.push(`SameSite=${ss}`);
          }
          list.push(parts.join('; '));
        });
        res.setHeader('Set-Cookie', list);
      },
    },
  });
}
