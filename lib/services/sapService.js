// lib/services/sapService.js
import https from 'https';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * SAP Service Layer Base Service
 * Handles common SAP B1 Service Layer operations
 */
class SAPService {
  constructor() {
    const parseMs = (value, fallback) => {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    /** Read timeout (GET, probes). */
    this.defaultTimeout = parseMs(process.env.SAP_SERVICE_LAYER_TIMEOUT_MS, 90000);
    /** Write timeout (POST/PATCH Activities, ServiceCalls, UDT). SAP can be slow under load. */
    this.writeTimeout = parseMs(process.env.SAP_SERVICE_LAYER_WRITE_TIMEOUT_MS, 120000);
    /** Retries for transient SAP/network errors (timeouts, 502/503/504). POST capped at 1 retry. */
    this.maxRetries = parseMs(process.env.SAP_SERVICE_LAYER_MAX_RETRIES, 3);
  }

  /** Read at request time so CLI scripts can load dotenv after module import. */
  getBaseUrl() {
    return (process.env.SAP_SERVICE_LAYER_BASE_URL || '').trim().replace(/\/?$/, '/');
  }

  /**
   * Get session cookies from request
   * @param {Object} req - Express request object
   * @returns {Object} Session cookies or null if invalid
   */
  getSessionCookies(req) {
    const b1session = req.cookies.B1SESSION;
    const routeid = req.cookies.ROUTEID;
    const sessionExpiry = req.cookies.B1SESSION_EXPIRY;

    if (!b1session || !routeid) {
      return null;
    }

    // Check session expiry if available
    if (sessionExpiry && Date.now() >= new Date(sessionExpiry).getTime()) {
      return null;
    }

    return { b1session, routeid };
  }

  /**
   * True when a failed SAP call may succeed on retry (timeout, gateway, connection).
   */
  isRetryableSapError(error) {
    if (!error) return false;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
    const msg = String(error.message || error);
    if (/SAP Service Layer request timeout/i.test(msg)) return true;
    if (/SAP API Error: (502|503|504|429)/i.test(msg)) return true;
    if (/Service Unavailable|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network/i.test(msg)) {
      return true;
    }
    return false;
  }

  /** Backoff delay before retrying a SAP request (ms). */
  sapRetryDelayMs(attemptIndex) {
    return Math.min(1000 * 2 ** attemptIndex, 8000);
  }

  /**
   * Make authenticated request to SAP Service Layer (with transient-error retries).
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Object>} Response data
   */
  async makeRequest(endpoint, options = {}, sessionCookies) {
    const method = (options.method || 'GET').toUpperCase();
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const timeout =
      options.timeout ?? (isWrite ? this.writeTimeout : this.defaultTimeout);
    const configuredRetries =
      options.maxRetries != null ? Number(options.maxRetries) : this.maxRetries;
    // Limit POST retries to reduce duplicate Activity risk if SAP processed but response timed out.
    const maxRetries =
      method === 'POST'
        ? Math.min(Math.max(configuredRetries, 0), 1)
        : Math.max(configuredRetries, 0);

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this._makeRequestOnce(endpoint, { ...options, method, timeout }, sessionCookies);
      } catch (error) {
        lastError = error;
        if (attempt >= maxRetries || !this.isRetryableSapError(error)) {
          throw error;
        }
        const delay = this.sapRetryDelayMs(attempt);
        console.warn(
          `SAP ${method} ${endpoint} attempt ${attempt + 1} failed (${error.message}); retry in ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  /**
   * Single SAP Service Layer round-trip (no retry).
   */
  async _makeRequestOnce(endpoint, options = {}, sessionCookies) {
    const {
      method = 'GET',
      body = null,
      headers = {},
      timeout = this.defaultTimeout,
      /** When true, omit request/error logs (e.g. OData probes that may 400 on unsupported functions). */
      quiet = false,
    } = options;

    const url = `${this.getBaseUrl()}${endpoint}`;

    const requestOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: `B1SESSION=${sessionCookies.b1session}; ROUTEID=${sessionCookies.routeid}`,
        ...headers,
      },
      signal: AbortSignal.timeout(timeout),
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    try {
      if (!quiet) {
        console.log(`SAP Request: ${method} ${url}`);
      }
      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        const errorText = await response.text();
        if (!quiet) {
          console.error(`SAP API Error: ${response.status} ${response.statusText}`, errorText);
        }

        throw new Error(`SAP API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      if (response.status === 204) {
        return {};
      }

      const text = await response.text();
      if (!text || !text.trim()) {
        return {};
      }

      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error('SAP Service Layer request timeout');
      }
      throw error;
    }
  }

