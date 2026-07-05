// ⚠️ FIREBASE IS DISABLED - This project uses Supabase
// This file is kept for backward compatibility during migration
// All exports are null/undefined - Firebase will not initialize

// DO NOT IMPORT FIREBASE MODULES - They will cause errors
// Use Supabase instead: import { getSupabaseClient } from '../lib/supabase/client'

let app = null;
let analytics = null;
let db = null;
let storage = null;
let auth = null;

const firebaseConfig = {
  apiKey: null,
  authDomain: null,
  projectId: null,
  storageBucket: null,
  messagingSenderId: null,
  appId: null,
  measurementId: null
};

// Firebase is completely disabled - using Supabase
if (typeof window !== 'undefined') {
  console.warn('⚠️ Firebase is disabled. This project uses Supabase. Please migrate any remaining Firebase imports.');
}

// Add a more comprehensive test function
export async function testFirebaseConnection() {
  return {
    success: false,
    error: 'Firebase is disabled. This project uses Supabase.',
    code: 'firebase/disabled'
  };
}

// Verify Firebase configuration
export function verifyFirebaseConfig() {
  // Firebase is disabled - using Supabase
  return false;
}

export { firebaseConfig, app, db, storage, analytics, auth };
