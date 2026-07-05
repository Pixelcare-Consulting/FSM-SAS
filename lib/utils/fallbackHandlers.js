/**
 * Fallback Handlers for SAS FSM Portal
 * Provides robust fallback mechanisms for handling missing or empty data scenarios
 */

/**
 * Customer Data Fallback Handlers
 */
export const CustomerFallbacks = {
  /**
   * Handle empty customer list
   * @param {Object} params - Query parameters
   * @returns {Object} Fallback response
   */
  emptyCustomerList: (params = {}) => ({
    customers: [],
    totalCount: 0,
    pagination: {
      page: params.page || 1,
      limit: params.limit || 25,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false
    },
    meta: {
      fromFallback: true,
      fallbackReason: 'no_customers_found',
      searchTerm: params.search || null,
      filters: params.filters || {},
      timestamp: new Date().toISOString()
    }
  }),

  /**
   * Handle customer with missing locations
   * @param {Object} customer - Customer data
   * @returns {Object} Customer with fallback locations
   */
  customerWithoutLocations: (customer) => ({
    ...customer,
    locations: [],
    locationCount: 0,
    defaultLocation: {
      address: customer.BillToAddress || customer.ShipToAddress || 'Address not available',
      city: customer.BillToCity || customer.ShipToCity || 'City not specified',
      state: customer.BillToState || customer.ShipToState || '',
      zipCode: customer.BillToZipCode || customer.ShipToZipCode || '',
      country: customer.BillToCountry || customer.ShipToCountry || 'Country not specified'
    },
    meta: {
      ...customer.meta,
      fallbackApplied: 'missing_locations',
      hasDefaultLocation: true
    }
  }),

  /**
   * Handle customer with missing contacts
   * @param {Object} customer - Customer data
   * @returns {Object} Customer with fallback contacts
   */
  customerWithoutContacts: (customer) => ({
    ...customer,
    contacts: [],
    contactCount: 0,
    primaryContact: {
      name: customer.ContactPerson || 'Contact not specified',
      email: customer.EmailAddress || null,
      phone: customer.Phone1 || customer.Phone2 || null,
      isPrimary: true,
      isDefault: true
    },
    meta: {
      ...customer.meta,
      fallbackApplied: 'missing_contacts',
      hasPrimaryContact: !!(customer.ContactPerson || customer.EmailAddress || customer.Phone1)
    }
  }),

  /**
   * Handle customer not found
   * @param {string} cardCode - Customer card code
   * @returns {Object} Fallback customer data
   */
  customerNotFound: (cardCode) => ({
    cardCode,
    cardName: 'Customer Not Found',
    exists: false,
    error: 'Customer not found in system',
    meta: {
      fromFallback: true,
      fallbackReason: 'customer_not_found',
      searchedCardCode: cardCode,
      timestamp: new Date().toISOString()
    }
  })
};

/**
 * Service Call Fallback Handlers
 */
export const ServiceCallFallbacks = {
  /**
   * Handle empty service calls list
   * @param {string} cardCode - Customer card code
   * @returns {Array} Empty service calls array with metadata
   */
  emptyServiceCalls: (cardCode) => ({
    serviceCalls: [],
    totalCount: 0,
    customerCardCode: cardCode,
    meta: {
      fromFallback: true,
      fallbackReason: 'no_service_calls_found',
      message: 'No service calls found for this customer',
      timestamp: new Date().toISOString()
    }
  }),

  /**
   * Handle service call unavailable
   * @param {string} serviceCallId - Service call ID
   * @returns {Object} Fallback service call data
   */
  serviceCallUnavailable: (serviceCallId) => ({
    serviceCallID: serviceCallId,
    subject: 'Service Call Unavailable',
    status: 'Unknown',
    available: false,
    error: 'Service call data temporarily unavailable',
    meta: {
      fromFallback: true,
      fallbackReason: 'service_call_unavailable',
      timestamp: new Date().toISOString()
    }
  }),

  /**
   * Handle service call with missing details
   * @param {Object} serviceCall - Basic service call data
   * @returns {Object} Service call with fallback details
   */
  serviceCallMissingDetails: (serviceCall) => ({
    ...serviceCall,
    description: serviceCall.description || 'Description not available',
    priority: serviceCall.priority || 'Normal',
    assignedTechnician: serviceCall.assignedTechnician || 'Not assigned',
    estimatedDuration: serviceCall.estimatedDuration || 'Not specified',
    equipment: serviceCall.equipment || [],
    notes: serviceCall.notes || [],
    meta: {
      ...serviceCall.meta,
      fallbackApplied: 'missing_service_call_details',
      hasBasicInfo: true
    }
  })
};

