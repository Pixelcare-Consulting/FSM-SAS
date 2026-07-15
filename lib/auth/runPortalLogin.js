process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import crypto from 'crypto';
import { serialize } from 'cookie';
import { getSupabaseAdmin } from '../supabase/server';
import { userService } from '../supabase/database';
import { serviceLayerLoginRequest } from '../services/sapService';
import {
  writeAuditLogFromRequest,
  AUDIT_CATEGORIES,
  AUDIT_ACTIONS,
  AUDIT_STATUS,
} from '../services/auditLog';
import {
  isRequestSecure,
  buildClearSessionCookies,
} from './cookieSecurity';
import {
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginAttempts,
  LOGIN_EMAIL_REGEX,
  normalizeLoginEmail,
} from './loginRateLimit';

/**
 * Core portal login: rate limit → Supabase Auth → users row → session cookies + JSON.
 * Caller handles CORS / method / metrics wrapping.
 *
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @param {{ requireTechnician?: boolean }} [options]
 */
export async function runPortalLogin(req, res, options = {}) {
  const { requireTechnician = false } = options;
  const { email: rawEmail, password } = req.body || {};
  const email = normalizeLoginEmail(rawEmail);

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  if (!LOGIN_EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address' });
  }

  const rateLimit = assertLoginAllowed(req, email);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    return res.status(429).json({
      message: rateLimit.message,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  try {
    console.log('🔐 Server: Login request received', {
      method: req.method,
      body: { email, passwordLength: password?.length },
      requireTechnician,
    });

    console.log('🔍 Server: Attempting Supabase authentication...');

    const supabaseAdmin = getSupabaseAdmin();
    let authUser = null;
    let accessToken = null;
    let authUserId = null;

    try {
      console.log('🔐 Server: Attempting Supabase Auth signInWithPassword...');
      const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.error('❌ Server: Supabase Auth authentication failed:', {
          message: authError.message,
          status: authError.status,
          code: authError.code,
        });
        void writeAuditLogFromRequest(req, {
          action: AUDIT_ACTIONS.LOGIN_FAILED,
          category: AUDIT_CATEGORIES.AUTH,
          description: 'Login failed',
          details: { email, reason: authError.message || 'invalid_credentials' },
          status: AUDIT_STATUS.FAILURE,
        });
        recordLoginFailure(req, email);
        return res.status(401).json({
          message: authError.message || 'Invalid email or password',
        });
      }

      if (!authData?.user) {
        console.error('❌ Server: No user returned from Supabase Auth');
        void writeAuditLogFromRequest(req, {
          action: AUDIT_ACTIONS.LOGIN_FAILED,
          category: AUDIT_CATEGORIES.AUTH,
          description: 'Login failed',
          details: { email, reason: 'no_auth_user' },
          status: AUDIT_STATUS.FAILURE,
        });
        recordLoginFailure(req, email);
        return res.status(401).json({ message: 'Authentication failed' });
      }

      authUser = authData.user;
      accessToken = authData.session?.access_token;
      authUserId = authUser.id;

      console.log('✅ Server: Supabase Auth sign-in successful', {
        authUserId,
        email: authUser.email,
      });
    } catch (authErr) {
      console.error('❌ Server: Supabase Auth exception:', {
        message: authErr.message,
        code: authErr.code,
        stack: authErr.stack,
      });
      recordLoginFailure(req, email);
      return res.status(500).json({
        message: 'Authentication service error. Please try again.',
      });
    }

    let userData = null;
    try {
      console.log('📊 Server: Fetching user details from custom users table...', {
        authUserId,
        email,
      });

      userData = await userService.findById(authUserId, supabaseAdmin);
      if (!userData) {
        console.log('🔄 Server: No users row for auth ID, trying by username/email...');
        userData = await userService.findByEmail(email, supabaseAdmin);
      }

      if (!userData) {
        console.error('❌ Server: User not found in custom users table', {
          authUserId,
          email,
        });
        recordLoginFailure(req, email);
        return res.status(500).json({
          message: 'User account configuration error. Please contact administrator.',
        });
      }

      console.log('✅ Server: User data retrieved from custom table', {
        userId: userData?.id,
        username: userData?.username,
        role: userData?.role,
        status: userData?.status,
        hasTechnicians: !!userData?.technicians,
        techniciansCount: userData?.technicians?.length || 0,
      });
    } catch (dbError) {
      console.error('❌ Server: Database error fetching user details:', {
        message: dbError.message,
        code: dbError.code,
        details: dbError.details,
        hint: dbError.hint,
        stack: dbError.stack,
      });
      recordLoginFailure(req, email);
      return res.status(500).json({
        message: 'Error retrieving user information. Please try again.',
      });
    }

    if (userData.status !== 'ACTIVE') {
      console.log('❌ Server: User account is not active', {
        userId: userData.id,
        status: userData.status,
      });
      return res.status(403).json({ message: 'Account is not active' });
    }

    const technicianRow = userData.technicians?.[0] || userData.technicians;
    const technicianId = technicianRow?.id || null;
    const uid = userData.id;
    const workerId = technicianId || userData.id;
    const loginFullName = String(
      technicianRow?.full_name || userData.username || email || ''
    ).trim();

    if (requireTechnician && !technicianId) {
      void writeAuditLogFromRequest(req, {
        userId: uid,
        userEmail: email,
        userName: loginFullName,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        category: AUDIT_CATEGORIES.AUTH,
        description: 'Field login rejected — no technician profile',
        details: { email, reason: 'no_technician_profile' },
        status: AUDIT_STATUS.FAILURE,
      });
      return res.status(403).json({
        message: 'No technician profile for this user',
        error: 'No technician profile for this user',
      });
    }

    const userSessionId = crypto.randomUUID();
    try {
      await userService.update(
        userData.id,
        { current_session_id: userSessionId, is_logged_in: true },
        supabaseAdmin
      );
    } catch (updateErr) {
      console.error('❌ Server: Failed to set current_session_id:', updateErr.message);
      return res.status(500).json({ message: 'Session setup failed. Please try again.' });
    }

    console.log('🔄 Server: Attempting SAP B1 login...');
    let sessionId = null;
    let sapConnectionStatus = 'connected';
    let sapError = null;

    try {
      const companyDB = (process.env.SAP_B1_COMPANY_DB || '').trim();
      const sapUsername = (process.env.SAP_B1_USERNAME || '').trim();
      const sapPassword = (process.env.SAP_B1_PASSWORD || '').trim();
      const baseUrl = (process.env.SAP_SERVICE_LAYER_BASE_URL || '').trim();

      console.log('🔐 Login Credentials Check:', {
        baseUrl,
        companyDB,
        username: sapUsername,
        passwordLength: sapPassword.length,
        passwordHasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(sapPassword),
      });

      const sapLoginResponse = await serviceLayerLoginRequest({
        baseUrl,
        companyDB,
        username: sapUsername,
        password: sapPassword,
      });

      console.log('🔍 Server: SAP B1 response status:', sapLoginResponse.status);

      if (sapLoginResponse.ok) {
        const sapLoginData = await sapLoginResponse.json();
        sessionId = sapLoginData.SessionId;
        console.log('✅ Server: SAP B1 login successful');
      } else {
        const errorText = await sapLoginResponse.text();
        let errorDetails = errorText;

        try {
          const errorJson = JSON.parse(errorText);
          errorDetails = JSON.stringify(errorJson, null, 2);
          console.error('❌ SAP B1 Error Details:', errorDetails);
        } catch {
          console.error('❌ SAP B1 Error Response (text):', errorText);
        }

        throw new Error(
          `SAP B1 login failed with status: ${sapLoginResponse.status} - ${errorDetails}`
        );
      }
    } catch (error) {
      console.log('⚠️ Server: SAP B1 connection failed, allowing limited access:', error.message);
      sapConnectionStatus = 'failed';
      sapError = error.message;
      sessionId = `TEMP_SESSION_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    const sessionExpiryTime = new Date(Date.now() + 30 * 60 * 1000);
    const loginTimestamp = Date.now();
    const isSecure = isRequestSecure(req);

    console.log('🍪 Cookie security settings:', {
      isSecure,
      nodeEnv: process.env.NODE_ENV,
      forwardedProto: req.headers['x-forwarded-proto'] || req.headers['x-forwarded-protocol'],
      host: req.headers.host,
      connectionEncrypted: req.connection?.encrypted,
    });

    const clearCookies = buildClearSessionCookies(isSecure);

    const sessionCookieOptions = {
      path: '/',
      sameSite: 'lax',
      maxAge: 30 * 60,
      secure: isSecure,
      httpOnly: false,
    };

    const identityCookieOptions = {
      path: '/',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      secure: isSecure,
      httpOnly: false,
    };

    const cookies = [
      ...clearCookies,
      serialize('B1SESSION', sessionId, { ...sessionCookieOptions, httpOnly: true }),
      serialize('B1SESSION_EXPIRY', sessionExpiryTime.toISOString(), sessionCookieOptions),
      serialize('ROUTEID', '.node4', sessionCookieOptions),
      serialize('accessToken', accessToken, { ...sessionCookieOptions, httpOnly: true }),
      serialize('sessionId', userSessionId, identityCookieOptions),
      serialize('uid', uid, identityCookieOptions),
      serialize('email', email, identityCookieOptions),
      serialize('workerId', workerId, identityCookieOptions),
      serialize('isAdmin', String(userData.role === 'ADMIN'), identityCookieOptions),
      serialize('sapConnectionStatus', sapConnectionStatus, sessionCookieOptions),
      serialize('LAST_ACTIVITY', String(loginTimestamp), sessionCookieOptions),
      serialize('loginAt', String(loginTimestamp), identityCookieOptions),
      ...(loginFullName ? [serialize('fullName', loginFullName, identityCookieOptions)] : []),
    ];

    try {
      res.setHeader('Set-Cookie', cookies);
      console.log('🔐 Server: Setting session cookies:', {
        sessionId: sessionId.substring(0, 8) + '...',
        expiryTime: sessionExpiryTime.toISOString(),
        sapStatus: sapConnectionStatus,
        cookiesCount: cookies.length,
        isSecure,
      });
    } catch (cookieError) {
      console.error('❌ Server: Error setting cookies:', cookieError);
      cookies.forEach((cookie, index) => {
        try {
          res.appendHeader('Set-Cookie', cookie);
        } catch (err) {
          console.error(`❌ Server: Error setting cookie ${index}:`, err);
        }
      });
    }

    clearLoginAttempts(req, email);

    await writeAuditLogFromRequest(req, {
      userId: uid,
      userEmail: email,
      userName: loginFullName,
      action: AUDIT_ACTIONS.LOGIN,
      category: AUDIT_CATEGORIES.AUTH,
      description: `User logged in${sapConnectionStatus === 'connected' ? '' : ' (limited SAP access)'}`,
      details: { sapConnectionStatus, workerId, requireTechnician },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(200).json({
      success: true,
      message:
        sapConnectionStatus === 'connected'
          ? 'Authentication successful'
          : 'Authentication successful with limited SAP access',
      sapConnectionStatus,
      sapError: sapConnectionStatus === 'failed' ? sapError : null,
      sessionId: userSessionId,
      user: {
        email,
        workerId,
        uid,
        technicianId,
        isAdmin: userData.role === 'ADMIN',
      },
      cookiesSet: cookies.length,
    });
  } catch (error) {
    console.error('❌ Server: Login error:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack,
      errorType: error.constructor?.name,
      timestamp: new Date().toISOString(),
    });

    if (error.code === '22007') {
      console.error('❌ Server: PostgreSQL timestamp error detected:', {
        errorCode: error.code,
        errorMessage: error.message,
        possibleCauses: [
          'Null value passed to timestamp field',
          'Invalid timestamp format in database operation',
          'Missing DEFAULT value for timestamp column',
          'Trigger attempting to set null timestamp',
        ],
      });
    }

    res.setHeader('Set-Cookie', buildClearSessionCookies(isRequestSecure(req)));

    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      category: AUDIT_CATEGORIES.AUTH,
      description: 'Login failed',
      details: { reason: error.message || 'authentication_failed' },
      status: AUDIT_STATUS.FAILURE,
    });

    if (email) {
      recordLoginFailure(req, email);
    }

    return res.status(401).json({
      message: 'Authentication failed',
      error: error.message,
    });
  }
}
