/**
 * React Hooks for Enhanced Data Fetching
 * Integrates all optimizations with React components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import enhancedDataService from '../lib/services/enhancedDataService';
import { useErrorHandler } from './useErrorHandler';
import { usePagination } from './usePagination';

/**
 * Enhanced Data Fetching Hook
 * @param {Function} fetchFunction - Function to fetch data
 * @param {Object} options - Hook options
 * @returns {Object} Data fetching state and methods
 */
export function useEnhancedData(fetchFunction, options = {}) {
  const {
    immediate = false,
    dependencies = [],
    enableRetry = true,
    enableFallback = true,
    onSuccess = null,
    onError = null
  } = options;

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [metrics, setMetrics] = useState(null);
  
  const errorHandler = useErrorHandler({
    onError,
    autoRetry: enableRetry,
    maxRetries: 3
  });

  const abortControllerRef = useRef(null);

  // Execute fetch function
  const execute = useCallback(async (...args) => {
    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    errorHandler.clearError();

    try {
      const startTime = Date.now();
      const result = await fetchFunction(...args);
      const endTime = Date.now();

      setData(result);
      setLastFetch(new Date());
      setMetrics({
        responseTime: endTime - startTime,
        fromCache: result?.meta?.fromCache || false,
        fromFallback: result?.meta?.fromFallback || false
      });

      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (error) {
      if (error.name !== 'AbortError') {
        errorHandler.handleError(error, {
          operation: fetchFunction.name || 'data_fetch',
          args
        });
      }
      throw error;
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [fetchFunction, errorHandler, onSuccess]);

  // Retry with error handler
  const retry = useCallback(() => {
    return errorHandler.retry(() => execute());
  }, [errorHandler, execute]);

  // Refresh data (bypass cache)
  const refresh = useCallback(async (...args) => {
    // Clear cache if possible
    if (fetchFunction.clearCache) {
      fetchFunction.clearCache();
    }
    return execute(...args);
  }, [execute, fetchFunction]);

  // Execute immediately if requested
  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate, execute, ...dependencies]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // State
    data,
    isLoading,
    lastFetch,
    metrics,
    ...errorHandler,

    // Methods
    execute,
    retry,
    refresh,

    // Utilities
    isStale: lastFetch && Date.now() - lastFetch.getTime() > 5 * 60 * 1000, // 5 minutes
    hasData: !!data
  };
}

/**
 * Enhanced Customers Hook
 * @param {Object} params - Query parameters
 * @param {Object} options - Hook options
 * @returns {Object} Customers data and methods
 */
export function useEnhancedCustomers(params = {}, options = {}) {
  const {
    pageSize = 25,
    enablePagination = true,
    ...otherOptions
  } = options;

  // Pagination setup
  const pagination = usePagination({
    pageSize,
    totalCount: 0,
    onPageChange: async (page) => {
      await fetchCustomers({ ...params, page, limit: pageSize });
    }
  });

  // Data fetching
  const dataHook = useEnhancedData(
    useCallback(async (queryParams = {}) => {
      const result = await enhancedDataService.getCustomers(queryParams);
      
      // Update pagination total count
      if (enablePagination && result?.pagination?.totalCount) {
        pagination.setTotalCount(result.pagination.totalCount);
      }
      
      return result;
    }, [enablePagination, pagination]),
    otherOptions
  );

  // Fetch customers with current params
  const fetchCustomers = useCallback((queryParams = {}) => {
    const finalParams = enablePagination 
      ? { ...params, ...queryParams, page: pagination.currentPage, limit: pageSize }
      : { ...params, ...queryParams };
    
    return dataHook.execute(finalParams);
  }, [params, enablePagination, pagination.currentPage, pageSize, dataHook]);

  // Search customers
  const searchCustomers = useCallback((searchTerm) => {
    const searchParams = { ...params, search: searchTerm, page: 1 };
    if (enablePagination) {
      pagination.goToPage(1);
    }
    return fetchCustomers(searchParams);
  }, [params, enablePagination, pagination, fetchCustomers]);

  return {
    // Data state
    customers: dataHook.data?.customers || [],
    totalCount: dataHook.data?.totalCount || 0,
    ...dataHook,

    // Pagination (if enabled)
    ...(enablePagination ? pagination : {}),

    // Methods
    fetchCustomers,
    searchCustomers,
    
    // Utilities
    isEmpty: !dataHook.isLoading && (!dataHook.data?.customers || dataHook.data.customers.length === 0)
  };
}

/**
 * Enhanced Customer Details Hook
 * @param {string} cardCode - Customer card code
 * @param {Object} options - Hook options
 * @returns {Object} Customer details and methods
 */
export function useEnhancedCustomer(cardCode, options = {}) {
  const dataHook = useEnhancedData(
    useCallback(async (code) => {
      if (!code) return null;
      return enhancedDataService.getCustomer(code);
    }, []),
    {
      immediate: !!cardCode,
      dependencies: [cardCode],
      ...options
    }
  );

  // Fetch customer data
  const fetchCustomer = useCallback((code = cardCode) => {
    return dataHook.execute(code);
  }, [cardCode, dataHook]);

  return {
    // Data state
    customer: dataHook.data?.data || null,
    ...dataHook,

    // Methods
    fetchCustomer,
    
    // Utilities
    exists: dataHook.data?.data?.exists !== false,
    hasLocations: dataHook.data?.data?.locations?.length > 0,
    hasContacts: dataHook.data?.data?.contacts?.length > 0
  };
}

/**
 * Enhanced Service Calls Hook
 * @param {string} cardCode - Customer card code
 * @param {Object} options - Hook options
 * @returns {Object} Service calls data and methods
 */
export function useEnhancedServiceCalls(cardCode, options = {}) {
  const dataHook = useEnhancedData(
    useCallback(async (code) => {
      if (!code) return null;
      return enhancedDataService.getServiceCalls(code);
    }, []),
    {
      immediate: !!cardCode,
      dependencies: [cardCode],
      ...options
    }
  );

  // Fetch service calls
  const fetchServiceCalls = useCallback((code = cardCode) => {
    return dataHook.execute(code);
  }, [cardCode, dataHook]);

  return {
    // Data state
    serviceCalls: dataHook.data?.serviceCalls || dataHook.data || [],
    totalCount: dataHook.data?.totalCount || 0,
    ...dataHook,

    // Methods
    fetchServiceCalls,
    
    // Utilities
    isEmpty: !dataHook.isLoading && (!dataHook.data || (Array.isArray(dataHook.data) ? dataHook.data.length === 0 : dataHook.data.serviceCalls?.length === 0))
  };
}

/**
 * Enhanced Sales Orders Hook
 * @param {string} cardCode - Customer card code
 * @param {string} serviceCallID - Service call ID
 * @param {Object} options - Hook options
 * @returns {Object} Sales orders data and methods
 */
export function useEnhancedSalesOrders(cardCode, serviceCallID, options = {}) {
  const dataHook = useEnhancedData(
    useCallback(async (code, callId) => {
      if (!code || !callId) return null;
      return enhancedDataService.getSalesOrders(code, callId);
    }, []),
    {
      immediate: !!(cardCode && serviceCallID),
      dependencies: [cardCode, serviceCallID],
      ...options
    }
  );

  // Fetch sales orders
  const fetchSalesOrders = useCallback((code = cardCode, callId = serviceCallID) => {
    return dataHook.execute(code, callId);
  }, [cardCode, serviceCallID, dataHook]);

  return {
    // Data state
    salesOrders: dataHook.data?.value || dataHook.data?.salesOrders || [],
    totalCount: dataHook.data?.totalCount || 0,
    ...dataHook,

    // Methods
    fetchSalesOrders,
    
    // Utilities
    isEmpty: !dataHook.isLoading && (!dataHook.data || (dataHook.data.value?.length === 0 || dataHook.data.salesOrders?.length === 0))
  };
}

/**
 * Enhanced Equipment Hook
 * @param {string} cardCode - Customer card code
 * @param {Object} options - Hook options
 * @returns {Object} Equipment data and methods
 */
export function useEnhancedEquipment(cardCode, options = {}) {
  const dataHook = useEnhancedData(
    useCallback(async (code) => {
      if (!code) return null;
      return enhancedDataService.getEquipment(code);
    }, []),
    {
      immediate: !!cardCode,
      dependencies: [cardCode],
      ...options
    }
  );

  // Fetch equipment
  const fetchEquipment = useCallback((code = cardCode) => {
    return dataHook.execute(code);
  }, [cardCode, dataHook]);

  return {
    // Data state
    equipment: dataHook.data?.equipment || dataHook.data || [],
    totalCount: dataHook.data?.totalCount || 0,
    ...dataHook,

    // Methods
    fetchEquipment,
    
    // Utilities
    isEmpty: !dataHook.isLoading && (!dataHook.data || (Array.isArray(dataHook.data) ? dataHook.data.length === 0 : dataHook.data.equipment?.length === 0))
  };
}

/**
 * Service Metrics Hook
 * @returns {Object} Service metrics and methods
 */
export function useServiceMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch metrics
  const fetchMetrics = useCallback(() => {
    setIsLoading(true);
    try {
      const serviceMetrics = enhancedDataService.getMetrics();
      setMetrics(serviceMetrics);
    } catch (error) {
      console.error('Error fetching service metrics:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reset metrics
  const resetMetrics = useCallback(() => {
    enhancedDataService.resetMetrics();
    fetchMetrics();
  }, [fetchMetrics]);

  // Auto-fetch metrics on mount
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return {
    metrics,
    isLoading,
    fetchMetrics,
    resetMetrics
  };
}

export default {
  useEnhancedData,
  useEnhancedCustomers,
  useEnhancedCustomer,
  useEnhancedServiceCalls,
  useEnhancedSalesOrders,
  useEnhancedEquipment,
  useServiceMetrics
};
