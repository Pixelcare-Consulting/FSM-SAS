import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import { handleSessionError } from '../utils/middlewareClient';

/**
 * DEPRECATED: This hook is no longer actively used for session renewal.
 * Session management is now handled by ActivityTracker component in _app.js
 * This hook is kept for backward compatibility but should not be used in new code.
 * 
 * To use session renewal, ensure ActivityTracker is included in your _app.js:
 * <ActivityTracker />
 */
export const useSessionRenewal = () => {
  const router = useRouter();
  const isRenewing = useRef(false);
  const lastRenewalTime = useRef(0);

  useEffect(() => {
    // Skip if on authentication pages
    if (router.pathname.includes('/authentication')) {
      return;
    }

    const checkSession = async () => {
      const expiryTimeStr = Cookies.get('B1SESSION_EXPIRY');
      
      // Don't force logout if cookie missing - could be during propagation
      // ActivityTracker will handle session validation
      if (!expiryTimeStr) {
        console.warn('⚠️ [useSessionRenewal] B1SESSION_EXPIRY cookie missing, skipping check');
        return;
      }

      const timeUntilExpiry = new Date(expiryTimeStr).getTime() - Date.now();
      const timeSinceLastRenewal = Date.now() - lastRenewalTime.current;

      // Show warning if session expired but DON'T force logout
      // ActivityTracker handles logout decisions
      if (timeUntilExpiry <= 0) {
        console.warn('⚠️ [useSessionRenewal] Session appears expired, but not forcing logout (ActivityTracker manages this)');
        return;
      }

      // Only renew if:
      // 1. Less than 5 minutes remaining
      // 2. Not currently renewing
      // 3. Last renewal was more than 2 minutes ago (prevent conflicts with ActivityTracker)
      if (timeUntilExpiry < 5 * 60 * 1000 && 
          !isRenewing.current && 
          timeSinceLastRenewal > 2 * 60 * 1000) {
        try {
          isRenewing.current = true;
          console.log('🔄 [useSessionRenewal] Initiating session renewal...');

          const response = await fetch('/api/renewSAPB1Session', {
            method: 'POST',
            credentials: 'include'
          });

          if (!response.ok) {
            throw new Error('Session renewal failed');
          }

          const data = await response.json();
          if (data.success) {
            console.log('✅ [useSessionRenewal] Session renewed successfully');
            
            // Immediately update the cookie value using response data to avoid race conditions
            // Match server's security settings (only Secure if HTTPS)
            if (data.expiryTime) {
              const expiryDate = new Date(data.expiryTime);
              const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
              // Use consistent cookie options
              Cookies.set('B1SESSION_EXPIRY', expiryDate.toISOString(), {
                expires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
                secure: isSecure, // Only set Secure flag if actually over HTTPS
                sameSite: 'lax',
                path: '/'
              });
              console.log('🔄 [useSessionRenewal] Updated client-side expiry cookie:', expiryDate.toISOString());
            }
            
            lastRenewalTime.current = Date.now();
            
            // Add a small delay before allowing re-check to ensure browser processes cookies
            setTimeout(() => {
              isRenewing.current = false;
            }, 1000); // 1 second delay for cookie propagation
          } else {
            // Reset flag even if renewal didn't succeed (but wasn't an error)
            isRenewing.current = false;
          }
        } catch (error) {
          console.error('❌ [useSessionRenewal] Session renewal error:', error);
          isRenewing.current = false;
          // Don't force logout on renewal errors - just log and let ActivityTracker handle it
          console.warn('⚠️ [useSessionRenewal] Renewal failed but not forcing logout');
        }
      }
    };

    // Check every 60 seconds (less frequent to avoid conflicts with ActivityTracker)
    const intervalId = setInterval(checkSession, 60 * 1000);
    checkSession(); // Initial check

    return () => {
      clearInterval(intervalId);
      isRenewing.current = false;
    };
  }, [router]);
}; 