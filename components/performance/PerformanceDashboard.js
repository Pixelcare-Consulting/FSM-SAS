/**
 * Performance Dashboard Component
 * Displays comprehensive performance metrics and analytics
 */

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Badge, ProgressBar, Alert, Button, Table } from 'react-bootstrap';
import performanceMonitor from '../../lib/utils/performanceMonitor';
import enhancedDataService from '../../lib/services/enhancedDataService';

/**
 * Performance Dashboard Component
 */
export const PerformanceDashboard = ({ refreshInterval = 30000 }) => {
  const [metrics, setMetrics] = useState(null);
  const [enhancedMetrics, setEnhancedMetrics] = useState(null);
  const [serviceMetrics, setServiceMetrics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Fetch all metrics
  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const [basic, enhanced, service] = await Promise.all([
        performanceMonitor.generateReport(),
        performanceMonitor.getEnhancedAnalytics(),
        enhancedDataService.getMetrics()
      ]);

      setMetrics(basic);
      setEnhancedMetrics(enhanced);
      setServiceMetrics(service);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh metrics
  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  if (isLoading || !metrics || !enhancedMetrics || !serviceMetrics) {
    return (
      <Card>
        <Card.Body className="text-center py-5">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">Loading performance metrics...</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="performance-dashboard">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="mb-0">Performance Dashboard</h4>
        <div className="d-flex align-items-center gap-3">
          <small className="text-muted">
            Last updated: {lastUpdate?.toLocaleTimeString()}
          </small>
          <Button variant="outline-primary" size="sm" onClick={fetchMetrics}>
            <i className="fas fa-sync-alt me-2"></i>
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <Row className="mb-4">
        <Col md={3}>
          <MetricCard
            title="Cache Hit Rate"
            value={`${enhancedMetrics.cache.hitRate.toFixed(1)}%`}
            icon="fas fa-memory"
            variant={enhancedMetrics.cache.hitRate >= 70 ? 'success' : enhancedMetrics.cache.hitRate >= 50 ? 'warning' : 'danger'}
            subtitle={`${enhancedMetrics.cache.hits}/${enhancedMetrics.cache.totalRequests} requests`}
          />
        </Col>
        <Col md={3}>
          <MetricCard
            title="Error Rate"
            value={`${enhancedMetrics.errors.rate.toFixed(1)}%`}
            icon="fas fa-exclamation-triangle"
            variant={enhancedMetrics.errors.rate <= 2 ? 'success' : enhancedMetrics.errors.rate <= 5 ? 'warning' : 'danger'}
            subtitle={`${enhancedMetrics.errors.total} total errors`}
          />
        </Col>
        <Col md={3}>
          <MetricCard
            title="Avg Response Time"
            value={`${metrics.summary.totalRequests > 0 ? Math.round(metrics.endpointPerformance.reduce((sum, ep) => sum + ep.avgDuration, 0) / metrics.endpointPerformance.length) : 0}ms`}
            icon="fas fa-clock"
            variant="info"
            subtitle={`${metrics.summary.totalRequests} total requests`}
          />
        </Col>
        <Col md={3}>
          <MetricCard
            title="SAP Connection"
            value={serviceMetrics.authentication.sapConnectionStatus}
            icon="fas fa-database"
            variant={serviceMetrics.authentication.sapConnectionStatus === 'connected' ? 'success' : 'warning'}
            subtitle={serviceMetrics.authentication.isAuthenticated ? 'Authenticated' : 'Not authenticated'}
          />
        </Col>
      </Row>

      {/* Recommendations */}
      {metrics.recommendations.length > 0 && (
        <Row className="mb-4">
          <Col>
            <Card>
              <Card.Header>
                <h6 className="mb-0">
                  <i className="fas fa-lightbulb me-2"></i>
                  Performance Recommendations
                </h6>
              </Card.Header>
              <Card.Body>
                {metrics.recommendations.map((rec, index) => (
                  <Alert 
                    key={index} 
                    variant={rec.type === 'critical' ? 'danger' : rec.type === 'warning' ? 'warning' : 'info'}
                    className={index < metrics.recommendations.length - 1 ? 'mb-2' : 'mb-0'}
                  >
                    {rec.message}
                  </Alert>
                ))}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {/* Detailed Metrics */}
      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <h6 className="mb-0">Endpoint Performance</h6>
            </Card.Header>
            <Card.Body>
              <Table size="sm" responsive>
                <thead>
                  <tr>
                    <th>Endpoint</th>
                    <th>Requests</th>
                    <th>Avg Time</th>
                    <th>Slow Queries</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.endpointPerformance.map((endpoint, index) => (
                    <tr key={index}>
                      <td>
                        <small>{endpoint.endpoint}</small>
                      </td>
                      <td>{endpoint.requestCount}</td>
                      <td>
                        <Badge variant={endpoint.avgDuration > 3000 ? 'danger' : endpoint.avgDuration > 1000 ? 'warning' : 'success'}>
                          {endpoint.avgDuration}ms
                        </Badge>
                      </td>
                      <td>
                        {endpoint.slowQueries > 0 && (
                          <Badge variant="warning">
                            {endpoint.slowQueryPercentage}%
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <h6 className="mb-0">Error Analysis</h6>
            </Card.Header>
            <Card.Body>
              {Object.keys(enhancedMetrics.errors.byType).length > 0 ? (
                <Table size="sm" responsive>
                  <thead>
                    <tr>
                      <th>Error Type</th>
                      <th>Count</th>
                      <th>Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(enhancedMetrics.errors.byType).map(([type, count]) => (
                      <tr key={type}>
                        <td><small>{type}</small></td>
                        <td>{count}</td>
                        <td>
                          <Badge variant="danger">
                            {((count / enhancedMetrics.errors.total) * 100).toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <div className="text-center text-muted py-3">
                  <i className="fas fa-check-circle fa-2x mb-2"></i>
                  <p>No errors recorded</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Service Metrics */}
      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <h6 className="mb-0">Cache Performance</h6>
            </Card.Header>
            <Card.Body>
              <div className="mb-3">
                <div className="d-flex justify-content-between mb-1">
                  <small>Hit Rate</small>
                  <small>{enhancedMetrics.cache.hitRate.toFixed(1)}%</small>
                </div>
                <ProgressBar 
                  now={enhancedMetrics.cache.hitRate} 
                  variant={enhancedMetrics.cache.hitRate >= 70 ? 'success' : enhancedMetrics.cache.hitRate >= 50 ? 'warning' : 'danger'}
                />
              </div>
              
              <div className="row text-center">
                <div className="col">
                  <div className="h5 mb-0 text-success">{enhancedMetrics.cache.hits}</div>
                  <small className="text-muted">Hits</small>
                </div>
                <div className="col">
                  <div className="h5 mb-0 text-danger">{enhancedMetrics.cache.misses}</div>
                  <small className="text-muted">Misses</small>
                </div>
                <div className="col">
                  <div className="h5 mb-0 text-info">{enhancedMetrics.cache.totalRequests}</div>
                  <small className="text-muted">Total</small>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <h6 className="mb-0">Reliability Metrics</h6>
            </Card.Header>
            <Card.Body>
              <div className="mb-3">
                <div className="d-flex justify-content-between">
                  <span>Success Rate</span>
                  <Badge variant="success">{serviceMetrics.performance.successRate.toFixed(1)}%</Badge>
                </div>
              </div>
              
              <div className="mb-3">
                <div className="d-flex justify-content-between">
                  <span>Fallback Rate</span>
                  <Badge variant={enhancedMetrics.fallbacks.rate <= 5 ? 'success' : 'warning'}>
                    {enhancedMetrics.fallbacks.rate.toFixed(1)}%
                  </Badge>
                </div>
              </div>
              
              <div className="mb-3">
                <div className="d-flex justify-content-between">
                  <span>Retry Count</span>
                  <Badge variant="info">{enhancedMetrics.retries.total}</Badge>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

/**
 * Metric Card Component
 */
const MetricCard = ({ title, value, icon, variant = 'primary', subtitle }) => (
  <Card className="h-100">
    <Card.Body className="text-center">
      <div className={`text-${variant} mb-2`}>
        <i className={`${icon} fa-2x`}></i>
      </div>
      <h5 className="mb-1">{value}</h5>
      <h6 className="text-muted mb-0">{title}</h6>
      {subtitle && <small className="text-muted">{subtitle}</small>}
    </Card.Body>
  </Card>
);

export default PerformanceDashboard;