/**
 * Sales Order Fallback Handlers
 */
export const SalesOrderFallbacks = {
  /**
   * Handle empty sales orders list
   * @param {string} cardCode - Customer card code
   * @param {string} serviceCallId - Service call ID (optional)
   * @returns {Object} Empty sales orders response
   */
  emptySalesOrders: (cardCode, serviceCallId = null) => ({
    salesOrders: [],
    totalCount: 0,
    customerCardCode: cardCode,
    serviceCallId,
    meta: {
      fromFallback: true,
      fallbackReason: 'no_sales_orders_found',
      message: serviceCallId 
        ? `No sales orders found for service call #${serviceCallId}`
        : 'No sales orders found for this customer',
      timestamp: new Date().toISOString()
    }
  }),

  /**
   * Handle sales order with missing details
   * @param {Object} salesOrder - Basic sales order data
   * @returns {Object} Sales order with fallback details
   */
  salesOrderMissingDetails: (salesOrder) => ({
    ...salesOrder,
    docTotal: salesOrder.docTotal || 0,
    docStatus: salesOrder.docStatus || 'Unknown',
    docDate: salesOrder.docDate || new Date().toISOString(),
    deliveryDate: salesOrder.deliveryDate || null,
    items: salesOrder.items || [],
    itemCount: salesOrder.items?.length || 0,
    meta: {
      ...salesOrder.meta,
      fallbackApplied: 'missing_sales_order_details',
      hasBasicInfo: true
    }
  })
};

/**
 * Equipment Fallback Handlers
 */
export const EquipmentFallbacks = {
  /**
   * Handle empty equipment list
   * @param {string} cardCode - Customer card code
   * @returns {Object} Empty equipment response
   */
  emptyEquipment: (cardCode) => ({
    equipment: [],
    totalCount: 0,
    customerCardCode: cardCode,
    meta: {
      fromFallback: true,
      fallbackReason: 'no_equipment_found',
      message: 'No equipment found for this customer',
      timestamp: new Date().toISOString()
    }
  }),

  /**
   * Handle equipment with missing details
   * @param {Object} equipment - Basic equipment data
   * @returns {Object} Equipment with fallback details
   */
  equipmentMissingDetails: (equipment) => ({
    ...equipment,
    serialNumber: equipment.serialNumber || 'Not specified',
    model: equipment.model || 'Unknown model',
    manufacturer: equipment.manufacturer || 'Unknown manufacturer',
    installationDate: equipment.installationDate || null,
    warrantyExpiry: equipment.warrantyExpiry || null,
    status: equipment.status || 'Unknown',
    location: equipment.location || 'Location not specified',
    meta: {
      ...equipment.meta,
      fallbackApplied: 'missing_equipment_details',
      hasBasicInfo: true
    }
  })
};

/**
 * General Data Fallback Handlers
 */
