# Customer API Documentation

## Overview

The Customer API provides a comprehensive, optimized interface for managing customer data from SAP Business One. It features advanced search capabilities, caching, performance monitoring, and a service layer architecture.

## Architecture

### Service Layer
- **SAP Service**: Base service for SAP B1 Service Layer operations
- **Customer Service**: Specialized service for customer operations
- **Caching Layer**: In-memory caching with TTL support
- **Performance Monitoring**: Request timing and metrics collection

### API Endpoints

#### 1. Unified Customer API
**Endpoint**: `/api/customers`

**Methods**: GET (POST, PUT, DELETE planned)

**Features**:
- Pagination with configurable limits
- Advanced filtering and search
- Caching with TTL
- Performance monitoring
- Multiple response formats

**Query Parameters**:
```
page: Page number (default: 1)
limit: Items per page (default: 100, max: 500)
search: General search term
customerCode: Filter by customer code
customerName: Filter by customer name
email: Filter by email
phone: Filter by phone
contractStatus: Filter by contract status (Y/N)
country: Filter by country
status: Filter by status (active/inactive)
address: Filter by address
orderBy: Order by field (default: CardName)
orderDirection: Order direction (asc/desc, default: asc)
format: Response format (full/summary, default: full)
useCache: Whether to use cache (true/false, default: true)
```

**Example Request**:
```bash
GET /api/customers?page=1&limit=50&search=acme&status=active&format=full
```

**Example Response**:
```json
{
  "success": true,
  "message": "Customers retrieved successfully",
  "data": {
    "customers": [...],
    "pagination": {
      "currentPage": 1,
      "pageSize": 50,
      "totalCount": 150,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPrevPage": false
    },
    "meta": {
      "filter": "CardType eq 'C' and Valid eq 'Y'",
      "orderBy": "CardName asc",
      "fromCache": false,
      "requestTime": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

#### 2. Customer Details API
**Endpoint**: `/api/customers/[cardCode]`

**Methods**: GET (PUT, DELETE planned)

**Query Parameters**:
```
useCache: Whether to use cache (true/false, default: true)
expand: Additional data to include (addresses, contacts, orders, invoices)
```

**Example Request**:
```bash
GET /api/customers/C001?expand=addresses,contacts
```

#### 3. Advanced Search API
**Endpoint**: `/api/customers/search`

**Method**: POST

**Request Body**:
```json
{
  "query": "search term",
  "fields": ["CardCode", "CardName", "EmailAddress", "Phone1"],
  "filters": {
    "contractStatus": "Y",
    "country": "US",
    "status": "active"
  },
  "options": {
    "limit": 50,
    "includeInactive": false,
    "exactMatch": false
  }
}
```

#### 4. SQL Query API
**Endpoint**: `/api/customers/query`

**Method**: POST

**Request Body**:
```json
{
  "queryId": "sql01",
  "params": {
    "CardCode": "C001",
    "Country": "US"
  },
  "customSql": "SELECT CardCode, CardName FROM OCRD WHERE CardType = 'C'",
  "options": {
    "limit": 100,
    "timeout": 30000
  }
}
```

#### 5. Performance Monitoring API
**Endpoint**: `/api/customers/performance`

**Methods**: GET, DELETE

**Query Parameters**:
```
timeWindow: Time window in minutes (default: 60)
endpoint: Specific endpoint to get stats for
format: Response format (summary/detailed, default: summary)
```

## Caching System

### Cache Types
- **Customer Lists**: 5 minutes TTL
- **Individual Customers**: 10 minutes TTL
- **Search Results**: 2 minutes TTL
- **Summary Data**: 15 minutes TTL
- **Count Queries**: 30 minutes TTL

### Cache Management
```javascript
import customerCache from '../lib/utils/customerCache.js';

// Get cache statistics
const stats = customerCache.getStats();

// Clear specific cache
customerCache.invalidateCustomer('C001');

// Clear all cache
customerCache.clear();
```

## Performance Monitoring

### Metrics Collected
- Request duration
- Cache hit/miss rates
- Slow query detection
- Endpoint performance statistics
- Error rates

### Performance Reports
```javascript
import performanceMonitor from '../lib/utils/performanceMonitor.js';

// Get performance report
const report = performanceMonitor.generateReport();

// Get endpoint statistics
const stats = performanceMonitor.getEndpointStats('customers');
```

## Error Handling

### Standardized Error Responses
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "statusCode": 400,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "details": "Additional error details (development only)"
  }
}
```

### Error Types
- **400**: Validation errors
- **401**: Unauthorized (session expired)
- **404**: Resource not found
- **408**: Request timeout
- **429**: Rate limit exceeded
- **500**: Internal server error
- **502**: SAP Service Layer error

## Migration Guide

### From Legacy Endpoints

**Old**: `/api/getCustomers`
**New**: `/api/customers?format=summary`

**Old**: `/api/getCustomersList`
**New**: `/api/customers`

**Old**: `/api/getCustomerCode`
**New**: `/api/customers/[cardCode]`

### Breaking Changes
- Response format standardized
- Error responses restructured
- Pagination format changed
- New required session validation

## Best Practices

### 1. Use Caching
```javascript
// Enable caching (default)
GET /api/customers?useCache=true

// Disable caching when needed
GET /api/customers?useCache=false
```

### 2. Optimize Queries
```javascript
// Use summary format for dropdowns
GET /api/customers?format=summary&limit=100

// Use specific filters
GET /api/customers?status=active&contractStatus=Y
```

### 3. Handle Errors
```javascript
try {
  const response = await fetch('/api/customers');
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error.message);
  }
  
  return data.data;
} catch (error) {
  console.error('Customer API error:', error);
  // Handle error appropriately
}
```

### 4. Monitor Performance
```javascript
// Check performance metrics
const performance = await fetch('/api/customers/performance');
const metrics = await performance.json();

// Clear cache if needed
await fetch('/api/customers/performance?clearCache=true', {
  method: 'DELETE'
});
```

## Configuration

### Environment Variables
```env
SAP_SERVICE_LAYER_BASE_URL=https://your-sap-server:50000/b1s/v1/
SAP_B1_COMPANY_DB=your_company_db
SAP_B1_USERNAME=your_username
SAP_B1_PASSWORD=your_password
```

### Cache Configuration
```javascript
// In customerCache.js
const ttl = {
  customers: 5 * 60 * 1000,      // 5 minutes
  customer: 10 * 60 * 1000,      // 10 minutes
  search: 2 * 60 * 1000,         // 2 minutes
  summary: 15 * 60 * 1000,       // 15 minutes
  count: 30 * 60 * 1000          // 30 minutes
};
```

## Security

### Session Validation
All endpoints require valid SAP B1 session cookies:
- `B1SESSION`: SAP session ID
- `ROUTEID`: SAP route ID
- `B1SESSION_EXPIRY`: Session expiry time (optional)

### Input Sanitization
All user inputs are sanitized to prevent:
- SQL injection
- XSS attacks
- Path traversal

### Rate Limiting
Built-in rate limiting prevents abuse:
- 100 requests per minute per IP (configurable)
- Slow query detection and logging

## Troubleshooting

### Common Issues

1. **Session Expired**
   - Check session cookies
   - Re-authenticate with SAP

2. **Slow Performance**
   - Check cache hit rates
   - Monitor slow queries
   - Optimize filters

3. **High Memory Usage**
   - Clear cache periodically
   - Reduce cache TTL
   - Monitor cache size

### Debug Mode
Enable debug logging:
```env
NODE_ENV=development
```

### Performance Monitoring
Check performance metrics:
```bash
GET /api/customers/performance?format=detailed
```
