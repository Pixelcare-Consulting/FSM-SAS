/**
 * Validates session on dashboard mount and polls every 30s.
 * Redirects to sign-in only after confirmed session invalidation (not transient 401s).
 */
import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import {
  shouldLogoutOnAuthError,
  coordinatedSessionLogout,
  subscribeToSessionLogout,
  isLogoutInProgress,
  isWithinPostLoginGrace,
} from '../lib/auth/sessionTabSync';

const POLL_INTERVAL_MS = 30 * 1000;

function fetchUserInfo() {
  return fetch('/api/getUserInfo', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
  });
}

export function useSessionCheck() {
  const router = useRouter();
  const redirecting = useRef(false);

  const redirectToSignIn = useCallback(
    (message) => {
      if (redirecting.current) return;
      redirecting.current = true;
      router.replace(
        '/sign-in?toast=' + encodeURIComponent(message || 'Session expired. Please log in again.')
      );
    },
    [router]
  );

  const handleAuthFailure = useCallback(
    async (errData) => {
      if (redirecting.current || isLogoutInProgress()) return;
      if (isWithinPostLoginGrace(Cookies.get)) return;

      const decision = await shouldLogoutOnAuthError(
        errData,
        Cookies.get,
        fetchUserInfo
      );

      if (!decision.logout) return;

      await coordinatedSessionLogout({
        message: decision.message,
        reason: errData?.code || 'session_check',
        redirect: redirectToSignIn,
      });
    },
    [redirectToSignIn]
  );

  const checkSession = useCallback(async () => {
    if (redirecting.current || isLogoutInProgress()) return;
    if (!router.pathname.includes('/dashboard')) return;
    if (isWithinPostLoginGrace(Cookies.get)) return;

    try {
      const res = await fetchUserInfo();
      if (res.status === 401) {
        const errData = await res.json().catch(() => ({}));
        await handleAuthFailure(errData);
      }
    } catch {
      // network blip — do not logout
    }
  }, [router.pathname, handleAuthFailure]);

  useEffect(() => {
    const unsubscribe = subscribeToSessionLogout((message) => {
      redirectToSignIn(message);
    });
    return unsubscribe;
  }, [redirectToSignIn]);

  useEffect(() => {
    checkSession();
    const interval = setInterval(checkSession, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkSession]);
}
