/**
 * Enhanced Data Service for SAS FSM Portal
 * Integrates all optimizations with authentication flow and SAP B1 connection handling
 */

import { retryApiCall, retrySapCall } from '../utils/retryUtils';
import { CustomerFallbacks, ServiceCallFallbacks, SalesOrderFallbacks, EquipmentFallbacks, applyFallback } from '../utils/fallbackHandlers';
import { AppError, ERROR_TYPES, ERROR_SEVERITY } from '../utils/errorHandler';
import customerCache from '../utils/customerCache';

/**
 * Enhanced Data Service Class
 */
export class EnhancedDataService {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '/api';
    this.enableCache = options.enableCache !== false;
    this.enableFallbacks = options.enableFallbacks !== false;
    this.enableRetry = options.enableRetry !== false;
    this.authCheckInterval = options.authCheckInterval || 5 * 60 * 1000; // 5 minutes
    
    // Authentication state
    this.isAuthenticated = false;
    this.sapConnectionStatus = 'unknown';
    this.lastAuthCheck = 0;
    
    // Performance tracking
    this.requestMetrics = {
      total: 0,
      successful: 0,
      failed: 0,
      cached: 0,
      fallback: 0
    };

    // Initialize authentication check
    this.checkAuthenticationStatus();
  }

  /**
   * Check authentication status and SAP connection
   */
  async checkAuthenticationStatus() {
    const now = Date.now();
    
    // Skip if recently checked
    if (now - this.lastAuthCheck < this.authCheckInterval) {
      return;
    }

    try {
      // Check cookies for authentication status
      const cookies = this.getCookies();
      this.isAuthenticated = !!(cookies.B1SESSION && cookies.uid && cookies.workerId);
      this.sapConnectionStatus = cookies.sapConnectionStatus || 'unknown';
      this.lastAuthCheck = now;

      // Validate session expiry
      if (this.isAuthenticated && cookies.B1SESSION_EXPIRY) {
        const expiryTime = new Date(cookies.B1SESSION_EXPIRY).getTime();
        if (now >= expiryTime) {
          this.isAuthenticated = false;
          this.sapConnectionStatus = 'expired';
        }
      }
    } catch (error) {
      console.warn('Error checking authentication status:', error);
      this.isAuthenticated = false;
      this.sapConnectionStatus = 'error';
    }
  }

  /**
   * Get cookies as object
   * @returns {Object} Cookies object
   */
  getCookies() {
    if (typeof document === 'undefined') return {};
    
    return document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});
  }

  /**
   * Make authenticated API request with all optimizations
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise} API response
   */
  async makeRequest(endpoint, options = {}) {
    const {
      method = 'GET',
      body = null,
      headers = {},
      useCache = this.enableCache,
      useFallback = this.enableFallbacks,
      useRetry = this.enableRetry,
      cacheKey = null,
      fallbackData = null,
      context = {}
    } = options;

    // Update metrics
    this.requestMetrics.total++;

    // Check authentication before making request
    await this.checkAuthenticationStatus();

    if (!this.isAuthenticated) {
      const authError = new AppError(
        'Authentication required',
        ERROR_TYPES.AUTH_ERROR,
        {
          severity: ERROR_SEVERITY.HIGH,
          context: { endpoint, ...context },
          userMessage: 'Please sign in to continue'
        }
      );
      
      if (useFallback) {
        this.requestMetrics.fallback++;
        return applyFallback(authError, `request_${endpoint}`, context);
      }
      
      throw authError;
    }

    // Check cache first
    if (useCache && cacheKey) {
      const cachedData = customerCache.get(cacheKey);
      if (cachedData) {
        this.requestMetrics.cached++;
        return {
          ...cachedData,
          meta: {
            ...cachedData.meta,
            fromCache: true,
            cacheHit: true
          }
        };
      }
    }

    // Prepare request function
    const requestFunction = async () => {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : null,
        credentials: 'include'
      });

      if (!response.ok) {
        // Handle specific HTTP errors
        if (response.status === 401) {
          this.isAuthenticated = false;
          throw new AppError(
            'Session expired',
            ERROR_TYPES.SESSION_EXPIRED,
            {
              severity: ERROR_SEVERITY.HIGH,
              code: response.status,
              context: { endpoint, ...context }
            }
          );
        }

        if (response.status === 403) {
          throw new AppError(
            'Access denied',
            ERROR_TYPES.UNAUTHORIZED,
            {
              severity: ERROR_SEVERITY.HIGH,
              code: response.status,
              context: { endpoint, ...context }
            }
          );
        }

        if (response.status >= 500) {
          throw new AppError(
            'Server error',
            ERROR_TYPES.SERVER_ERROR,
            {
              severity: ERROR_SEVERITY.HIGH,
              code: response.status,
              context: { endpoint, ...context }
            }
          );
        }

        const errorText = await response.text();
        throw new AppError(
          errorText || `HTTP ${response.status}`,
          ERROR_TYPES.API_ERROR,
          {
            severity: ERROR_SEVERITY.MEDIUM,
            code: response.status,
            context: { endpoint, ...context }
          }
        );
      }

      return response.json();
    };

    try {
      let result;

      if (useRetry) {
        // Use retry mechanism for SAP endpoints
        if (endpoint.includes('sap') || endpoint.includes('customer') || endpoint.includes('service')) {
          result = await retrySapCall(requestFunction, {
            endpoint: endpoint.replace(/^\//, ''),
            context
          });
        } else {
          result = await retryApiCall(requestFunction, {
            endpoint: endpoint.replace(/^\//, ''),
            context
          });
        }
      } else {
        result = await requestFunction();
      }

      // Cache successful results
      if (useCache && cacheKey && result) {
        customerCache.set(cacheKey, result);
      }

      this.requestMetrics.successful++;
      return result;

    } catch (error) {
      this.requestMetrics.failed++;

      // Apply fallback if enabled
      if (useFallback && fallbackData) {
        this.requestMetrics.fallback++;
        console.warn(`Using fallback for ${endpoint}:`, error.message);
        return fallbackData;
      }

      throw error;
    }
  }

  /**
   * Get customers with all optimizations
   * @param {Object} params - Query parameters
   * @returns {Promise} Customers data
   */
  async getCustomers(params = {}) {
    const cacheKey = customerCache.generateKey('customers', params);
    
    try {
      return await this.makeRequest('/customers', {
        method: 'GET',
        useCache: true,
        useFallback: true,
        useRetry: true,
        cacheKey,
        fallbackData: CustomerFallbacks.emptyCustomerList(params),
        context: { operation: 'get_customers', params }
      });
    } catch (error) {
      if (this.sapConnectionStatus === 'failed') {
        console.warn('SAP connection failed, using fallback for customers');
        return CustomerFallbacks.emptyCustomerList(params);
      }
      throw error;
    }
  }

  /**
   * Get customer details with all optimizations
   * @param {string} cardCode - Customer card code
   * @returns {Promise} Customer details
   */
  async getCustomer(cardCode) {
    const cacheKey = customerCache.generateKey('customer', { cardCode });
    
    try {
      const result = await this.makeRequest(`/customers/${cardCode}`, {
        method: 'GET',
        useCache: true,
        useFallback: true,
        useRetry: true,
        cacheKey,
        fallbackData: CustomerFallbacks.customerNotFound(cardCode),
        context: { operation: 'get_customer', cardCode }
      });

      // Apply fallbacks for missing data
      if (result && result.data) {
        let customer = result.data;
        
        if (!customer.locations || customer.locations.length === 0) {
          customer = CustomerFallbacks.customerWithoutLocations(customer);
        }
        
        if (!customer.contacts || customer.contacts.length === 0) {
          customer = CustomerFallbacks.customerWithoutContacts(customer);
        }
        
        return { ...result, data: customer };
      }

      return result;
    } catch (error) {
      if (this.sapConnectionStatus === 'failed') {
        console.warn('SAP connection failed, using fallback for customer');
        return CustomerFallbacks.customerNotFound(cardCode);
      }
      throw error;
    }
  }

  /**
   * Get service calls with all optimizations
   * @param {string} cardCode - Customer card code
   * @returns {Promise} Service calls data
   */
  async getServiceCalls(cardCode) {
    const cacheKey = customerCache.generateKey('serviceCalls', { cardCode });
    
    try {
      return await this.makeRequest('/getServiceCall', {
        method: 'POST',
        body: { cardCode },
        useCache: true,
        useFallback: true,
        useRetry: true,
        cacheKey,
        fallbackData: ServiceCallFallbacks.emptyServiceCalls(cardCode),
        context: { operation: 'get_service_calls', cardCode }
      });
    } catch (error) {
      if (this.sapConnectionStatus === 'failed') {
        console.warn('SAP connection failed, using fallback for service calls');
        return ServiceCallFallbacks.emptyServiceCalls(cardCode);
      }
      throw error;
    }
  }

  /**
   * Get sales orders with all optimizations
   * @param {string} cardCode - Customer card code
   * @param {string} serviceCallID - Service call ID
   * @returns {Promise} Sales orders data
   */
  async getSalesOrders(cardCode, serviceCallID) {
    const cacheKey = customerCache.generateKey('salesOrders', { cardCode, serviceCallID });
    
    try {
      return await this.makeRequest('/getSalesOrder', {
        method: 'POST',
        body: { cardCode, serviceCallID },
        useCache: true,
        useFallback: true,
        useRetry: true,
        cacheKey,
        fallbackData: SalesOrderFallbacks.emptySalesOrders(cardCode, serviceCallID),
        context: { operation: 'get_sales_orders', cardCode, serviceCallID }
      });
    } catch (error) {
      if (this.sapConnectionStatus === 'failed') {
        console.warn('SAP connection failed, using fallback for sales orders');
        return SalesOrderFallbacks.emptySalesOrders(cardCode, serviceCallID);
      }
      throw error;
    }
  }

  /**
   * Get equipment with all optimizations
   * @param {string} cardCode - Customer card code
   * @returns {Promise} Equipment data
   */
  async getEquipment(cardCode) {
    const cacheKey = customerCache.generateKey('equipment', { cardCode });
    
    try {
      return await this.makeRequest('/getEquipments', {
        method: 'POST',
        body: { cardCode },
        useCache: true,
        useFallback: true,
        useRetry: true,
        cacheKey,
        fallbackData: EquipmentFallbacks.emptyEquipment(cardCode),
        context: { operation: 'get_equipment', cardCode }
      });
    } catch (error) {
      if (this.sapConnectionStatus === 'failed') {
        console.warn('SAP connection failed, using fallback for equipment');
        return EquipmentFallbacks.emptyEquipment(cardCode);
      }
      throw error;
    }
  }

  /**
   * Get service metrics and status
   * @returns {Object} Service metrics
   */
  getMetrics() {
    return {
      authentication: {
        isAuthenticated: this.isAuthenticated,
        sapConnectionStatus: this.sapConnectionStatus,
        lastAuthCheck: this.lastAuthCheck
      },
      requests: this.requestMetrics,
      cache: customerCache.getStats(),
      performance: {
        successRate: this.requestMetrics.total > 0 
          ? (this.requestMetrics.successful / this.requestMetrics.total) * 100 
          : 0,
        cacheHitRate: this.requestMetrics.total > 0 
          ? (this.requestMetrics.cached / this.requestMetrics.total) * 100 
          : 0,
        fallbackRate: this.requestMetrics.total > 0 
          ? (this.requestMetrics.fallback / this.requestMetrics.total) * 100 
          : 0
      }
    };
  }

  /**
   * Reset service metrics
   */
  resetMetrics() {
    this.requestMetrics = {
      total: 0,
      successful: 0,
      failed: 0,
      cached: 0,
      fallback: 0
    };
  }

  /**
   * Force refresh authentication status
   */
  async refreshAuth() {
    this.lastAuthCheck = 0;
    await this.checkAuthenticationStatus();
  }
}

// Create singleton instance
const enhancedDataService = new EnhancedDataService();

export default enhancedDataService;
