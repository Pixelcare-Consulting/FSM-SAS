// pages/api/customers/query.js
import customerService from '../../../lib/services/customerService.js';
import sapService from '../../../lib/services/sapService.js';
import { 
  sendSuccess, 
  sendError, 
  sendUnauthorized, 
  sendMethodNotAllowed,
  sendValidationError,
  asyncHandler,
  validateRequiredFields,
  sanitizeString
} from '../../../lib/utils/apiResponse.js';

/**
 * SQL-based Customer Query API Endpoint
 * POST /api/customers/query - Execute predefined SQL queries for customers
 * 
 * Request Body:
 * {
 *   "queryId": "sql01",
 *   "params": {
 *     "CardCode": "C001",
 *     "Country": "US"
 *   },
 *   "customSql": "SELECT CardCode, CardName FROM OCRD WHERE CardType = 'C'",
 *   "options": {
 *     "limit": 100,
 *     "timeout": 30000
 *   }
 * }
 */
const handler = asyncHandler(async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res, ['POST']);
  }

  // Get and validate session cookies
  const sessionCookies = (() => {
    const b1session = req.cookies.B1SESSION;
    const routeid = req.cookies.ROUTEID;
    const sessionExpiry = req.cookies.B1SESSION_EXPIRY;

    if (!b1session || !routeid) return null;
    if (sessionExpiry && Date.now() >= new Date(sessionExpiry).getTime()) return null;
    
    return { b1session, routeid };
  })();

  if (!sessionCookies) {
    return sendUnauthorized(res, 'Session is missing or expired');
  }

  try {
    const { queryId, params = {}, customSql, options = {} } = req.body;

    // Validate that either queryId or customSql is provided
    if (!queryId && !customSql) {
      return sendValidationError(res, [{
        field: 'queryId or customSql',
        message: 'Either queryId or customSql must be provided'
      }]);
    }

    // Sanitize parameters
    const sanitizedParams = {};
    Object.keys(params).forEach(key => {
      if (typeof params[key] === 'string') {
        sanitizedParams[key] = sanitizeString(params[key]);
      } else {
        sanitizedParams[key] = params[key];
      }
    });

    let result;
    let queryType;

    if (customSql) {
      // Execute custom SQL (requires special query ID for custom queries)
      const customQueryId = options.customQueryId || 'sql99'; // Default custom query ID
      queryType = 'custom';
      
      // Basic SQL injection protection
      const allowedKeywords = ['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER'];
      const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE'];
      
      const sqlUpper = customSql.toUpperCase();
      const hasDangerousKeywords = dangerousKeywords.some(keyword => sqlUpper.includes(keyword));
      
      if (hasDangerousKeywords) {
        return sendValidationError(res, [{
          field: 'customSql',
          message: 'SQL contains potentially dangerous operations'
        }]);
      }

      result = await sapService.executeCustomSQL(customQueryId, customSql, sessionCookies);
    } else {
      // Execute predefined SQL query
      queryType = 'predefined';
      result = await customerService.getCustomersSQL(queryId, sanitizedParams, sessionCookies);
    }

    // Apply limit if specified
    const limit = parseInt(options.limit) || null;
    if (limit && Array.isArray(result) && result.length > limit) {
      result = result.slice(0, limit);
    }

    // Prepare response data
    const responseData = {
      data: result,
      meta: {
        queryType,
        queryId: queryId || 'custom',
        customSql: customSql || null,
        params: sanitizedParams,
        resultCount: Array.isArray(result) ? result.length : 1,
        requestTime: new Date().toISOString(),
        options
      }
    };

    return sendSuccess(res, responseData, 'Query executed successfully');

  } catch (error) {
    console.error('Error in customer query API:', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    // Handle specific error types
    if (error.message.includes('SAP API Error')) {
      return sendError(res, 'SAP Service Layer error', 502, error.message);
    }

    if (error.message.includes('timeout')) {
      return sendError(res, 'Query timeout', 408);
    }

    if (error.message.includes('SQL')) {
      return sendError(res, 'SQL execution error', 400, error.message);
    }

    return sendError(res, 'Failed to execute query', 500);
  }
});

/**
 * Predefined customer queries
 * These can be used with the queryId parameter
 */
export const PREDEFINED_QUERIES = {
  'customer-summary': {
    id: 'sql01',
    description: 'Get customer summary with basic info',
    params: []
  },
  'customer-with-contracts': {
    id: 'sql02',
    description: 'Get customers with active contracts',
    params: []
  },
  'customer-by-country': {
    id: 'sql03',
    description: 'Get customers by country',
    params: ['Country']
  },
  'customer-service-locations': {
    id: 'sql13',
    description: 'Get customer service locations',
    params: ['CustomerName', 'Address']
  }
};

export default handler;