  /**
   * Execute a registered or ad-hoc SQL query via SAP Service Layer.
   * POST /SQLQueries('{queryId}')/List with JSON body (e.g. { "SqlText": "SELECT ..." }).
   * @param {string} queryId - SQL query package ID in SAP (e.g. 'sql01')
   * @param {Object} params - POST body fields (SqlText, ParamList, etc.)
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Object>} Raw response (includes `value` array of rows when present)
   */
  async executeSQLQuery(queryId, params = {}, sessionCookies) {
    const endpoint = `SQLQueries('${queryId}')/List`;
    const body = params && typeof params === 'object' && Object.keys(params).length > 0 ? params : {};
    return await this.makeRequest(
      endpoint,
      {
        method: 'POST',
        body,
      },
      sessionCookies
    );
  }

  /**
   * Execute custom SQL via SAP Service Layer (convenience).
   * @returns {Promise<Array>} Result rows from `value`, or []
   */
  async executeCustomSQL(queryId, sqlText, sessionCookies) {
    const data = await this.executeSQLQuery(queryId, { SqlText: sqlText }, sessionCookies);
    return data?.value ?? [];
  }

  /**
   * Get Business Partners with OData query options
   * @param {Object} options - Query options
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Object>} Business partners data
   */
  async getBusinessPartners(options = {}, sessionCookies) {
    const {
      skip = 0,
      top = 100,
      filter = '',
      select = '',
      orderby = '',
      expand = '',
      quiet = false
    } = options;

    let endpoint = `BusinessPartners?$skip=${skip}&$top=${top}`;

    if (filter) endpoint += `&$filter=${encodeURIComponent(filter)}`;
    if (select) endpoint += `&$select=${encodeURIComponent(select)}`;
    if (orderby) endpoint += `&$orderby=${encodeURIComponent(orderby)}`;
    if (expand) endpoint += `&$expand=${encodeURIComponent(expand)}`;

    const data = await this.makeRequest(endpoint, { quiet }, sessionCookies);
    return data;
  }

  /**
   * Get Business Partner by CardCode
   * @param {string} cardCode - Business Partner CardCode
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Object>} Business partner data
   */
  async getBusinessPartner(cardCode, sessionCookies) {
    const endpoint = `BusinessPartners('${cardCode}')`;
    return await this.makeRequest(endpoint, {}, sessionCookies);
  }

