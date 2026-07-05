// pages/api/customers/search.js
import customerService from '../../../lib/services/customerService.js';
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
 * Advanced Customer Search API Endpoint
 * POST /api/customers/search - Advanced customer search with multiple criteria
 * 
 * Request Body:
 * {
 *   "query": "search term",
 *   "fields": ["CardCode", "CardName", "EmailAddress", "Phone1"],
 *   "filters": {
 *     "contractStatus": "Y",
 *     "country": "US",
 *     "status": "active"
 *   },
 *   "options": {
 *     "limit": 50,
 *     "includeInactive": false,
 *     "exactMatch": false
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
    const { query, fields, filters = {}, options = {} } = req.body;

    // Validate required fields
    const validationErrors = validateRequiredFields(req.body, ['query']);
    if (validationErrors.length > 0) {
      return sendValidationError(res, validationErrors);
    }

    // Sanitize and validate search parameters
    const searchParams = {
      query: sanitizeString(query),
      fields: Array.isArray(fields) ? fields.filter(f => typeof f === 'string') : ['CardCode', 'CardName', 'EmailAddress', 'Phone1'],
      limit: Math.min(500, Math.max(1, parseInt(options.limit) || 50)),
      includeInactive: Boolean(options.includeInactive),
      exactMatch: Boolean(options.exactMatch)
    };

    // Apply additional filters
    const searchFilters = {
      ...searchParams,
      contractStatus: filters.contractStatus === 'Y' ? 'Y' : filters.contractStatus === 'N' ? 'N' : '',
      country: sanitizeString(filters.country || ''),
      status: filters.status === 'active' || filters.status === 'inactive' ? filters.status : '',
      customerCode: sanitizeString(filters.customerCode || ''),
      customerName: sanitizeString(filters.customerName || ''),
      email: sanitizeString(filters.email || ''),
      phone: sanitizeString(filters.phone || ''),
      address: sanitizeString(filters.address || '')
    };

    // Perform search
    const result = await customerService.searchCustomers(searchFilters, sessionCookies);

    // Add search metadata
    const responseData = {
      ...result,
      meta: {
        searchParams: searchFilters,
        requestTime: new Date().toISOString(),
        resultCount: result.customers?.length || 0
      }
    };

    return sendSuccess(res, responseData, 'Customer search completed successfully');

  } catch (error) {
    console.error('Error in customer search API:', {
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
      return sendError(res, 'Search request timeout', 408);
    }

    return sendError(res, 'Failed to search customers', 500);
  }
});

export default handler;