export const GeneralFallbacks = {
  /**
   * Handle API timeout
   * @param {string} operation - Operation that timed out
   * @param {number} timeout - Timeout duration
   * @returns {Object} Timeout fallback response
   */
  apiTimeout: (operation, timeout = 30000) => ({
    success: false,
    error: 'Request timeout',
    operation,
    timeout,
    meta: {
      fromFallback: true,
      fallbackReason: 'api_timeout',
      message: `Operation "${operation}" timed out after ${timeout / 1000} seconds`,
      timestamp: new Date().toISOString(),
      retryRecommended: true
    }
  }),

  /**
   * Handle SAP connection failure
   * @param {string} operation - Operation that failed
   * @returns {Object} SAP connection fallback response
   */
  sapConnectionFailure: (operation) => ({
    success: false,
    error: 'SAP connection unavailable',
    operation,
    meta: {
      fromFallback: true,
      fallbackReason: 'sap_connection_failure',
      message: 'SAP B1 Service Layer is temporarily unavailable',
      timestamp: new Date().toISOString(),
      limitedModeActive: true,
      retryRecommended: true
    }
  }),

  /**
   * Handle database connection failure
   * @param {string} operation - Operation that failed
   * @returns {Object} Database connection fallback response
   */
  databaseConnectionFailure: (operation) => ({
    success: false,
    error: 'Database connection unavailable',
    operation,
    meta: {
      fromFallback: true,
      fallbackReason: 'database_connection_failure',
      message: 'Database is temporarily unavailable',
      timestamp: new Date().toISOString(),
      retryRecommended: true
    }
  }),

  /**
   * Handle authentication failure
   * @param {string} reason - Failure reason
   * @returns {Object} Authentication fallback response
   */
  authenticationFailure: (reason = 'unknown') => ({
    success: false,
    error: 'Authentication failed',
    reason,
    meta: {
      fromFallback: true,
      fallbackReason: 'authentication_failure',
      message: 'Please sign in again to continue',
      timestamp: new Date().toISOString(),
      requiresReauth: true
    }
  })
};

/**
 * Fallback Response Builder
 * Utility to build consistent fallback responses
 */
export class FallbackResponseBuilder {
  constructor(operation) {
    this.operation = operation;
    this.response = {
      success: false,
      data: null,
      error: null,
      meta: {
        fromFallback: true,
        operation,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Set fallback reason
   * @param {string} reason - Fallback reason
   * @returns {FallbackResponseBuilder} Builder instance
   */
  reason(reason) {
    this.response.meta.fallbackReason = reason;
    return this;
  }

  /**
   * Set error message
   * @param {string} error - Error message
   * @returns {FallbackResponseBuilder} Builder instance
   */
  error(error) {
    this.response.error = error;
    return this;
  }

  /**
   * Set fallback data
   * @param {any} data - Fallback data
   * @returns {FallbackResponseBuilder} Builder instance
   */
  data(data) {
    this.response.data = data;
    this.response.success = true;
    return this;
  }

  /**
   * Set custom message
   * @param {string} message - Custom message
   * @returns {FallbackResponseBuilder} Builder instance
   */
  message(message) {
    this.response.meta.message = message;
    return this;
  }

  /**
   * Add metadata
   * @param {Object} meta - Additional metadata
   * @returns {FallbackResponseBuilder} Builder instance
   */
  addMeta(meta) {
    this.response.meta = { ...this.response.meta, ...meta };
    return this;
  }

  /**
   * Build the fallback response
   * @returns {Object} Fallback response
   */
  build() {
    return this.response;
  }
}

/**
 * Apply appropriate fallback based on error type
 * @param {Error} error - The error that occurred
 * @param {string} operation - Operation that failed
 * @param {Object} context - Additional context
 * @returns {Object} Appropriate fallback response
 */
export function applyFallback(error, operation, context = {}) {
  const builder = new FallbackResponseBuilder(operation);

  // Handle specific error types
  if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
    return GeneralFallbacks.apiTimeout(operation, context.timeout);
  }

  if (error.message.includes('SAP') || error.message.includes('Service Layer')) {
    return GeneralFallbacks.sapConnectionFailure(operation);
  }

  if (error.message.includes('database') || error.message.includes('connection')) {
    return GeneralFallbacks.databaseConnectionFailure(operation);
  }

  if (error.message.includes('auth') || error.response?.status === 401) {
    return GeneralFallbacks.authenticationFailure(error.message);
  }

  // Generic fallback
  return builder
    .reason('generic_error')
    .error(error.message)
    .message(`Operation "${operation}" failed: ${error.message}`)
    .addMeta({ originalError: error.message })
    .build();
}

export default {
  CustomerFallbacks,
  ServiceCallFallbacks,
  SalesOrderFallbacks,
  EquipmentFallbacks,
  GeneralFallbacks,
  FallbackResponseBuilder,
  applyFallback
};
