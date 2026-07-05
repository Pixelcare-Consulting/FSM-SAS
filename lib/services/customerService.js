// lib/services/customerService.js
import sapService from './sapService.js';
import customerCache from '../utils/customerCache.js';
import {
  getFieldsByStrategy,
  FIELD_SELECTION_STRATEGY,
  buildCustomFieldFilters
} from '../config/sapFields.js';

/**
 * Customer Service
 * Handles all customer-related operations with SAP B1
 */
class CustomerService {
  constructor() {
    this.defaultPageSize = 100;
    this.maxPageSize = 500;
    this.defaultFieldStrategy = FIELD_SELECTION_STRATEGY.STANDARD_ONLY; // Safe default
  }



  /**
   * Build OData filter for customer search
   * @param {Object} searchParams - Search parameters
   * @returns {string} OData filter string
   */
  buildCustomerFilter(searchParams) {
    const {
      search = '',
      customerCode = '',
      customerName = '',
      email = '',
      phone = '',
      contractStatus = '',
      country = '',
      status = '',
      address = '',
      cardType = 'C' // Default to Customer type
    } = searchParams;

    let filterConditions = [];

    // Always filter by CardType to get only customers
    if (cardType) {
      filterConditions.push(`CardType eq '${cardType}'`);
    }

    // Specific field filters
    if (customerCode) {
      filterConditions.push(`contains(CardCode, '${customerCode.replace(/'/g, "''")}')`);
    }
    
    if (customerName) {
      filterConditions.push(`contains(CardName, '${customerName.replace(/'/g, "''")}')`);
    }
    
    if (email) {
      filterConditions.push(`contains(EmailAddress, '${email.replace(/'/g, "''")}')`);
    }
    
    if (phone) {
      filterConditions.push(`(contains(Phone1, '${phone.replace(/'/g, "''")}') or contains(Phone2, '${phone.replace(/'/g, "''")}'))`);
    }
    
    // Handle custom field filters using the configuration
    const customFilters = buildCustomFieldFilters(searchParams);
    filterConditions.push(...customFilters);
    
    if (country) {
      filterConditions.push(`Country eq '${country.replace(/'/g, "''")}'`);
    }
    
    if (status) {
      const validStatus = status === 'active' ? 'Y' : 'N';
      filterConditions.push(`Valid eq '${validStatus}'`);
    }
    
    if (address) {
      // Enhanced address search: Street, Unit/Building Name, Postal Code, and basic address fields
      const escapedAddress = address.replace(/'/g, "''");
      filterConditions.push(`(contains(Address, '${escapedAddress}') or contains(MailAddress, '${escapedAddress}') or contains(Street, '${escapedAddress}') or contains(ZipCode, '${escapedAddress}') or contains(Building, '${escapedAddress}') or contains(BillToBuildingFloorRoom, '${escapedAddress}'))`);
    }

    // General search across multiple fields
    if (search) {
      const searchTerm = search.replace(/'/g, "''");
      filterConditions.push(`(contains(CardCode, '${searchTerm}') or contains(CardName, '${searchTerm}') or contains(EmailAddress, '${searchTerm}') or contains(Phone1, '${searchTerm}'))`);
    }

    return filterConditions.join(' and ');
  }

  /**
   * Get customers with pagination and search (with caching)
   * @param {Object} params - Query parameters
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Object>} Customers data with pagination info
   */
  async getCustomers(params, sessionCookies) {
    const {
      page = 1,
      limit = this.defaultPageSize,
      orderBy = 'CardName',
      orderDirection = 'asc',
      useCache = true
    } = params;

    // Validate and sanitize pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(this.maxPageSize, Math.max(1, parseInt(limit) || this.defaultPageSize));
    const skip = (pageNum - 1) * pageSize;

    // Create cache key parameters
    const cacheParams = {
      page: pageNum,
      limit: pageSize,
      orderBy,
      orderDirection,
      ...params
    };

    // Check cache first
    if (useCache) {
      const cachedResult = customerCache.getCachedCustomers(cacheParams);
      if (cachedResult) {
        console.log('CustomerService: Returning cached customers');
        return {
          ...cachedResult,
          meta: {
            ...cachedResult.meta,
            fromCache: true,
            cacheHit: true
          }
        };
      }
    }

    // Build filter
    const filter = this.buildCustomerFilter(params);

    // Build order by
    const orderby = `${orderBy} ${orderDirection}`;

    // Select fields based on strategy (defaults to standard fields only for safety)
    const fieldStrategy = params.fieldStrategy || this.defaultFieldStrategy;
    const selectedFields = getFieldsByStrategy(fieldStrategy);
    const select = selectedFields.join(',');

    console.log(`CustomerService: Using field strategy '${fieldStrategy}' with ${selectedFields.length} fields`);
    console.log(`CustomerService: Selected fields: ${select}`);

    try {
      // Get customers with field selection fallback
      let customersData;
      try {
        customersData = await sapService.getBusinessPartners({
          skip,
          top: pageSize,
          filter,
          select,
          orderby,
          expand: 'BPAddresses' // Expand addresses to get detailed address information
        }, sessionCookies);
      } catch (fieldError) {
        if (fieldError.message.includes('invalid') || fieldError.message.includes('Property') || fieldError.message.includes('navigation property')) {
          console.warn('CustomerService: Address expansion failed, trying without expand');
          // First try without expand
          try {
            customersData = await sapService.getBusinessPartners({
              skip,
              top: pageSize,
              filter,
              select,
              orderby
              // No expand - get basic customer data only
            }, sessionCookies);
          } catch (basicError) {
            console.warn('CustomerService: Field error detected, falling back to minimal fields');
            // Fallback to minimal safe fields
            const minimalFields = getFieldsByStrategy(FIELD_SELECTION_STRATEGY.MINIMAL);
            const minimalSelect = minimalFields.join(',');

            customersData = await sapService.getBusinessPartners({
              skip,
              top: pageSize,
              filter,
              select: minimalSelect,
              orderby
              // No expand in fallback either
            }, sessionCookies);
          }
        } else {
          throw fieldError;
        }
      }

      // Get total count (check cache first)
      let totalCount;
      const countCacheParams = { filter };

      if (useCache) {
        totalCount = customerCache.getCachedCount(countCacheParams);
      }

      if (!totalCount) {
        totalCount = await sapService.getBusinessPartnersCount(filter, sessionCookies);
        if (useCache) {
          customerCache.cacheCount(countCacheParams, totalCount);
        }
      }

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / pageSize);
      const hasNextPage = pageNum < totalPages;
      const hasPrevPage = pageNum > 1;

      // Handle customers data
      let customers = customersData.value || [];

      // Log address data availability for debugging
      if (customers.length > 0) {
        const hasAddressData = customers[0].BPAddresses && customers[0].BPAddresses.length > 0;
        console.log(`CustomerService: Address data ${hasAddressData ? 'available' : 'not available'} from main query`);
      }

      const result = {
        customers,
        pagination: {
          currentPage: pageNum,
          pageSize,
          totalCount,
          totalPages,
          hasNextPage,
          hasPrevPage
        },
        meta: {
          filter: filter || 'none',
          orderBy: orderby,
          fromCache: false,
          cacheHit: false
        }
      };

      // Cache the result
      if (useCache) {
        customerCache.cacheCustomers(cacheParams, result.customers, result.pagination);
      }

      return result;
    } catch (error) {
      console.error('Error in getCustomers:', error);
      throw new Error(`Failed to fetch customers: ${error.message}`);
    }
  }

  /**
   * Get customer by CardCode (with caching)
   * @param {string} cardCode - Customer CardCode
   * @param {Object} sessionCookies - Session cookies
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<Object>} Customer data
   */
  async getCustomerByCode(cardCode, sessionCookies, useCache = true) {
    if (!cardCode) {
      throw new Error('CardCode is required');
    }

    // Check cache first
    if (useCache) {
      const cachedCustomer = customerCache.getCachedCustomer(cardCode);
      if (cachedCustomer) {
        console.log(`CustomerService: Returning cached customer ${cardCode}`);
        return {
          ...cachedCustomer,
          meta: {
            fromCache: true,
            cacheHit: true
          }
        };
      }
    }

    try {
      let customer;
      try {
        customer = await sapService.getBusinessPartner(cardCode, sessionCookies, 'BPAddresses');
      } catch (expandError) {
        if (expandError.message.includes('navigation property') || expandError.message.includes('invalid')) {
          console.warn(`CustomerService: Address expansion failed for ${cardCode}, trying without expand`);
          customer = await sapService.getBusinessPartner(cardCode, sessionCookies);
        } else {
          throw expandError;
        }
      }

      // Cache the result
      if (useCache && customer) {
        customerCache.cacheCustomer(cardCode, customer);
      }

      return {
        ...customer,
        meta: {
          fromCache: false,
          cacheHit: false
        }
      };
    } catch (error) {
      console.error(`Error fetching customer ${cardCode}:`, error);
      throw new Error(`Failed to fetch customer: ${error.message}`);
    }
  }

  /**
   * Get customer addresses on-demand (for individual customer details)
   * @param {string} cardCode - Customer CardCode
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Array>} Customer addresses
   */
  async getCustomerAddresses(cardCode, sessionCookies) {
    try {
      console.log(`CustomerService: Fetching addresses for ${cardCode}`);
      const addresses = await sapService.getBusinessPartnerAddresses(cardCode, sessionCookies);
      return addresses;
    } catch (error) {
      console.warn(`CustomerService: Failed to fetch addresses for ${cardCode}:`, error.message);
      return [];
    }
  }

  /**
   * Get customers using SQL query (for complex queries)
   * @param {string} queryId - SQL Query ID
   * @param {Object} params - Query parameters
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Array>} Customer data from SQL query
   */
  async getCustomersSQL(queryId, params = {}, sessionCookies) {
    try {
      const data = await sapService.executeSQLQuery(queryId, params, sessionCookies);
      return data?.value ?? [];
    } catch (error) {
      console.error(`Error executing SQL query ${queryId}:`, error);
      throw new Error(`Failed to execute customer SQL query: ${error.message}`);
    }
  }

  /**
   * Search customers with advanced options
   * @param {Object} searchParams - Advanced search parameters
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Object>} Search results
   */
  async searchCustomers(searchParams, sessionCookies) {
    const {
      query = '',
      fields = ['CardCode', 'CardName', 'EmailAddress', 'Phone1'],
      limit = 50,
      includeInactive = false
    } = searchParams;

    if (!query.trim()) {
      return { customers: [], totalCount: 0 };
    }

    // Build advanced search filter
    const searchTerm = query.replace(/'/g, "''");
    const fieldFilters = fields.map(field => `contains(${field}, '${searchTerm}')`);
    
    let filter = `(${fieldFilters.join(' or ')})`;
    
    // Add CardType filter
    filter += ` and CardType eq 'C'`;
    
    // Add active status filter if needed
    if (!includeInactive) {
      filter += ` and Valid eq 'Y'`;
    }

    try {
      const customersData = await sapService.getBusinessPartners({
        skip: 0,
        top: limit,
        filter,
        orderby: 'CardName asc'
      }, sessionCookies);

      const totalCount = await sapService.getBusinessPartnersCount(filter, sessionCookies);

      return {
        customers: customersData.value || [],
        totalCount,
        searchQuery: query,
        searchFields: fields
      };
    } catch (error) {
      console.error('Error in searchCustomers:', error);
      throw new Error(`Failed to search customers: ${error.message}`);
    }
  }

  /**
   * Get customer summary/basic info (optimized for dropdowns, etc.)
   * @param {Object} params - Query parameters
   * @param {Object} sessionCookies - Session cookies
   * @returns {Promise<Array>} Simplified customer list
   */
  async getCustomersSummary(params = {}, sessionCookies) {
    const { search = '', limit = 100 } = params;

    let filter = "CardType eq 'C' and Valid eq 'Y'";
    
    if (search) {
      const searchTerm = search.replace(/'/g, "''");
      filter += ` and (contains(CardCode, '${searchTerm}') or contains(CardName, '${searchTerm}'))`;
    }

    const select = getFieldsByStrategy(FIELD_SELECTION_STRATEGY.SUMMARY).join(',');

    try {
      const customersData = await sapService.getBusinessPartners({
        skip: 0,
        top: limit,
        filter,
        select,
        orderby: 'CardName asc'
      }, sessionCookies);

      return customersData.value?.map(customer => ({
        cardCode: customer.CardCode,
        cardName: customer.CardName
      })) || [];
    } catch (error) {
      console.error('Error in getCustomersSummary:', error);
      throw new Error(`Failed to fetch customer summary: ${error.message}`);
    }
  }
}

export default new CustomerService();