  /**
   * Get Business Partner Addresses by CardCode using SQL Query
   * @param {string} cardCode - Business Partner CardCode
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Array>} Business partner addresses
   */
  async getBusinessPartnerAddresses(cardCode, sessionCookies) {
    try {
      // Use SQL query to get address data since Service Layer endpoints are not available
      const sqlQuery = `
        SELECT
          T0.[CardCode],
          T0.[Address] as [AddressName],
          T0.[AdresType] as [AddressType],
          T0.[Street],
          T0.[Block],
          T0.[ZipCode],
          T0.[City],
          T0.[County],
          T0.[Country],
          T0.[State],
          T0.[Building],
          T0.[Address2],
          T0.[Address3],
          T1.[Name] as [CountryName],
          CASE
            WHEN T0.[AdresType] = 'S' THEN 'bo_ShipTo'
            WHEN T0.[AdresType] = 'B' THEN 'bo_BillTo'
            ELSE 'bo_BillTo'
          END as [AddressTypeFormatted],
          CASE
            WHEN T2.[ShipToDef] = T0.[Address] THEN 'Y'
            WHEN T2.[BillToDef] = T0.[Address] THEN 'Y'
            ELSE 'N'
          END as [Default]
        FROM [CRD1] T0
        LEFT JOIN [OCRY] T1 ON T0.[Country] = T1.[Code]
        LEFT JOIN [OCRD] T2 ON T0.[CardCode] = T2.[CardCode]
        WHERE T0.[CardCode] = '${cardCode}'
        ORDER BY T0.[AdresType], T0.[Address]
      `;

      const result = await this.executeSQLQuery('sql01', { SqlText: sqlQuery }, sessionCookies);
      const rows = result?.value ?? [];

      if (rows.length > 0) {
        // Transform SQL result to match expected address structure
        return rows.map(addr => ({
          CardCode: addr.CardCode,
          AddressName: addr.AddressName,
          AddressType: addr.AddressTypeFormatted,
          Street: addr.Street,
          Block: addr.Block,
          ZipCode: addr.ZipCode,
          City: addr.City,
          County: addr.County,
          Country: addr.Country,
          CountryName: addr.CountryName,
          State: addr.State,
          Building: addr.Building,
          BuildingFloorRoom: addr.Building,
          Address2: addr.Address2,
          Address3: addr.Address3,
          Default: addr.Default
        }));
      }

      return [];
    } catch (error) {
      console.warn(`Failed to fetch addresses for ${cardCode} via SQL:`, error.message);
      return [];
    }
  }

  /**
   * Get total count of Business Partners with filter
   * @param {string} filter - OData filter
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<number>} Total count
   */
  async getBusinessPartnersCount(filter = '', sessionCookies) {
    let endpoint = 'BusinessPartners/$count';
    if (filter) {
      endpoint += `?$filter=${encodeURIComponent(filter)}`;
    }

    const count = await this.makeRequest(endpoint, {}, sessionCookies);
    return typeof count === 'number' ? count : parseInt(count) || 0;
  }

  /**
   * Create a new Business Partner in SAP
   * @param {Object} businessPartnerData - Business Partner data in SAP format
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Object>} Created Business Partner data
   */
  async createBusinessPartner(businessPartnerData, sessionCookies) {
    const endpoint = 'BusinessPartners';
    
    const data = await this.makeRequest(endpoint, {
      method: 'POST',
      body: businessPartnerData
    }, sessionCookies);
    
    return data;
  }

  /**
   * Update an existing Business Partner in SAP
   * @param {string} cardCode - Business Partner CardCode
   * @param {Object} businessPartnerData - Updated Business Partner data
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Object>} Updated Business Partner data
   */
  async updateBusinessPartner(cardCode, businessPartnerData, sessionCookies) {
    const endpoint = `BusinessPartners('${cardCode}')`;
    
    const data = await this.makeRequest(endpoint, {
      method: 'PATCH',
      body: businessPartnerData
    }, sessionCookies);
    
    return data;
  }

