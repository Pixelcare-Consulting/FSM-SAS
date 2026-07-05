// lib/utils/apiResponse.js

/**
 * Standardized API Response Utilities
 */

/**
 * Success response helper
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 */
export const sendSuccess = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

/**
 * Error response helper
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {*} details - Additional error details
 */
export const sendError = (res, message = 'Internal Server Error', statusCode = 500, details = null) => {
  const errorResponse = {
    success: false,
    error: {
      message,
      statusCode,
      timestamp: new Date().toISOString()
    }
  };

  if (details && process.env.NODE_ENV === 'development') {
    errorResponse.error.details = details;
  }

  return res.status(statusCode).json(errorResponse);
};

/**
 * Validation error response helper
 * @param {Object} res - Express response object
 * @param {Array|Object} errors - Validation errors
 */
export const sendValidationError = (res, errors) => {
  return res.status(400).json({
    success: false,
    error: {
      message: 'Validation failed',
      statusCode: 400,
      errors: Array.isArray(errors) ? errors : [errors],
      timestamp: new Date().toISOString()
    }
  });
};

/**
 * Unauthorized response helper
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
export const sendUnauthorized = (res, message = 'Unauthorized') => {
  return sendError(res, message, 401);
};

/**
 * Not found response helper
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
export const sendNotFound = (res, message = 'Resource not found') => {
  return sendError(res, message, 404);
};

/**
 * Method not allowed response helper
 * @param {Object} res - Express response object
 * @param {Array} allowedMethods - Allowed HTTP methods
 */
export const sendMethodNotAllowed = (res, allowedMethods = []) => {
  res.setHeader('Allow', allowedMethods.join(', '));
  return sendError(res, 'Method not allowed', 405);
};

/**
 * Paginated response helper
 * @param {Object} res - Express response object
 * @param {Array} data - Response data
 * @param {Object} pagination - Pagination info
 * @param {string} message - Success message
 */
export const sendPaginatedSuccess = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination,
    timestamp: new Date().toISOString()
  });
};

/**
 * Handle async route errors
 * @param {Function} fn - Async route handler
 * @returns {Function} Express middleware
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export const globalErrorHandler = (err, req, res, next) => {
  console.error('Global error handler:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return sendValidationError(res, err.errors);
  }

  if (err.name === 'UnauthorizedError') {
    return sendUnauthorized(res, err.message);
  }

  if (err.name === 'NotFoundError') {
    return sendNotFound(res, err.message);
  }

  // Handle SAP Service Layer errors
  if (err.message.includes('SAP API Error')) {
    const statusCode = err.message.includes('401') ? 401 : 
                      err.message.includes('404') ? 404 : 500;
    return sendError(res, 'SAP Service Layer error', statusCode, err.message);
  }

  // Handle timeout errors
  if (err.name === 'TimeoutError') {
    return sendError(res, 'Request timeout', 408);
  }

  // Default error response
  return sendError(res, 'Internal Server Error', 500, err.message);
};

/**
 * Validate required fields
 * @param {Object} data - Data to validate
 * @param {Array} requiredFields - Required field names
 * @returns {Array} Validation errors
 */
export const validateRequiredFields = (data, requiredFields) => {
  const errors = [];
  
  requiredFields.forEach(field => {
    if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
      errors.push({
        field,
        message: `${field} is required`
      });
    }
  });

  return errors;
};

/**
 * Validate pagination parameters
 * @param {Object} query - Query parameters
 * @returns {Object} Validated pagination parameters
 */
export const validatePagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit) || 100));
  
  return { page, limit };
};

/**
 * Sanitize string input
 * @param {string} input - Input string
 * @returns {string} Sanitized string
 */
export const sanitizeString = (input) => {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[<>]/g, '');
};

/**
 * Rate limiting helper
 * @param {string} key - Rate limit key
 * @param {number} maxRequests - Maximum requests
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Rate limit middleware
 */
export const createRateLimit = (key, maxRequests = 100, windowMs = 60000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const clientKey = `${key}:${req.ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    const clientRequests = requests.get(clientKey) || [];
    const validRequests = clientRequests.filter(time => time > windowStart);
    
    if (validRequests.length >= maxRequests) {
      return sendError(res, 'Too many requests', 429);
    }
    
    validRequests.push(now);
    requests.set(clientKey, validRequests);
    
    next();
  };
};
