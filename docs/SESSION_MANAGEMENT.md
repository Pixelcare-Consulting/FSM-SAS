# Session Management & Auto-Logout Documentation

## Overview
The application uses SAP B1 Service Layer sessions with automatic renewal and logout management.

## Session Duration
- **Session Length:** 30 minutes
- **Auto-Renewal Trigger:** When less than 5 minutes remain
- **Auto-Logout:** DISABLED - Shows warnings instead, user stays on page

## How It Works

### 1. Session Lifecycle
```
Login → Session Created (30 min expiry) → Auto-renew at 25 min → Session Extended (30 min) → Repeat
```

### 2. Auto-Renewal System
The `ActivityTracker` component automatically:
- Checks session status every 30 seconds
- Renews session when < 5 minutes remain
- Prevents renewal spam (minimum 2 minutes between renewals)
- Handles renewal failures gracefully

### 3. Proxy Protection
The Next.js `proxy.js`:
- Validates session on each page navigation
- Redirects to login only when session has truly expired
- Includes 30-second grace period during renewals to prevent false logouts
- Refreshes Supabase Auth JWT cookies on portal UI paths (not field BFF / cron)

## Configuration

All session settings are centralized in `config/session.config.js`:

```javascript
SESSION_DURATION_MINUTES: 30          // Total session length
AUTO_RENEW_THRESHOLD_MINUTES: 5       // When to trigger renewal
RENEWAL_CHECK_INTERVAL_MS: 30000      // How often to check (30 sec)
MIN_RENEWAL_INTERVAL_MS: 120000       // Min time between renewals (2 min)
MIDDLEWARE_GRACE_PERIOD_MS: 30000     // Grace period for cookie sync (30 sec)
```

## Components

### ActivityTracker (`components/ActivityTracker.js`)
- **Primary session manager** - handles all renewal logic
- Runs on all authenticated pages
- Checks every 30 seconds
- Shows toast notifications on renewal success/failure

### Proxy (`proxy.js`)
- **Server-side session validator** (Next.js 16 proxy convention)
- Checks session on page navigation
- Allows through even when expired (no forced logout)
- Only redirects if cookies completely missing (never logged in)
- Provides grace period for cookie propagation
- Portal UI: Supabase Auth JWT cookie refresh via `@supabase/ssr`

### Utilities (`utils/middlewareClient.js`)
- Helper functions for session management
- `formatTimeRemaining()` - formats session timer
- `handleSessionError()` - clears cookies and redirects to login

## Troubleshooting

### Issue: Random Logouts
**Cause:** Multiple session renewal systems conflicting
**Solution:** Ensure only `ActivityTracker` is active (fixed in this update)

### Issue: "No session expiry found" warnings
**Cause:** Timer checking cookies during page transitions
**Solution:** Warnings now suppressed (silently returns)

### Issue: Negative timer values
**Cause:** Trying to format invalid/expired time
**Solution:** `formatTimeRemaining()` now validates input

### Issue: Session renewed but still logs out
**Cause:** Middleware checking before cookies propagated
**Solution:** Added 30-second grace period in middleware

## Changes Made (Dec 1, 2025)

### Fixed
1. **Removed duplicate session renewal systems**
   - Removed `initializeSessionRenewalCheck` from QuickMenu
   - Now only `ActivityTracker` manages renewals

2. **Fixed sign-in page auto-logout issue**
   - Sign-in page now checks only ESSENTIAL cookies (B1SESSION, B1SESSION_EXPIRY, uid)
   - No longer blocks on optional cookies (sapConnectionStatus, LAST_ACTIVITY, etc.)
   - Prevents false logout when navigating to sign-in after renewal

3. **Fixed renewal API missing cookies**
   - Added `sapConnectionStatus=connected` to renewal response
   - Ensures all cookies match initial login state

4. **Improved error handling**
   - Suppressed console spam for missing cookies during transitions
   - Better validation in `formatTimeRemaining()`
   - ActivityTracker now verifies session is truly expired before logout

5. **Better middleware logic**
   - Changed from 3-minute buffer to 30-second grace period
   - Only logs out when truly expired, not approaching expiry

6. **Centralized configuration**
   - Created `config/session.config.js`
   - All timing values in one place

### Benefits
- ✅ No more auto-logout when navigating to sign-in page after renewal
- ✅ No more false logouts during renewals
- ✅ Reduced console spam
- ✅ More predictable session behavior
- ✅ Easier to adjust session settings

## Testing

To test the session management:

1. **Login** and note the time
2. **Wait 25 minutes** - should see "Session renewed successfully" toast
3. **Continue using** - session should extend for another 30 minutes
4. **Leave idle for 30+ minutes** - should auto-logout

## Adjusting Session Duration

To change auto-logout timing, edit `config/session.config.js`:

```javascript
// For 60-minute sessions:
SESSION_DURATION_MINUTES: 60,
SESSION_DURATION_MS: 60 * 60 * 1000,

// Renew at 10 minutes remaining:
AUTO_RENEW_THRESHOLD_MINUTES: 10,
AUTO_RENEW_THRESHOLD_MS: 10 * 60 * 1000,
```

⚠️ **Note:** Session duration is ultimately controlled by SAP B1 Service Layer (currently 30 minutes). The configuration must match the SAP setting.

