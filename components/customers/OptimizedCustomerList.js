/**
 * Optimized Customer List Component
 * Demonstrates usage of all data fetching optimizations
 */

import React, { useState, useEffect } from 'react';
import { Table, Card, Row, Col, Form, Button, Badge, Alert, Pagination } from 'react-bootstrap';
import { useEnhancedCustomers } from '../../hooks/useEnhancedData';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { CustomerListSkeleton, ContextualSpinner } from '../loading';
import { ErrorAlert, LoadingError, NetworkError } from '../error/ErrorComponents';
import { ExtensionFriendlyPhone } from '../common/ExtensionFriendlyPhone';
/**
 * Optimized Customer List Component
 */
export const OptimizedCustomerList = ({ 
  initialPageSize = 25,
  enableSearch = true,
  enableFilters = true,
  enablePagination = true 
}) => {
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    country: '',
    contractStatus: ''
  });
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Enhanced data fetching with all optimizations
  const {
    customers,
    totalCount,
    isLoading,
    error,
    hasError,
    canRetry,
    retry,
    refresh,
    currentPage,
    pagination,
    goToPage,
    goToNextPage,
    goToPreviousPage,
    canGoNext,
    canGoPrevious,
    isEmpty,
    metrics,
    lastFetch
  } = useEnhancedCustomers(
    {
      search: debouncedSearch,
      ...filters,
      orderBy: 'CardName',
      orderDirection: 'asc'
    },
    {
      pageSize: initialPageSize,
      enablePagination,
      immediate: true,
      enableRetry: true,
      enableFallback: true
    }
  );

  // Handle search
  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  // Handle filter changes
  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setFilters({
      status: '',
      country: '',
      contractStatus: ''
    });
  };

  // Render performance metrics (for development)
  const renderMetrics = () => {
    if (!metrics || process.env.NODE_ENV !== 'development') return null;

    return (
      <Alert variant="info" className="small">
        <strong>Performance:</strong> {metrics.responseTime}ms | 
        <strong> Cache:</strong> {metrics.fromCache ? 'HIT' : 'MISS'} | 
        <strong> Fallback:</strong> {metrics.fromFallback ? 'YES' : 'NO'} |
        <strong> Last Fetch:</strong> {lastFetch?.toLocaleTimeString()}
      </Alert>
    );
  };

  // Render error state
  if (hasError && !isLoading) {
    if (error?.type === 'NETWORK_ERROR') {
      return (
        <Card>
          <Card.Body>
            <NetworkError onRetry={canRetry ? retry : null} />
          </Card.Body>
        </Card>
      );
    }

    return (
      <Card>
        <Card.Body>
          <ErrorAlert 
            error={error}
            onRetry={canRetry ? retry : null}
            showDetails={process.env.NODE_ENV === 'development'}
          />
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="optimized-customer-list">
      {/* Performance Metrics (Development Only) */}
      {renderMetrics()}

      {/* Search and Filters */}
      {(enableSearch || enableFilters) && (
        <Card className="mb-4">
          <Card.Body>
            <Row>
              {enableSearch && (
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Search Customers</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="Search by name, code, email, or phone..."
                      value={searchTerm}
                      onChange={handleSearch}
                    />
                  </Form.Group>
                </Col>
              )}
              
              {enableFilters && (
                <>
                  <Col md={2}>
                    <Form.Group>
                      <Form.Label>Status</Form.Label>
                      <Form.Select
                        value={filters.status}
                        onChange={(e) => handleFilterChange('status', e.target.value)}
                      >
                        <option value="">All</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  
                  <Col md={2}>
                    <Form.Group>
                      <Form.Label>Contract</Form.Label>
                      <Form.Select
                        value={filters.contractStatus}
                        onChange={(e) => handleFilterChange('contractStatus', e.target.value)}
                      >
                        <option value="">All</option>
                        <option value="Y">Yes</option>
                        <option value="N">No</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  
                  <Col md={2} className="d-flex align-items-end">
                    <Button 
                      variant="outline-secondary" 
                      onClick={clearFilters}
                      className="w-100"
                    >
                      Clear Filters
                    </Button>
                  </Col>
                </>
              )}
            </Row>
          </Card.Body>
        </Card>
      )}

      {/* Customer List */}
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">
            Customers 
            {totalCount > 0 && (
              <Badge bg="secondary" className="ms-2">
                {totalCount.toLocaleString()}
              </Badge>
            )}
          </h5>
          
          <div className="d-flex gap-2">
            <Button 
              variant="outline-primary" 
              size="sm" 
              onClick={refresh}
              disabled={isLoading}
            >
              <i className="fas fa-sync-alt me-2"></i>
              Refresh
            </Button>
          </div>
        </Card.Header>

        <Card.Body className="p-0">
          {isLoading ? (
            <CustomerListSkeleton rows={initialPageSize} />
          ) : isEmpty ? (
            <div className="text-center py-5">
              <i className="fas fa-users fa-3x text-muted mb-3"></i>
              <h5>No customers found</h5>
              <p className="text-muted">
                {debouncedSearch || Object.values(filters).some(f => f) 
                  ? 'Try adjusting your search or filters'
                  : 'No customers available'
                }
              </p>
              {(debouncedSearch || Object.values(filters).some(f => f)) && (
                <Button variant="outline-primary" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <Table responsive hover>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Code</th>
                  <th>Customer</th>
                  <th>Address Information</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Contract Duration</th>
                  <th>Contract</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer, index) => (
                  <tr key={customer.CardCode}>
                    <td>{(currentPage - 1) * initialPageSize + index + 1}</td>
                    <td>
                      <code>{customer.CardCode}</code>
                    </td>
                    <td>
                      <div>
                        <strong>{customer.CardName}</strong>
                        {customer.Valid === 'N' && (
                          <Badge bg="warning" className="ms-2">Inactive</Badge>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="small">
                        <div>
                          <i className="fas fa-chevron-right me-1"></i>
                          0 Billing Addresses & 0 Shipping Addresses
                        </div>
                        <div className="text-muted">
                          Click arrow to view address details
                        </div>
                      </div>
                    </td>
                    <td>
                      {customer.Phone1 ? (
                        <ExtensionFriendlyPhone raw={customer.Phone1} />
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>
                      {customer.EmailAddress ? (
                        <a href={`mailto:${customer.EmailAddress}`} className="text-decoration-none">
                          <i className="fas fa-envelope me-1"></i>
                          {customer.EmailAddress}
                        </a>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>
                      <Badge bg="secondary">No</Badge>
                    </td>
                    <td>
                      <Badge bg="secondary">No</Badge>
                    </td>
                    <td>
                      <Button variant="primary" size="sm">
                        <i className="fas fa-eye me-1"></i>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>

        {/* Pagination */}
        {enablePagination && pagination && pagination.totalPages > 1 && (
          <Card.Footer>
            <div className="d-flex justify-content-between align-items-center">
              <div className="text-muted small">
                Showing {((currentPage - 1) * initialPageSize) + 1} to{' '}
                {Math.min(currentPage * initialPageSize, totalCount)} of{' '}
                {totalCount.toLocaleString()} customers
              </div>
              
              <Pagination className="mb-0">
                <Pagination.Prev 
                  disabled={!canGoPrevious || isLoading}
                  onClick={goToPreviousPage}
                />
                
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  const page = i + 1;
                  return (
                    <Pagination.Item
                      key={page}
                      active={page === currentPage}
                      disabled={isLoading}
                      onClick={() => goToPage(page)}
                    >
                      {page}
                    </Pagination.Item>
                  );
                })}
                
                {pagination.totalPages > 5 && (
                  <>
                    <Pagination.Ellipsis disabled />
                    <Pagination.Item
                      disabled={isLoading}
                      onClick={() => goToPage(pagination.totalPages)}
                    >
                      {pagination.totalPages}
                    </Pagination.Item>
                  </>
                )}
                
                <Pagination.Next 
                  disabled={!canGoNext || isLoading}
                  onClick={goToNextPage}
                />
              </Pagination>
            </div>
          </Card.Footer>
        )}
      </Card>
    </div>
  );
};

export default OptimizedCustomerList;
