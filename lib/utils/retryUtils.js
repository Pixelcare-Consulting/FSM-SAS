/**
 * Retry Utilities for SAS FSM Portal
 * Provides retry mechanisms with circuit breaker integration
 */

import circuitBreakerManager, { ExponentialBackoff } from './circuitBreaker.js';

/**
 * Retry configuration presets for different types of operations
 */
export const RETRY_PRESETS = {
  // Quick operations (API calls, database queries)
  QUICK: {
    maxRetries: 3,
    initialDelay: 500,
    maxDelay: 5000,
    multiplier: 2,
    jitter: true
  },
  
  // Standard operations (file uploads, data processing)
  STANDARD: {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 15000,
    multiplier: 2,
    jitter: true
  },
  
  // Long operations (large data imports, complex calculations)
  LONG: {
    maxRetries: 3,
    initialDelay: 2000,
    maxDelay: 30000,
    multiplier: 2.5,
    jitter: true
  },
  
  // Critical operations (authentication, payment processing)
  CRITICAL: {
    maxRetries: 7,
    initialDelay: 1000,
    maxDelay: 10000,
    multiplier: 1.5,
    jitter: true
  }
};

/**
 * Enhanced retry function with circuit breaker integration
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Result of successful execution
 */
export async function retryWithCircuitBreaker(fn, options = {}) {
  const {
    circuitBreakerName = 'default',
    circuitBreakerOptions = {},
    retryOptions = RETRY_PRESETS.STANDARD,
    shouldRetry = (error) => true,
    onRetry = null,
    onFailure = null,
    context = {}
  } = options;

  // Get or create circuit breaker
  const circuitBreaker = circuitBreakerManager.getBreaker(
    circuitBreakerName,
    circuitBreakerOptions
  );

  // Create exponential backoff instance
  const backoff = new ExponentialBackoff(retryOptions);

  let lastError;
  let attempt = 0;

  while (attempt <= retryOptions.maxRetries) {
    try {
      // Execute function through circuit breaker
      const result = await circuitBreaker.execute(fn);
      
      // Success - reset attempt counter for future calls
      if (attempt > 0) {
        console.log(`retryWithCircuitBreaker: Success after ${attempt} retries`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if circuit breaker is open
      if (error.circuitBreakerOpen) {
        console.log('retryWithCircuitBreaker: Circuit breaker is open, not retrying');
        throw error;
      }

      // Check if we should retry this error
      if (!shouldRetry(error)) {
        console.log('retryWithCircuitBreaker: Error not retryable:', error.message);
        throw error;
      }

      // Check if we've reached max retries
      if (attempt >= retryOptions.maxRetries) {
        console.log(`retryWithCircuitBreaker: Max retries (${retryOptions.maxRetries}) reached`);
        break;
      }

      // Calculate delay for next attempt
      const delay = backoff.calculateDelay(attempt);
      if (delay === null) break;

      // Call retry callback if provided
      if (onRetry) {
        try {
          await onRetry(error, attempt, delay, context);
        } catch (callbackError) {
          console.error('Error in retry callback:', callbackError);
        }
      }

      console.log(`retryWithCircuitBreaker: Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }

  // All retries exhausted
  if (onFailure) {
    try {
      await onFailure(lastError, attempt, context);
    } catch (callbackError) {
      console.error('Error in failure callback:', callbackError);
    }
  }

  throw lastError;
}

/**
 * Retry function for API calls with specific error handling
 * @param {Function} apiCall - API call function
 * @param {Object} options - Options
 * @returns {Promise} API response
 */
export async function retryApiCall(apiCall, options = {}) {
  const {
    endpoint = 'unknown',
    preset = 'STANDARD',
    ...otherOptions
  } = options;

  return retryWithCircuitBreaker(apiCall, {
    circuitBreakerName: `api-${endpoint}`,
    circuitBreakerOptions: {
      failureThreshold: 3,
      recoveryTimeout: 30000,
      expectedErrors: ['timeout', 'ECONNRESET', 'ENOTFOUND']
    },
    retryOptions: RETRY_PRESETS[preset] || RETRY_PRESETS.STANDARD,
    shouldRetry: (error) => {
      // Don't retry client errors (4xx) except 408, 429
      if (error.response?.status >= 400 && error.response?.status < 500) {
        return error.response.status === 408 || error.response.status === 429;
      }
      
      // Retry server errors (5xx) and network errors
      return error.response?.status >= 500 || 
             error.code === 'ECONNRESET' ||
             error.code === 'ENOTFOUND' ||
             error.code === 'ETIMEDOUT' ||
             error.message.includes('timeout');
    },
    onRetry: async (error, attempt, delay) => {
      console.log(`API retry for ${endpoint}: attempt ${attempt + 1}, delay ${delay}ms, error: ${error.message}`);
    },
    ...otherOptions
  });
}

/**
 * Retry function for database operations
 * @param {Function} dbOperation - Database operation function
 * @param {Object} options - Options
 * @returns {Promise} Database result
 */
export async function retryDatabaseOperation(dbOperation, options = {}) {
  const {
    operation = 'unknown',
    preset = 'QUICK',
    ...otherOptions
  } = options;

  return retryWithCircuitBreaker(dbOperation, {
    circuitBreakerName: `db-${operation}`,
    circuitBreakerOptions: {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      expectedErrors: ['connection', 'timeout', 'deadlock']
    },
    retryOptions: RETRY_PRESETS[preset] || RETRY_PRESETS.QUICK,
    shouldRetry: (error) => {
      // Retry connection errors, timeouts, and deadlocks
      return error.message.includes('connection') ||
             error.message.includes('timeout') ||
             error.message.includes('deadlock') ||
             error.code === 'ECONNRESET';
    },
    onRetry: async (error, attempt, delay) => {
      console.log(`Database retry for ${operation}: attempt ${attempt + 1}, delay ${delay}ms, error: ${error.message}`);
    },
    ...otherOptions
  });
}

/**
 * Retry function for SAP B1 Service Layer calls
 * @param {Function} sapCall - SAP call function
 * @param {Object} options - Options
 * @returns {Promise} SAP response
 */
export async function retrySapCall(sapCall, options = {}) {
  const {
    endpoint = 'unknown',
    preset = 'STANDARD',
    ...otherOptions
  } = options;

  return retryWithCircuitBreaker(sapCall, {
    circuitBreakerName: `sap-${endpoint}`,
    circuitBreakerOptions: {
      failureThreshold: 3,
      recoveryTimeout: 45000,
      expectedErrors: ['session', 'unauthorized', 'Service Unavailable']
    },
    retryOptions: RETRY_PRESETS[preset] || RETRY_PRESETS.STANDARD,
    shouldRetry: (error) => {
      // Don't retry authentication errors
      if (error.response?.status === 401) {
        return false;
      }
      
      // Retry server errors and specific SAP errors
      return error.response?.status >= 500 ||
             error.message.includes('Service Unavailable') ||
             error.message.includes('timeout') ||
             error.message.includes('connection');
    },
    onRetry: async (error, attempt, delay) => {
      console.log(`SAP retry for ${endpoint}: attempt ${attempt + 1}, delay ${delay}ms, error: ${error.message}`);
    },
    ...otherOptions
  });
}

/**
 * Batch retry utility for multiple operations
 * @param {Array} operations - Array of operation functions
 * @param {Object} options - Options
 * @returns {Promise<Array>} Array of results
 */
export async function retryBatch(operations, options = {}) {
  const {
    concurrency = 3,
    failFast = false,
    ...retryOptions
  } = options;

  const results = [];
  const errors = [];

  // Process operations in batches
  for (let i = 0; i < operations.length; i += concurrency) {
    const batch = operations.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (operation, index) => {
      try {
        const result = await retryWithCircuitBreaker(operation, {
          ...retryOptions,
          context: { batchIndex: i + index }
        });
        return { success: true, result, index: i + index };
      } catch (error) {
        const errorResult = { success: false, error, index: i + index };
        
        if (failFast) {
          throw errorResult;
        }
        
        return errorResult;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    
    batchResults.forEach(result => {
      if (result.success) {
        results[result.index] = result.result;
      } else {
        errors[result.index] = result.error;
      }
    });
  }

  return {
    results,
    errors,
    successCount: results.filter(r => r !== undefined).length,
    errorCount: errors.filter(e => e !== undefined).length
  };
}

/**
 * Create a retry wrapper for a function
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Retry options
 * @returns {Function} Wrapped function with retry logic
 */
export function createRetryWrapper(fn, options = {}) {
  return async (...args) => {
    return retryWithCircuitBreaker(() => fn(...args), options);
  };
}

/**
 * Get circuit breaker status for monitoring
 * @returns {Array} Array of circuit breaker states
 */
export function getCircuitBreakerStatus() {
  return circuitBreakerManager.getAllStates();
}

/**
 * Reset all circuit breakers (for testing or recovery)
 */
export function resetAllCircuitBreakers() {
  circuitBreakerManager.resetAll();
}

export default {
  retryWithCircuitBreaker,
  retryApiCall,
  retryDatabaseOperation,
  retrySapCall,
  retryBatch,
  createRetryWrapper,
  getCircuitBreakerStatus,
  resetAllCircuitBreakers,
  RETRY_PRESETS
};
