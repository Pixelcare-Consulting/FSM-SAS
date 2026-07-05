import React, { useState } from 'react';
import { Card, Form, Button, Row, Col, OverlayTrigger, Tooltip, Badge } from 'react-bootstrap';
import { 
  Filter as FilterCircle, 
  Search, 
  ChevronUp, 
  ChevronDown, 
  X 
} from 'lucide-react';

const SchedulerFilterPanel = ({ 
  filters, 
  setFilters, 
  onClear, 
  loading, 
  handleSearch 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading) {
      e.preventDefault();
      handleSearch();
    }
  };

  // Count active filters
  const activeFiltersCount = Object.values(filters).filter(value => value !== '').length;

  return (
    <Card className="border-0 shadow-sm mb-4">
      <Card.Body className="p-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="d-flex align-items-center flex-grow-1">
            <OverlayTrigger
              placement="right"
              overlay={<Tooltip>Click to {isExpanded ? 'collapse' : 'expand'} worker filters</Tooltip>}
            >
              <div 
                className="d-flex align-items-center" 
                style={{ cursor: 'pointer' }}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <FilterCircle size={16} className="me-2 text-primary" />
                <h6 className="mb-0 me-2" style={{ fontSize: '1rem' }}>
                  Filter
                  {activeFiltersCount > 0 && (
                    <Badge 
                      bg="primary" 
                      className="ms-2" 
                      style={{ 
                        fontSize: '0.75rem', 
                        verticalAlign: 'middle',
                        borderRadius: '12px',
                        padding: '0.25em 0.6em'
                      }}
                    >
                      {activeFiltersCount}
                    </Badge>
                  )}
                </h6>
                {isExpanded ? (
                  <ChevronUp size={16} className="text-muted" />
                ) : (
                  <ChevronDown size={16} className="text-muted" />
                )}
              </div>
            </OverlayTrigger>

            {/* Quick search when collapsed */}
            {!isExpanded && (
              <div className="ms-4 flex-grow-1" style={{ maxWidth: '300px' }}>
                <Form.Group className="mb-0">
                  <OverlayTrigger
                    placement="top"
                    overlay={<Tooltip>Quick search by worker name! Press Enter to search.</Tooltip>}
                  >
                    <Form.Control
                      size="sm"
                      type="text"
                      value={filters.workerName}
                      onChange={(e) => setFilters(prev => ({ ...prev, workerName: e.target.value }))}
                      placeholder="Quick search by worker name..."
                      style={{ fontSize: '0.9rem', padding: '0.5rem 0.75rem' }}
                      onKeyPress={handleKeyPress}
                      disabled={loading}
                    />
                  </OverlayTrigger>
                </Form.Group>
              </div>
            )}
          </div>

          <div className="d-flex justify-content-end align-items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={onClear}
              disabled={loading}
              className="clear-btn d-flex align-items-center"
            >
              <X size={14} className="me-1" />
              Clear
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSearch}
              disabled={loading}
              className="search-btn d-flex align-items-center"
            >
              <Search size={14} className="me-1" />
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </div>

        {/* Expanded Filters */}
        <div
          style={{
            maxHeight: isExpanded ? '500px' : '0',
            overflow: 'hidden',
            transition: 'all 0.3s ease-in-out',
            opacity: isExpanded ? 1 : 0,
            marginTop: isExpanded ? '1rem' : '0'
          }}
        >
          <Row className="g-3">
            <Col md={6} lg={3}>
              <Form.Group>
                <Form.Label className="small mb-1">Worker Name</Form.Label>
                <Form.Control
                  size="sm"
                  type="text"
                  value={filters.workerName}
                  onChange={(e) => handleFilterChange('workerName', e.target.value)}
                  placeholder="Search by name..."
                  className="shadow-sm"
                  style={{ 
                    fontSize: '0.9rem', 
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px'
                  }}
                  onKeyPress={handleKeyPress}
                  disabled={loading}
                />
              </Form.Group>
            </Col>

            <Col md={6} lg={3}>
              <Form.Group>
                <Form.Label className="small mb-1">Worker ID</Form.Label>
                <Form.Control
                  size="sm"
                  type="text"
                  value={filters.workerId}
                  onChange={(e) => handleFilterChange('workerId', e.target.value)}
                  placeholder="Enter ID..."
                  className="shadow-sm"
                  style={{ 
                    fontSize: '0.9rem', 
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px'
                  }}
                  onKeyPress={handleKeyPress}
                  disabled={loading}
                />
              </Form.Group>
            </Col>

            <Col md={6} lg={3}>
              <Form.Group>
                <Form.Label className="small mb-1">Role</Form.Label>
                <Form.Select
                  size="sm"
                  value={filters.role}
                  onChange={(e) => handleFilterChange('role', e.target.value)}
                  className="shadow-sm"
                  style={{ 
                    fontSize: '0.9rem', 
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px'
                  }}
                  onKeyPress={handleKeyPress}
                  disabled={loading}
                >
                  <option value="">All Roles</option>
                  <option value="Worker">Worker</option>
                </Form.Select>
              </Form.Group>
            </Col>

            <Col md={6} lg={3}>
              <Form.Group>
                <Form.Label className="small mb-1">Status</Form.Label>
                <Form.Select
                  size="sm"
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="shadow-sm"
                  style={{ 
                    fontSize: '0.9rem', 
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px'
                  }}
                  onKeyPress={handleKeyPress}
                  disabled={loading}
                >
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="On Leave">On Leave</option>
                </Form.Select>
              </Form.Group>
            </Col>
          </Row>
        </div>
      </Card.Body>

      <style jsx global>{`
        .clear-btn, .search-btn {
          padding: 6px 12px !important;
          font-size: 14px !important;
          border-radius: 4px !important;
          transition: all 0.2s ease-in-out !important;
          border: none !important;
          position: relative;
          overflow: hidden;
        }

        .clear-btn {
          background-color: #FEE2E2 !important;
          color: #DC2626 !important;
        }

        .search-btn {
          background-color: #3B82F6 !important;
          color: white !important;
        }

        /* Hover animations */
        .clear-btn:hover, .search-btn:hover {
          transform: translateY(-1px);
        }

        .clear-btn:hover {
          background-color: #FEE2E2 !important;
          opacity: 0.9;
        }

        .search-btn:hover {
          background-color: #2563EB !important;
        }

        /* Active state animations */
        .clear-btn:active, .search-btn:active {
          transform: translateY(0);
        }

        /* Ripple effect */
        .clear-btn::after, .search-btn::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 120%;
          height: 120%;
          background: rgba(255, 255, 255, 0.2);
          transform: translate(-50%, -50%) scale(0);
          border-radius: 50%;
          transition: transform 0.3s ease;
        }

        .clear-btn:active::after, .search-btn:active::after {
          transform: translate(-50%, -50%) scale(1);
          opacity: 0;
        }

        /* Disabled state */
        .clear-btn:disabled, .search-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none !important;
        }

        /* Icon animations */
        .clear-btn svg, .search-btn svg {
          transition: transform 0.2s ease;
        }

        .clear-btn:hover svg {
          transform: rotate(90deg);
        }

        .search-btn:hover svg {
          transform: translateX(-2px);
        }
      `}</style>
    </Card>
  );
};

export default SchedulerFilterPanel; 

