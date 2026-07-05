/**
 * Enhanced Error Handling System for SAS FSM Portal
 * Provides comprehensive error handling with meaningful user messages,
 * proper logging, and user-friendly error states
 */

/**
 * Error Types and Categories
 */
export const ERROR_TYPES = {
  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  
  // Authentication errors
  AUTH_ERROR: 'AUTH_ERROR',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  
  // API errors
  API_ERROR: 'API_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  SERVER_ERROR: 'SERVER_ERROR',
  
  // SAP specific errors
  SAP_CONNECTION_ERROR: 'SAP_CONNECTION_ERROR',
  SAP_SERVICE_ERROR: 'SAP_SERVICE_ERROR',
  SAP_DATA_ERROR: 'SAP_DATA_ERROR',
  
  // Application errors
  DATA_PROCESSING_ERROR: 'DATA_PROCESSING_ERROR',
  CACHE_ERROR: 'CACHE_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Error Severity Levels
 */
export const ERROR_SEVERITY = {
  LOW: 'LOW',           // Minor issues, user can continue
  MEDIUM: 'MEDIUM',     // Moderate issues, some functionality affected
  HIGH: 'HIGH',         // Major issues, significant functionality affected
  CRITICAL: 'CRITICAL'  // Critical issues, application unusable
};

/**
 * Enhanced Error Class
 */
export class AppError extends Error {
  constructor(message, type = ERROR_TYPES.UNKNOWN_ERROR, options = {}) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.severity = options.severity || ERROR_SEVERITY.MEDIUM;
    this.code = options.code || null;
    this.context = options.context || {};
    this.timestamp = new Date().toISOString();
    this.userMessage = options.userMessage || this.generateUserMessage();
    this.retryable = options.retryable !== undefined ? options.retryable : this.isRetryable();
    this.reportable = options.reportable !== undefined ? options.reportable : true;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Generate user-friendly message based on error type
   * @returns {string} User-friendly message
   */
  generateUserMessage() {
    const messages = {
      [ERROR_TYPES.NETWORK_ERROR]: 'Unable to connect to the server. Please check your internet connection.',
      [ERROR_TYPES.TIMEOUT_ERROR]: 'The request is taking longer than expected. Please try again.',
      [ERROR_TYPES.CONNECTION_ERROR]: 'Connection lost. Please check your network and try again.',
      [ERROR_TYPES.AUTH_ERROR]: 'Authentication failed. Please sign in again.',
      [ERROR_TYPES.SESSION_EXPIRED]: 'Your session has expired. Please sign in again.',
      [ERROR_TYPES.UNAUTHORIZED]: 'You do not have permission to perform this action.',
      [ERROR_TYPES.VALIDATION_ERROR]: 'Please check your input and try again.',
      [ERROR_TYPES.NOT_FOUND]: 'The requested information could not be found.',
      [ERROR_TYPES.SERVER_ERROR]: 'A server error occurred. Please try again later.',
      [ERROR_TYPES.SAP_CONNECTION_ERROR]: 'Unable to connect to SAP system. Some features may be limited.',
      [ERROR_TYPES.SAP_SERVICE_ERROR]: 'SAP service is temporarily unavailable. Please try again later.',
      [ERROR_TYPES.SAP_DATA_ERROR]: 'Error processing SAP data. Please contact support if this persists.',
      [ERROR_TYPES.DATA_PROCESSING_ERROR]: 'Error processing data. Please try again.',
      [ERROR_TYPES.CACHE_ERROR]: 'Cache error occurred. Data may be refreshed.',
      [ERROR_TYPES.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.'
    };

    return messages[this.type] || messages[ERROR_TYPES.UNKNOWN_ERROR];
  }

  /**
   * Determine if error is retryable
   * @returns {boolean} True if error is retryable
   */
  isRetryable() {
    const retryableTypes = [
      ERROR_TYPES.NETWORK_ERROR,
      ERROR_TYPES.TIMEOUT_ERROR,
      ERROR_TYPES.CONNECTION_ERROR,
      ERROR_TYPES.SERVER_ERROR,
      ERROR_TYPES.SAP_CONNECTION_ERROR,
      ERROR_TYPES.SAP_SERVICE_ERROR,
      ERROR_TYPES.CACHE_ERROR
    ];

    return retryableTypes.includes(this.type);
  }

  /**
   * Convert error to JSON for logging
   * @returns {Object} Error object for logging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      userMessage: this.userMessage,
      retryable: this.retryable,
      reportable: this.reportable,
      stack: this.stack
    };
  }
}

/**
 * Error Handler Class
 */
export class ErrorHandler {
  constructor(options = {}) {
    this.logLevel = options.logLevel || 'error';
    this.enableConsoleLogging = options.enableConsoleLogging !== false;
    this.enableRemoteLogging = options.enableRemoteLogging || false;
    this.remoteLogEndpoint = options.remoteLogEndpoint || null;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    // Error statistics
    this.errorStats = {
      total: 0,
      byType: {},
      bySeverity: {},
      retryable: 0,
      resolved: 0
    };

    // Error listeners
    this.listeners = new Set();
  }

  /**
   * Handle an error
   * @param {Error|AppError} error - Error to handle
   * @param {Object} context - Additional context
   * @returns {AppError} Processed error
   */
  handle(error, context = {}) {
    // Convert to AppError if needed
    const appError = this.normalizeError(error, context);
    
    // Update statistics
    this.updateStats(appError);
    
    // Log the error
    this.logError(appError);
    
    // Notify listeners
    this.notifyListeners(appError);
    
    // Report to remote service if enabled
    if (this.enableRemoteLogging && appError.reportable) {
      this.reportError(appError);
    }
    
    return appError;
  }

  /**
   * Convert any error to AppError
   * @param {Error} error - Original error
   * @param {Object} context - Additional context
   * @returns {AppError} Normalized error
   */
  normalizeError(error, context = {}) {
    if (error instanceof AppError) {
      // Add additional context
      error.context = { ...error.context, ...context };
      return error;
    }

    // Determine error type based on error properties
    let type = ERROR_TYPES.UNKNOWN_ERROR;
    let severity = ERROR_SEVERITY.MEDIUM;

    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
      type = ERROR_TYPES.CONNECTION_ERROR;
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      type = ERROR_TYPES.TIMEOUT_ERROR;
    } else if (error.response?.status === 401) {
      type = ERROR_TYPES.UNAUTHORIZED;
      severity = ERROR_SEVERITY.HIGH;
    } else if (error.response?.status === 404) {
      type = ERROR_TYPES.NOT_FOUND;
      severity = ERROR_SEVERITY.LOW;
    } else if (error.response?.status >= 500) {
      type = ERROR_TYPES.SERVER_ERROR;
      severity = ERROR_SEVERITY.HIGH;
    } else if (error.message.includes('SAP')) {
      type = ERROR_TYPES.SAP_SERVICE_ERROR;
      severity = ERROR_SEVERITY.HIGH;
    }

    return new AppError(error.message, type, {
      severity,
      context: { ...context, originalError: error.name },
      code: error.code || error.response?.status
    });
  }

  /**
   * Update error statistics
   * @param {AppError} error - Error to track
   */
  updateStats(error) {
    this.errorStats.total++;
    this.errorStats.byType[error.type] = (this.errorStats.byType[error.type] || 0) + 1;
    this.errorStats.bySeverity[error.severity] = (this.errorStats.bySeverity[error.severity] || 0) + 1;
    
    if (error.retryable) {
      this.errorStats.retryable++;
    }
  }

  /**
   * Log error to console and/or remote service
   * @param {AppError} error - Error to log
   */
  logError(error) {
    if (this.enableConsoleLogging) {
      const logMethod = this.getLogMethod(error.severity);
      console[logMethod]('AppError:', {
        type: error.type,
        severity: error.severity,
        message: error.message,
        userMessage: error.userMessage,
        context: error.context,
        timestamp: error.timestamp,
        retryable: error.retryable
      });
    }
  }

  /**
   * Get appropriate console log method based on severity
   * @param {string} severity - Error severity
   * @returns {string} Console method name
   */
  getLogMethod(severity) {
    switch (severity) {
      case ERROR_SEVERITY.LOW:
        return 'info';
      case ERROR_SEVERITY.MEDIUM:
        return 'warn';
      case ERROR_SEVERITY.HIGH:
      case ERROR_SEVERITY.CRITICAL:
        return 'error';
      default:
        return 'log';
    }
  }

  /**
   * Report error to remote logging service
   * @param {AppError} error - Error to report
   */
  async reportError(error) {
    if (!this.remoteLogEndpoint) return;

    try {
      await fetch(this.remoteLogEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: error.toJSON(),
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString()
        })
      });
    } catch (reportError) {
      console.warn('Failed to report error to remote service:', reportError);
    }
  }

  /**
   * Add error listener
   * @param {Function} listener - Error listener function
   */
  addListener(listener) {
    this.listeners.add(listener);
  }

  /**
   * Remove error listener
   * @param {Function} listener - Error listener function
   */
  removeListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of error
   * @param {AppError} error - Error to notify about
   */
  notifyListeners(error) {
    this.listeners.forEach(listener => {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('Error in error listener:', listenerError);
      }
    });
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getStats() {
    return {
      ...this.errorStats,
      resolvedRate: this.errorStats.total > 0 ? (this.errorStats.resolved / this.errorStats.total) * 100 : 0,
      retryableRate: this.errorStats.total > 0 ? (this.errorStats.retryable / this.errorStats.total) * 100 : 0
    };
  }

  /**
   * Clear error statistics
   */
  clearStats() {
    this.errorStats = {
      total: 0,
      byType: {},
      bySeverity: {},
      retryable: 0,
      resolved: 0
    };
  }

  /**
   * Mark error as resolved
   * @param {string} errorId - Error ID or type
   */
  markResolved(errorId) {
    this.errorStats.resolved++;
  }
}

// Global error handler instance
const globalErrorHandler = new ErrorHandler({
  enableConsoleLogging: true,
  enableRemoteLogging: process.env.NODE_ENV === 'production'
});

// Global error event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    globalErrorHandler.handle(event.error, {
      source: 'window.error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    globalErrorHandler.handle(event.reason, {
      source: 'unhandledrejection'
    });
  });
}

export { globalErrorHandler };
export default ErrorHandler;