  /**
   * Check if a Business Partner exists by CardCode
   * @param {string} cardCode - Business Partner CardCode
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<boolean>} True if exists, false otherwise
   */
  async businessPartnerExists(cardCode, sessionCookies) {
    try {
      await this.getBusinessPartner(cardCode, sessionCookies);
      return true;
    } catch (error) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        return false;
      }
      // Re-throw other errors
      throw error;
    }
  }

  // ========== Activities (Jobs) API - Phase 2 ==========

  /**
   * Create an Activity (Job) in SAP
   * POST /b1s/v1/Activities
   * @param {Object} activityData - Activity body (CardCode, ActivityType, Details, Notes, StartDate, StartTime, etc.)
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Object>} Created Activity data
   */
  async createActivity(activityData, sessionCookies) {
    const endpoint = 'Activities';
    const data = await this.makeRequest(endpoint, {
      method: 'POST',
      body: activityData
    }, sessionCookies);
    return data;
  }

  /**
   * Update an Activity (Job) in SAP
   * PATCH /b1s/v1/Activities('{id}')
   * @param {string|number} activityId - SAP Activity internal ID (e.g. from create response)
   * @param {Object} activityData - Partial Activity body to update
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Object>} Updated Activity data
   */
  async updateActivity(activityId, activityData, sessionCookies) {
    const endpoint = `Activities(${activityId})`;
    const data = await this.makeRequest(endpoint, {
      method: 'PATCH',
      body: activityData
    }, sessionCookies);
    return data;
  }

  /**
   * Get Activities (Jobs) list from SAP with optional OData params
   * @param {Object} options - { skip, top, filter, select, orderby }
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Object>} { value: [] }
   */
  async getActivities(options = {}, sessionCookies) {
    const { skip = 0, top = 100, filter = '', select = '', orderby = '' } = options;
    let endpoint = `Activities?$skip=${skip}&$top=${top}`;
    if (filter) endpoint += `&$filter=${encodeURIComponent(filter)}`;
    if (select) endpoint += `&$select=${encodeURIComponent(select)}`;
    if (orderby) endpoint += `&$orderby=${encodeURIComponent(orderby)}`;
    return await this.makeRequest(endpoint, {}, sessionCookies);
  }

  /**
   * Get a single Activity by ID
   * @param {string|number} activityId - SAP Activity internal ID
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Object>} Activity data
   */
  async getActivity(activityId, sessionCookies) {
    const endpoint = `Activities(${activityId})`;
    return await this.makeRequest(endpoint, {}, sessionCookies);
  }

  // ========== Service Calls API - Phase 2 ==========

  /**
   * GET /b1s/v1/ServiceCalls({serviceCallNo})
   * @param {string|number} serviceCallNo - SAP Service Call ID (call number)
   */
  async getServiceCall(serviceCallNo, sessionCookies) {
    const id = encodeURIComponent(String(serviceCallNo).trim());
    return await this.makeRequest(`ServiceCalls(${id})`, {}, sessionCookies);
  }

  /**
   * PATCH /b1s/v1/ServiceCalls({serviceCallNo})
   * @param {string|number} serviceCallNo
   * @param {Object} body - e.g. { ServiceCallActivities: [...] }
   */
  async patchServiceCall(serviceCallNo, body, sessionCookies) {
    const id = encodeURIComponent(String(serviceCallNo).trim());
    return await this.makeRequest(`ServiceCalls(${id})`, {
      method: 'PATCH',
      body,
    }, sessionCookies);
  }
}

/**
 * Build a request `Cookie` header from Node incoming headers (`set-cookie`).
 */
function cookieHeaderFromIncomingHeaders(incomingHeaders) {
  const raw = incomingHeaders['set-cookie'];
  const lines = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!lines.length) return '';
  return lines
    .map((line) => String(line).split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

/**
 * One HTTPS round-trip with optional keep-alive agent (same agent + maxSockets:1 keeps LB stickiness).
 */
function httpsRequest(url, { method = 'GET', headers = {}, body = null, agent }) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }

    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method,
        headers,
        agent,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const bodyBuffer = Buffer.concat(chunks);
          const status = res.statusCode || 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: res.headers,
            text: async () => bodyBuffer.toString('utf8'),
            json: async () => JSON.parse(bodyBuffer.toString('utf8')),
          });
        });
      }
    );

    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

/**
 * Parse B1SESSION / ROUTEID from Service Layer Login response (JSON body + Set-Cookie).
 * Used for unattended jobs (cron) that log in with SAP_B1_* env vars.
 */
export function parseSapLoginSessionFromResponse(loginResponse, sessionIdFromJson) {
  const headers = loginResponse?.headers || {};
  const raw = headers['set-cookie'];
  const lines = Array.isArray(raw) ? raw : raw ? [raw] : [];
  let routeid = '';
  let b1session = (sessionIdFromJson || '').trim();
  for (const line of lines) {
    const s = String(line);
    const rm = s.match(/ROUTEID=([^;]+)/i);
    if (rm) routeid = decodeURIComponent(rm[1].trim());
    const bm = s.match(/B1SESSION=([^;]+)/i);
    if (bm) b1session = decodeURIComponent(bm[1].trim());
  }
  if (!routeid) {
    routeid = (process.env.SAP_B1_ROUTE_ID || '.node4').trim() || '.node4';
  }
  if (!b1session) return null;
  return { b1session, routeid };
}

