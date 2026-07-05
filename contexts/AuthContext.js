import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabase/client';
import Cookies from 'js-cookie';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session from cookies
    const uid = Cookies.get('uid');
    const email = Cookies.get('email');
    const accessToken = Cookies.get('accessToken');

    if (uid && email) {
      // Set user from cookies
      setCurrentUser({
        id: uid,
        email: email,
        uid: uid
      });
      setLoading(false);
    } else {
      // Try to get session from Supabase
      const supabase = getSupabaseClient();
      if (supabase) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            setCurrentUser(session.user);
          }
          setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          setCurrentUser(session?.user || null);
          setLoading(false);
        });

        return () => {
          subscription.unsubscribe();
        };
      } else {
        setLoading(false);
      }
    }
  }, []);

  const value = {
    currentUser,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
} 