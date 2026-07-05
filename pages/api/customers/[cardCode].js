// pages/api/customers/[cardCode].js
import customerService from '../../../lib/services/customerService.js';
import performanceMonitor from '../../../lib/utils/performanceMonitor.js';
import { 
  sendSuccess, 
  sendError, 
  sendUnauthorized, 
  sendMethodNotAllowed,
  sendNotFound,
  sendValidationError,
  asyncHandler,
  validateRequiredFields,
  sanitizeString
} from '../../../lib/utils/apiResponse.js';

/**
 * Customer Details API Endpoint
 * 
 * GET /api/customers/[cardCode] - Get customer by CardCode
 * PUT /api/customers/[cardCode] - Update customer (future implementation)
 * DELETE /api/customers/[cardCode] - Delete customer (future implementation)
 * 
 * Query Parameters for GET:
 * - useCache: Whether to use cache (true/false, default: true)
 * - expand: Additional data to include (addresses, contacts, etc.)
 */
const handler = asyncHandler(async (req, res) => {
  const { cardCode } = req.query;
  const requestId = `customer-${cardCode}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Start performance monitoring
  performanceMonitor.startTiming(requestId, {
    endpoint: 'customer-details',
    method: req.method,
    cardCode,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });

  try {
    // Validate CardCode
    if (!cardCode || typeof cardCode !== 'string' || !cardCode.trim()) {
      performanceMonitor.endTiming(requestId, { success: false, error: 'invalid_cardcode' });
      return sendValidationError(res, [{
        field: 'cardCode',
        message: 'CardCode is required and must be a valid string'
      }]);
    }

    const sanitizedCardCode = sanitizeString(cardCode);

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
        result = await handleGetCustomer(req, sanitizedCardCode, sessionCookies);
        break;
      
      case 'PUT':
        // Future implementation for updating customer
        performanceMonitor.endTiming(requestId, { success: false, error: 'not_implemented' });
        return sendError(res, 'Customer update not yet implemented', 501);
      
      case 'DELETE':
        // Future implementation for deleting customer
        performanceMonitor.endTiming(requestId, { success: false, error: 'not_implemented' });
        return sendError(res, 'Customer deletion not yet implemented', 501);
      
      default:
        performanceMonitor.endTiming(requestId, { success: false, error: 'method_not_allowed' });
        return sendMethodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
    }

    // End performance monitoring
    performanceMonitor.endTiming(requestId, { 
      success: true, 
      cardCode: sanitizedCardCode,
      fromCache: result.data?.meta?.fromCache || false
    });

    return sendSuccess(res, result.data, result.message);

  } catch (error) {
    console.error('Error in customer details API:', {
      requestId,
      cardCode,
      message: error.message,
      stack: error.stack,
      method: req.method,
      query: req.query,
      timestamp: new Date().toISOString()
    });

    // End performance monitoring with error
    performanceMonitor.endTiming(requestId, { 
      success: false, 
      error: error.message,
      cardCode
    });

    // Handle specific error types
    if (error.message.includes('SAP API Error')) {
      if (error.message.includes('404')) {
        return sendNotFound(res, `Customer with CardCode '${cardCode}' not found`);
      }
      return sendError(res, 'SAP Service Layer error', 502, error.message);
    }

    if (error.message.includes('timeout')) {
      return sendError(res, 'Request timeout', 408);
    }

    if (error.message.includes('not found')) {
      return sendNotFound(res, `Customer with CardCode '${cardCode}' not found`);
    }

    return sendError(res, 'Failed to fetch customer details', 500);
  }
});

/**
 * Handle GET request for customer details
 * @param {Object} req - Express request object
 * @param {string} cardCode - Customer CardCode
 * @param {Object} sessionCookies - Session cookies
 * @returns {Promise<Object>} Response data
 */
async function handleGetCustomer(req, cardCode, sessionCookies) {
  const useCache = req.query.useCache !== 'false'; // Default to true unless explicitly false
  const expand = req.query.expand ? req.query.expand.split(',').map(s => s.trim()) : [];

  try {
    // Get customer details
    const customer = await customerService.getCustomerByCode(cardCode, sessionCookies, useCache);

    if (!customer) {
      throw new Error(`Customer with CardCode '${cardCode}' not found`);
    }

    // Prepare response data
    const responseData = {
      customer,
      meta: {
        cardCode,
        requestTime: new Date().toISOString(),
        expand,
        fromCache: customer.meta?.fromCache || false,
        cacheHit: customer.meta?.cacheHit || false
      }
    };

    // Handle expand options (future implementation)
    if (expand.length > 0) {
      responseData.meta.expandedData = {};
      
      for (const expandOption of expand) {
        switch (expandOption.toLowerCase()) {
          case 'addresses':
            // Future: Get customer addresses
            responseData.meta.expandedData.addresses = 'Not yet implemented';
            break;
          case 'contacts':
            // Future: Get customer contacts
            responseData.meta.expandedData.contacts = 'Not yet implemented';
            break;
          case 'orders':
            // Future: Get customer orders
            responseData.meta.expandedData.orders = 'Not yet implemented';
            break;
          case 'invoices':
            // Future: Get customer invoices
            responseData.meta.expandedData.invoices = 'Not yet implemented';
            break;
          default:
            console.warn(`Unknown expand option: ${expandOption}`);
        }
      }
    }

    return {
      data: responseData,
      message: 'Customer details retrieved successfully'
    };

  } catch (error) {
    console.error(`Error fetching customer ${cardCode}:`, error);
    throw error;
  }
}

export default handler;