/**
 * Log in to SAP Service Layer using env credentials (same as portal login).
 * Returns cookie object for sapService.makeRequest / OData helpers, or null on failure.
 */
/**
 * Normalize return value of loginSessionCookiesFromEnvironment() to { b1session, routeid } or null.
 * @param {{ ok?: boolean, cookies?: object|null, error?: string }|object|null} loginResult
 */
export function unwrapSapEnvironmentLogin(loginResult) {
  if (!loginResult) return null;
  if (loginResult.cookies?.b1session && loginResult.cookies?.routeid) {
    return loginResult.cookies;
  }
  if (loginResult.b1session && loginResult.routeid) {
    return loginResult;
  }
  return null;
}

export async function loginSessionCookiesFromEnvironment() {
  const companyDB = (process.env.SAP_B1_COMPANY_DB || '').trim();
  const username = (process.env.SAP_B1_USERNAME || '').trim();
  const password = (process.env.SAP_B1_PASSWORD || '').trim();
  const baseUrl = (process.env.SAP_SERVICE_LAYER_BASE_URL || '').trim();
  if (!companyDB || !username || !password || !baseUrl) {
    return { ok: false, error: 'missing_sap_env', cookies: null };
  }
  try {
    const sapLoginResponse = await serviceLayerLoginRequest({
      baseUrl,
      companyDB,
      username,
      password,
    });
    if (!sapLoginResponse.ok) {
      let errText = '';
      try {
        errText = await sapLoginResponse.text();
      } catch (_) {}
      return { ok: false, error: errText || `http_${sapLoginResponse.status}`, cookies: null };
    }
    const sapLoginData = await sapLoginResponse.json();
    const sessionId = sapLoginData.SessionId;
    const cookies = parseSapLoginSessionFromResponse(sapLoginResponse, sessionId);
    if (!cookies) {
      return { ok: false, error: 'no_session_in_response', cookies: null };
    }
    return { ok: true, cookies };
  } catch (e) {
    return { ok: false, error: e?.message || 'login_failed', cookies: null };
  }
}

/**
 * POST Service Layer /Login. Uses one HTTPS agent so GET (service root) + POST Login share a
 * connection—fetch/undici often opens two pools and breaks ROUTEID / connection-based stickiness.
 * If this still returns -304 from SLD, SAP is rejecting the machine that runs Node (e.g. this
 * server’s public IP differs from the PC where Postman runs)—whitelist that IP or fix SLD.
 */
export async function serviceLayerLoginRequest({ baseUrl, companyDB, username, password }) {
  const base = (baseUrl || '').trim().replace(/\/?$/, '/');
  const loginUrl = `${base}Login`;
  const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 1,
    rejectUnauthorized: false,
  });

  const commonHeaders = {
    Accept: 'application/json',
  };

  let cookieHeader = '';
  try {
    const warm = await httpsRequest(base, {
      method: 'GET',
      agent,
      headers: commonHeaders,
    });
    cookieHeader = cookieHeaderFromIncomingHeaders(warm.headers);
    if (cookieHeader) {
      console.log('SAP B1: forwarding cookies from service root to Login');
    }
  } catch (e) {
    console.warn('SAP B1: service root warm-up failed (continuing without cookies):', e.message);
  }

  try {
    return await httpsRequest(loginUrl, {
      method: 'POST',
      agent,
      headers: {
        ...commonHeaders,
        'Content-Type': 'application/json; charset=UTF-8',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({
        CompanyDB: companyDB,
        UserName: username,
        Password: password,
      }),
    });
  } finally {
    agent.destroy();
  }
}

export default new SAPService();
