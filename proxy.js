import { NextResponse } from 'next/server';
import SESSION_CONFIG from './config/session.config';

// Helper function to check if a path is static
function isStaticPath(pathname) {
  return (
    // Dev server "filesystem" / tooling requests (commonly seen in dev logs)
    pathname.startsWith('/@fs/') ||
    pathname.startsWith('/__nextjs_') ||
    pathname.startsWith('/__turbopack/') ||
    pathname.startsWith('/_next') ||
    pathname.includes('/static/') ||
    pathname.includes('/images/') ||
    pathname.includes('/fonts/') ||
    pathname.includes('/assets/') ||
    pathname.includes('/media/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ttf') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.woff2')
  );
}

// Helper function to check if a path is an authentication page
function isAuthPath(pathname) {
  return (
    pathname === '/sign-in' ||
    pathname === '/authentication/sign-in' ||
    pathname.startsWith('/authentication/')
  );
}

// Helper function to safely parse expiry time
function parseExpiryTime(expiryValue) {
  if (!expiryValue) return null;
  
  try {
    const expiryTime = new Date(expiryValue).getTime();
    // Check if date is valid
    if (isNaN(expiryTime)) {
      console.warn('[Proxy] Invalid expiry time format:', expiryValue);
      return null;
    }
    return expiryTime;
  } catch (error) {
    console.warn('[Proxy] Error parsing expiry time:', error);
    return null;
  }
}

/**
 * Proxy for session validation
 * 
 * IMPORTANT: This proxy is LENIENT by design to prevent race conditions
 * during session renewal. Cookie propagation between browser and server can
 * have timing delays, especially during renewal.
 * 
 * Rules:
 * 1. NEVER delete cookies - this can race with renewal API setting new cookies
 * 2. Allow through if ANY session indicator exists (B1SESSION OR uid)
 * 3. Let client-side handle actual logout decisions
 * 4. Only redirect for truly unauthenticated requests (no cookies at all)
 */
export async function proxy(request) {
  const pathname = request.nextUrl.pathname;

  // Skip proxy for static paths, API routes, and authentication pages
  if (isStaticPath(pathname) || 
      pathname.startsWith('/api/') || 
      isAuthPath(pathname)) {
    return NextResponse.next();
  }
  
  // Get all relevant cookies
  const b1Session = request.cookies.get('B1SESSION')?.value;
  const b1SessionExpiry = request.cookies.get('B1SESSION_EXPIRY')?.value;
  const uid = request.cookies.get('uid')?.value;
  const workerId = request.cookies.get('workerId')?.value;
  const lastActivity = request.cookies.get('LAST_ACTIVITY')?.value;
  const sapConnectionStatus = request.cookies.get('sapConnectionStatus')?.value;

  // Log current cookie state for debugging
  const cookieState = {
    hasB1Session: !!b1Session,
    hasExpiry: !!b1SessionExpiry,
    hasUid: !!uid,
    hasWorkerId: !!workerId,
    hasLastActivity: !!lastActivity,
    hasSapStatus: !!sapConnectionStatus
  };

  // Count how many session indicators we have
  const sessionIndicators = [b1Session, uid, workerId, lastActivity, sapConnectionStatus].filter(Boolean).length;

  // For root path, be lenient - allow if ANY session indicator exists
  if (pathname === '/') {
    // Only redirect if we have ZERO session indicators
    // This prevents race conditions during renewal
    if (sessionIndicators === 0) {
      console.log('[Proxy] No session indicators on root path, redirecting to sign-in', cookieState);
      // DO NOT delete cookies - just redirect
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
    
    // Have at least one indicator - allow through
    // Client-side will handle any missing cookies
    if (sessionIndicators < 5) {
      console.log('[Proxy] Partial session on root path, allowing through (may be mid-renewal)', {
        ...cookieState,
        indicatorCount: sessionIndicators
      });
    }
    return NextResponse.next();
  }

  // For dashboard and protected routes
  // Be VERY lenient - allow if we have ANY session indicator
  // This prevents logout during renewal race conditions
  if (sessionIndicators === 0) {
    // No session indicators at all - this is a truly unauthenticated request
    console.log('[Proxy] No session indicators found, redirecting to sign-in', {
      pathname,
      ...cookieState
    });
    
    // IMPORTANT: DO NOT delete cookies!
    // The renewal API might have just set them, but they haven't propagated yet
    // Deleting here would cause a race condition
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  // We have at least one session indicator
  // Check if we're missing critical cookies (might be mid-renewal)
  if (!b1Session || !uid) {
    // console.log('[Proxy] Partial session detected (may be mid-renewal), allowing through', {
    //   pathname,
    //   ...cookieState,
    //   indicatorCount: sessionIndicators
    // });
    // Allow through - client-side will handle any issues
    // DO NOT redirect or delete cookies
    return NextResponse.next();
  }

  // Check session expiry if available
  if (b1SessionExpiry) {
    const expiryTime = parseExpiryTime(b1SessionExpiry);
    
    if (expiryTime) {
      const now = Date.now();
      const timeUntilExpiry = expiryTime - now;
      const minutesRemaining = Math.floor(timeUntilExpiry / 60000);
      
      // Only log if session is significantly expired (more than 2 minutes past expiry)
      // This prevents noise from normal renewal scenarios
      // Sessions close to expiry (< 5 min) are handled by client-side renewal mechanism
      if (timeUntilExpiry < -2 * 60 * 1000) {
        // Session expired more than 2 minutes ago - log as warning
        console.warn('[Proxy] Session significantly expired but allowing through (renewal in progress)', {
          pathname,
          expiredMinutesAgo: Math.abs(minutesRemaining)
        });
      }
      
      // ALWAYS allow through - never force logout from proxy
      // Client-side ActivityTracker handles renewal and warnings
      // Sessions close to expiry are automatically renewed by the client-side mechanism
    }
  } else {
    // No expiry cookie - might be during renewal
    // Only log if we have other session indicators (to avoid noise during initial load)
    if (sessionIndicators > 0) {
      // This is likely during renewal - don't log as it's expected behavior
      // Allow through and let client-side handle it
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude framework/static/dev-tooling routes from auth proxy
    '/((?!_next/static|_next/image|favicon.ico|@fs/|__nextjs_|__turbopack/).*)',
  ],
};
