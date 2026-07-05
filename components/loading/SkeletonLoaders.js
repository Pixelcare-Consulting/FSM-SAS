import React from 'react';
import { Card, Row, Col, Placeholder } from 'react-bootstrap';

/**
 * Enhanced Skeleton Loaders for SAS FSM Portal
 * Provides contextual loading states for different data types
 */

// Base skeleton styles
const skeletonStyles = {
  skeleton: {
    background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
    backgroundSize: '200% 100%',
    animation: 'loading 1.5s infinite',
    borderRadius: '4px'
  },
  '@keyframes loading': {
    '0%': { backgroundPosition: '200% 0' },
    '100%': { backgroundPosition: '-200% 0' }
  }
};

// Customer List Skeleton Loader
export const CustomerListSkeleton = ({ rows = 5 }) => {
  return (
    <div className="customer-list-skeleton">
      <style jsx>{`
        .skeleton-row {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #f0f0f0;
          gap: 16px;
        }
        .skeleton-cell {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 4px;
          height: 20px;
        }
        .skeleton-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          flex-shrink: 0;
        }
        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton-row">
          <div className="skeleton-avatar"></div>
          <div className="skeleton-cell" style={{ width: '150px' }}></div>
          <div className="skeleton-cell" style={{ width: '200px' }}></div>
          <div className="skeleton-cell" style={{ width: '120px' }}></div>
          <div className="skeleton-cell" style={{ width: '100px' }}></div>
          <div className="skeleton-cell" style={{ width: '80px' }}></div>
        </div>
      ))}
    </div>
  );
};

// Customer Details Skeleton
export const CustomerDetailsSkeleton = () => {
  return (
    <div className="customer-details-skeleton">
      <style jsx>{`
        .skeleton-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
        }
        .skeleton-avatar-large {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
        }
        .skeleton-text {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 4px;
          height: 20px;
          margin-bottom: 8px;
        }
        .skeleton-card {
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }
        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div className="skeleton-header">
        <div className="skeleton-avatar-large"></div>
        <div style={{ flex: 1 }}>
          <div className="skeleton-text" style={{ width: '60%', height: '28px' }}></div>
          <div className="skeleton-text" style={{ width: '40%', height: '20px' }}></div>
        </div>
      </div>

      <Row>
        <Col md={6}>
          <div className="skeleton-card">
            <div className="skeleton-text" style={{ width: '30%', height: '16px', marginBottom: '12px' }}></div>
            <div className="skeleton-text" style={{ width: '80%' }}></div>
            <div className="skeleton-text" style={{ width: '60%' }}></div>
            <div className="skeleton-text" style={{ width: '70%' }}></div>
          </div>
        </Col>
        <Col md={6}>
          <div className="skeleton-card">
            <div className="skeleton-text" style={{ width: '30%', height: '16px', marginBottom: '12px' }}></div>
            <div className="skeleton-text" style={{ width: '90%' }}></div>
            <div className="skeleton-text" style={{ width: '50%' }}></div>
            <div className="skeleton-text" style={{ width: '75%' }}></div>
          </div>
        </Col>
      </Row>
    </div>
  );
};

// Service Calls Skeleton
export const ServiceCallsSkeleton = ({ rows = 3 }) => {
  return (
    <div className="service-calls-skeleton">
      <style jsx>{`
        .skeleton-service-call {
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
        }
        .skeleton-text {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 4px;
          height: 16px;
          margin-bottom: 8px;
        }
        .skeleton-badge {
          width: 60px;
          height: 24px;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 12px;
          display: inline-block;
        }
        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton-service-call">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div className="skeleton-text" style={{ width: '200px', height: '20px' }}></div>
            <div className="skeleton-badge"></div>
          </div>
          <div className="skeleton-text" style={{ width: '100%' }}></div>
          <div className="skeleton-text" style={{ width: '80%' }}></div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
            <div className="skeleton-text" style={{ width: '100px', height: '14px' }}></div>
            <div className="skeleton-text" style={{ width: '120px', height: '14px' }}></div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Sales Orders Skeleton
export const SalesOrdersSkeleton = ({ rows = 3 }) => {
  return (
    <div className="sales-orders-skeleton">
      <style jsx>{`
        .skeleton-table {
          width: 100%;
          border-collapse: collapse;
        }
        .skeleton-table th,
        .skeleton-table td {
          padding: 12px;
          border-bottom: 1px solid #f0f0f0;
        }
        .skeleton-text {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 4px;
          height: 16px;
        }
        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <table className="skeleton-table">
        <thead>
          <tr>
            <th><div className="skeleton-text" style={{ width: '80px' }}></div></th>
            <th><div className="skeleton-text" style={{ width: '100px' }}></div></th>
            <th><div className="skeleton-text" style={{ width: '80px' }}></div></th>
            <th><div className="skeleton-text" style={{ width: '120px' }}></div></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, index) => (
            <tr key={index}>
              <td><div className="skeleton-text" style={{ width: '60px' }}></div></td>
              <td><div className="skeleton-text" style={{ width: '80px' }}></div></td>
              <td><div className="skeleton-text" style={{ width: '70px' }}></div></td>
              <td><div className="skeleton-text" style={{ width: '100px' }}></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Generic Card Skeleton
export const CardSkeleton = ({ height = '200px' }) => {
  return (
    <Card style={{ height }}>
      <Card.Body>
        <Placeholder as={Card.Title} animation="glow">
          <Placeholder xs={6} />
        </Placeholder>
        <Placeholder as={Card.Text} animation="glow">
          <Placeholder xs={7} /> <Placeholder xs={4} /> <Placeholder xs={4} />{' '}
          <Placeholder xs={6} /> <Placeholder xs={8} />
        </Placeholder>
        <Placeholder.Button variant="primary" xs={6} />
      </Card.Body>
    </Card>
  );
};

// Equipment List Skeleton
export const EquipmentListSkeleton = ({ rows = 4 }) => {
  return (
    <div className="equipment-list-skeleton">
      <style jsx>{`
        .skeleton-equipment-item {
          display: flex;
          align-items: center;
          padding: 12px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          margin-bottom: 8px;
          gap: 12px;
        }
        .skeleton-icon {
          width: 32px;
          height: 32px;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .skeleton-text {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 4px;
          height: 16px;
          margin-bottom: 4px;
        }
        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton-equipment-item">
          <div className="skeleton-icon"></div>
          <div style={{ flex: 1 }}>
            <div className="skeleton-text" style={{ width: '70%' }}></div>
            <div className="skeleton-text" style={{ width: '50%', height: '14px' }}></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default {
  CustomerListSkeleton,
  CustomerDetailsSkeleton,
  ServiceCallsSkeleton,
  SalesOrdersSkeleton,
  CardSkeleton,
  EquipmentListSkeleton
};
