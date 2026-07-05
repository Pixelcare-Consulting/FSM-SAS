import React, { useState } from 'react';
import {
  Row,
  Col,
  Card,
  Form,
  Button,
  Badge,
  OverlayTrigger,
  Tooltip
} from 'react-bootstrap';
import { 
  Filter, 
  Search, 
  ChevronUp, 
  ChevronDown,
  X 
} from 'lucide-react';

const FilterPanel = ({ 
  filters, 
  setFilters, 
  onClear, 
  loading, 
  handleSearch
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading) {
      handleSearch();
    }
  };

  return (
    <Card className="border-0 shadow-sm mb-4">
      <Card.Body className="p-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="d-flex align-items-center flex-grow-1">
            <OverlayTrigger
              placement="right"
              overlay={
                <Tooltip>
                  Click to {isExpanded ? 'collapse' : 'expand'} filters
                </Tooltip>
              }
            >
              <div 
                className="d-flex align-items-center" 
                style={{ cursor: 'pointer' }}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <Filter size={16} className="me-2 text-primary" />
                <h6 className="mb-0 me-2" style={{ fontSize: '1rem' }}>
                  Filter Workers
                  {Object.values(filters).filter(value => value !== '').length > 0 && (
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
                      {Object.values(filters).filter(value => value !== '').length}
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

            {!isExpanded && (
              <div className="ms-4 flex-grow-1" style={{ maxWidth: '300px' }}>
                <Form.Group className="mb-0">
                  <Form.Control
                    size="sm"
                    type="text"
                    value={filters.workerName}
                    onChange={(e) => setFilters(prev => ({ ...prev, workerName: e.target.value }))}
                    placeholder="Search by worker name..."
                    onKeyPress={handleKeyPress}
                    style={{ fontSize: '0.9rem', padding: '0.5rem 0.75rem' }}
                  />
                </Form.Group>
              </div>
            )}
          </div>

          <div>
            <Button 
              variant="outline-danger" 
              size="sm"
              onClick={onClear}
              className="me-2"
              disabled={loading}
              style={{ fontSize: '0.9rem' }}
            >
              <X size={14} className="me-1" />
              Clear
            </Button>
            
            <Button 
              variant="primary" 
              size="sm"
              onClick={handleSearch}
              disabled={loading}
            >
              <Search size={14} className="me-1" />
              Search
            </Button>
          </div>
        </div>

        <div style={{ 
          maxHeight: isExpanded ? '1000px' : '0',
          overflow: 'hidden',
          transition: 'all 0.3s ease-in-out',
          opacity: isExpanded ? 1 : 0
        }}>
          <Row>
            <Col md={6}>
              <Form.Group className="mb-2">
                <Form.Label className="small mb-1">Worker ID:</Form.Label>
                <Form.Control
                  size="sm"
                  type="text"
                  value={filters.workerId}
                  onChange={(e) => setFilters(prev => ({ ...prev, workerId: e.target.value }))}
                  placeholder="Enter worker ID..."
                  onKeyPress={handleKeyPress}
                  style={{ fontSize: '0.9rem', padding: '0.5rem 0.75rem' }}
                />
              </Form.Group>

              <Form.Group className="mb-2">
                <Form.Label className="small mb-1">Worker Name:</Form.Label>
                <Form.Control
                  size="sm"
                  type="text"
                  value={filters.workerName}
                  onChange={(e) => setFilters(prev => ({ ...prev, workerName: e.target.value }))}
                  placeholder="Search by worker name..."
                  onKeyPress={handleKeyPress}
                  style={{ fontSize: '0.9rem', padding: '0.5rem 0.75rem' }}
                />
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group className="mb-2">
                <Form.Label className="small mb-1">Role:</Form.Label>
                <Form.Select
                  size="sm"
                  value={filters.role}
                  onChange={(e) => setFilters(prev => ({ ...prev, role: e.target.value }))}
                  style={{ fontSize: '0.9rem', padding: '0.5rem 0.75rem' }}
                >
                  <option value="">All Roles</option>
                  <option value="technician">Technician</option>
                  <option value="developer">Developer</option>
                  <option value="worker">Worker</option>
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-2">
                <Form.Label className="small mb-1">Status:</Form.Label>
                <Form.Select
                  size="sm"
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  style={{ fontSize: '0.9rem', padding: '0.5rem 0.75rem' }}
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Form.Select>
              </Form.Group>
            </Col>
          </Row>
        </div>
      </Card.Body>
    </Card>
  );
};

export default FilterPanel; 