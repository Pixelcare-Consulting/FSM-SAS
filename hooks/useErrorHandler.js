/**
 * React Hook for Error Handling
 * Provides easy-to-use error handling functionality for React components
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { globalErrorHandler, AppError, ERROR_TYPES } from '../lib/utils/errorHandler';

/**
 * Error Handling Hook
 * @param {Object} options - Hook options
 * @returns {Object} Error handling state and methods
 */
export function useErrorHandler(options = {}) {
  const {
    onError = null,
    autoRetry = false,
    maxRetries = 3,
    retryDelay = 1000,
    showToast = false
  } = options;

  const [error, setError] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef(null);

  // Handle error
  const handleError = useCallback((error, context = {}) => {
    // Process error through global handler
    const processedError = globalErrorHandler.handle(error, context);
    
    // Set local error state
    setError(processedError);
    setRetryCount(0);
    
    // Call custom error handler if provided
    if (onError) {
      onError(processedError);
    }

    // Show toast notification if enabled
    if (showToast && typeof window !== 'undefined' && window.toast) {
      window.toast.error(processedError.userMessage);
    }

    return processedError;
  }, [onError, showToast]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
    setIsRetrying(false);
    setRetryCount(0);
    
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  // Retry function
  const retry = useCallback(async (retryFunction) => {
    if (!error || !error.retryable || isRetrying) {
      return;
    }

    setIsRetrying(true);
    
    try {
      const result = await retryFunction();
      clearError();
      globalErrorHandler.markResolved(error.type);
      return result;
    } catch (retryError) {
      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);
      
      if (newRetryCount >= maxRetries) {
        // Max retries reached, update error
        const updatedError = new AppError(
          `Failed after ${maxRetries} attempts: ${retryError.message}`,
          error.type,
          {
            ...error,
            retryable: false,
            context: {
              ...error.context,
              maxRetriesReached: true,
              totalAttempts: newRetryCount
            }
          }
        );
        setError(updatedError);
      } else if (autoRetry) {
        // Schedule automatic retry
        const delay = retryDelay * Math.pow(2, newRetryCount - 1); // Exponential backoff
        retryTimeoutRef.current = setTimeout(() => {
          retry(retryFunction);
        }, delay);
      }
      
      throw retryError;
    } finally {
      setIsRetrying(false);
    }
  }, [error, isRetrying, retryCount, maxRetries, retryDelay, autoRetry, clearError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return {
    // State
    error,
    isRetrying,
    retryCount,
    hasError: !!error,
    canRetry: error?.retryable && retryCount < maxRetries,

    // Methods
    handleError,
    clearError,
    retry
  };
}

/**
 * Async Operation Hook with Error Handling
 * @param {Function} asyncFunction - Async function to execute
 * @param {Object} options - Hook options
 * @returns {Object} Async operation state and methods
 */
export function useAsyncWithError(asyncFunction, options = {}) {
  const {
    immediate = false,
    dependencies = [],
    ...errorOptions
  } = options;

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const errorHandler = useErrorHandler(errorOptions);

  // Execute async function
  const execute = useCallback(async (...args) => {
    setIsLoading(true);
    errorHandler.clearError();

    try {
      const result = await asyncFunction(...args);
      setData(result);
      return result;
    } catch (error) {
      errorHandler.handleError(error, {
        operation: asyncFunction.name || 'async_operation',
        args
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [asyncFunction, errorHandler]);

  // Retry with the same arguments
  const retryLastOperation = useCallback(() => {
    return errorHandler.retry(() => execute());
  }, [errorHandler, execute]);

  // Execute immediately if requested
  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate, execute, ...dependencies]);

  return {
    // State
    data,
    isLoading,
    ...errorHandler,

    // Methods
    execute,
    retry: retryLastOperation
  };
}

/**
 * Form Error Handling Hook
 * @param {Object} options - Hook options
 * @returns {Object} Form error handling state and methods
 */
export function useFormErrors(options = {}) {
  const { clearOnSubmit = true } = options;
  
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState(null);

  // Set field error
  const setFieldError = useCallback((field, error) => {
    setFieldErrors(prev => ({
      ...prev,
      [field]: error
    }));
  }, []);

  // Clear field error
  const clearFieldError = useCallback((field) => {
    setFieldErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  // Set multiple field errors
  const setFieldErrors = useCallback((errors) => {
    setFieldErrors(prev => ({
      ...prev,
      ...errors
    }));
  }, []);

  // Clear all field errors
  const clearFieldErrors = useCallback(() => {
    setFieldErrors({});
  }, []);

  // Set general error
  const setGeneralError = useCallback((error) => {
    if (error instanceof Error) {
      setGeneralError(globalErrorHandler.handle(error));
    } else {
      setGeneralError(error);
    }
  }, []);

  // Clear general error
  const clearGeneralError = useCallback(() => {
    setGeneralError(null);
  }, []);

  // Clear all errors
  const clearAllErrors = useCallback(() => {
    setFieldErrors({});
    setGeneralError(null);
  }, []);

  // Handle form submission errors
  const handleSubmitError = useCallback((error) => {
    if (error.response?.data?.fieldErrors) {
      // Handle validation errors
      setFieldErrors(error.response.data.fieldErrors);
    } else {
      // Handle general submission error
      setGeneralError(globalErrorHandler.handle(error, {
        operation: 'form_submission'
      }));
    }
  }, []);

  // Get error for specific field
  const getFieldError = useCallback((field) => {
    return fieldErrors[field] || null;
  }, [fieldErrors]);

  // Check if field has error
  const hasFieldError = useCallback((field) => {
    return !!fieldErrors[field];
  }, [fieldErrors]);

  return {
    // State
    fieldErrors,
    generalError,
    hasErrors: Object.keys(fieldErrors).length > 0 || !!generalError,
    hasFieldErrors: Object.keys(fieldErrors).length > 0,
    hasGeneralError: !!generalError,

    // Field error methods
    setFieldError,
    clearFieldError,
    setFieldErrors,
    clearFieldErrors,
    getFieldError,
    hasFieldError,

    // General error methods
    setGeneralError,
    clearGeneralError,

    // Utility methods
    clearAllErrors,
    handleSubmitError
  };
}

/**
 * Global Error Listener Hook
 * @param {Function} onError - Error callback
 * @returns {Object} Error listener utilities
 */
export function useGlobalErrorListener(onError) {
  useEffect(() => {
    if (onError) {
      globalErrorHandler.addListener(onError);
      
      return () => {
        globalErrorHandler.removeListener(onError);
      };
    }
  }, [onError]);

  return {
    errorStats: globalErrorHandler.getStats(),
    clearStats: globalErrorHandler.clearStats.bind(globalErrorHandler)
  };
}

export default {
  useErrorHandler,
  useAsyncWithError,
  useFormErrors,
  useGlobalErrorListener
};
