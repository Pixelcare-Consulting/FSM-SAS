import React from 'react';
import { Card, Form, Button, Row, Col } from 'react-bootstrap';

const FilterPanel = ({ filters, setFilters, applyFilters, resetFilters }) => {
  return (
    <Card className="shadow-sm mb-4">
      <Card.Header className="border-bottom">
        <h5 className="mb-0">Filter Locations</h5>
      </Card.Header>
      <Card.Body>
        <Form>
          <Row>
            <Col md={4} className="mb-3">
              <Form.Group>
                <Form.Label>Customer Name</Form.Label>
                <Form.Control
                  type="text"
                  value={filters.customerName}
                  onChange={(e) => setFilters({ ...filters, customerName: e.target.value })}
                  placeholder="Enter customer name"
                />
              </Form.Group>
            </Col>
            <Col md={4} className="mb-3">
              <Form.Group>
                <Form.Label>Email</Form.Label>
                <Form.Control
                  type="email"
                  value={filters.email}
                  onChange={(e) => setFilters({ ...filters, email: e.target.value })}
                  placeholder="Enter email"
                />
              </Form.Group>
            </Col>
            <Col md={4} className="mb-3">
              <Form.Group>
                <Form.Label>Phone</Form.Label>
                <Form.Control
                  type="text"
                  value={filters.phone}
                  onChange={(e) => setFilters({ ...filters, phone: e.target.value })}
                  placeholder="Enter phone number"
                />
              </Form.Group>
            </Col>
            <Col md={4} className="mb-3">
              <Form.Group>
                <Form.Label>Country</Form.Label>
                <Form.Control
                  type="text"
                  value={filters.country}
                  onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                  placeholder="Enter country"
                />
              </Form.Group>
            </Col>
            <Col md={4} className="mb-3">
              <Form.Group>
                <Form.Label>Address</Form.Label>
                <Form.Control
                  type="text"
                  value={filters.address}
                  onChange={(e) => setFilters({ ...filters, address: e.target.value })}
                  placeholder="Enter address"
                />
              </Form.Group>
            </Col>
            <Col md={4} className="mb-3">
              <Form.Group>
                <Form.Label>Postal Code</Form.Label>
                <Form.Control
                  type="text"
                  value={filters.postalCode}
                  onChange={(e) => setFilters({ ...filters, postalCode: e.target.value })}
                  placeholder="Enter postal code"
                />
              </Form.Group>
            </Col>
          </Row>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="light" onClick={resetFilters}>Reset</Button>
            <Button variant="primary" onClick={applyFilters}>Apply Filters</Button>
          </div>
        </Form>
      </Card.Body>
    </Card>
  );
};

export default FilterPanel; 