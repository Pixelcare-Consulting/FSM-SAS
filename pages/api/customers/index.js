// pages/api/customers/index.js
import customerService from '../../../lib/services/customerService.js';
import performanceMonitor from '../../../lib/utils/performanceMonitor.js';
import { 
  sendSuccess, 
  sendError, 
  sendUnauthorized, 
  sendMethodNotAllowed,
  sendValidationError,
  asyncHandler,
  validatePagination,
  sanitizeString
} from '../../../lib/utils/apiResponse.js';

/**
 * Unified Customer API Interface
 * 
 * GET /api/customers - Get customers with pagination and filtering
 * POST /api/customers - Create new customer (future implementation)
 * PUT /api/customers - Update customer (future implementation)
 * DELETE /api/customers - Delete customer (future implementation)
 * 
 * Query Parameters for GET:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 100, max: 500)
 * - search: General search term
 * - customerCode: Filter by customer code
 * - customerName: Filter by customer name
 * - email: Filter by email
 * - phone: Filter by phone
 * - contractStatus: Filter by contract status (Y/N)
 * - country: Filter by country
 * - status: Filter by status (active/inactive)
 * - address: Filter by address
 * - orderBy: Order by field (default: CardName)
 * - orderDirection: Order direction (asc/desc, default: asc)
 * - format: Response format (full/summary, default: full)
 * - useCache: Whether to use cache (true/false, default: true)
 */
const handler = asyncHandler(async (req, res) => {
  const requestId = `customers-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Start performance monitoring
  performanceMonitor.startTiming(requestId, {
    endpoint: 'customers',
    method: req.method,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });

  try {
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
      performanceMonitor.endTiming(requestId, { success: false, error: 'unauthorized' });
      return sendUnauthorized(res, 'Session is missing or expired');
    }

    let result;

    switch (req.method) {
      case 'GET':
        result = await handleGetCustomers(req, sessionCookies);
        break;
      
      case 'POST':
        // Future implementation for creating customers
        performanceMonitor.endTiming(requestId, { success: false, error: 'not_implemented' });
        return sendError(res, 'Customer creation not yet implemented', 501);
      
      case 'PUT':
        // Future implementation for updating customers
        performanceMonitor.endTiming(requestId, { success: false, error: 'not_implemented' });
        return sendError(res, 'Customer update not yet implemented', 501);
      
      case 'DELETE':
        // Future implementation for deleting customers
        performanceMonitor.endTiming(requestId, { success: false, error: 'not_implemented' });
        return sendError(res, 'Customer deletion not yet implemented', 501);
      
      default:
        performanceMonitor.endTiming(requestId, { success: false, error: 'method_not_allowed' });
        return sendMethodNotAllowed(res, ['GET', 'POST', 'PUT', 'DELETE']);
    }

    // End performance monitoring
    performanceMonitor.endTiming(requestId, { 
      success: true, 
      resultCount: result.data?.customers?.length || 0,
      fromCache: result.data?.meta?.fromCache || false
    });

    return sendSuccess(res, result.data, result.message);

  } catch (error) {
    console.error('Error in unified customer API:', {
      requestId,
      message: error.message,
      stack: error.stack,
      method: req.method,
      query: req.query,
      timestamp: new Date().toISOString()
    });

    // End performance monitoring with error
    performanceMonitor.endTiming(requestId, { 
      success: false, 
      error: error.message 
    });

    // Handle specific error types
    if (error.message.includes('SAP API Error')) {
      return sendError(res, 'SAP Service Layer error', 502, error.message);
    }

    if (error.message.includes('timeout')) {
      return sendError(res, 'Request timeout', 408);
    }

    return sendError(res, 'Failed to process customer request', 500);
  }
});

/**
 * Handle GET request for customers
 * @param {Object} req - Express request object
 * @param {Object} sessionCookies - Session cookies
 * @returns {Promise<Object>} Response data
 */
async function handleGetCustomers(req, sessionCookies) {
  // Validate and sanitize query parameters
  const { page, limit } = validatePagination(req.query);
  
  const queryParams = {
    page,
    limit,
    search: sanitizeString(req.query.search || ''),
    customerCode: sanitizeString(req.query.customerCode || ''),
    customerName: sanitizeString(req.query.customerName || ''),
    email: sanitizeString(req.query.email || ''),
    phone: sanitizeString(req.query.phone || ''),
    contractStatus: req.query.contractStatus === 'Y' ? 'Y' : req.query.contractStatus === 'N' ? 'N' : '',
    country: sanitizeString(req.query.country || ''),
    status: req.query.status === 'active' || req.query.status === 'inactive' ? req.query.status : '',
    address: sanitizeString(req.query.address || ''),
    orderBy: sanitizeString(req.query.orderBy || 'CardCode'), // Default to CardCode for C000001 ordering
    orderDirection: req.query.orderDirection === 'asc' ? 'asc' : 'desc',
    useCache: req.query.useCache !== 'false' // Default to true unless explicitly false
  };

  const format = req.query.format === 'summary' ? 'summary' : 'full';

  // Use appropriate service method based on format
  let result;
  if (format === 'summary') {
    const customers = await customerService.getCustomersSummary({
      search: queryParams.search,
      limit: queryParams.limit
    }, sessionCookies);
    
    result = {
      customers,
      totalCount: customers.length,
      format: 'summary',
      meta: {
        requestTime: new Date().toISOString(),
        queryParams: {
          ...queryParams,
          format
        }
      }
    };
  } else {
    result = await customerService.getCustomers(queryParams, sessionCookies);
    
    // Add additional metadata
    result.meta = {
      ...result.meta,
      requestTime: new Date().toISOString(),
      queryParams: {
        ...queryParams,
        format
      }
    };
  }

  return {
    data: result,
    message: 'Customers retrieved successfully'
  };
}

export default handler;
