// lib/utils/performanceMonitor.js

/**
 * Enhanced Performance Monitoring Utility
 * Tracks API performance metrics, cache hit rates, and provides comprehensive insights
 */

/**
 * Performance Metrics Types
 */
export const METRIC_TYPES = {
  REQUEST_DURATION: 'REQUEST_DURATION',
  CACHE_HIT: 'CACHE_HIT',
  CACHE_MISS: 'CACHE_MISS',
  ERROR_RATE: 'ERROR_RATE',
  RETRY_COUNT: 'RETRY_COUNT',
  FALLBACK_USAGE: 'FALLBACK_USAGE',
  MEMORY_USAGE: 'MEMORY_USAGE',
  USER_INTERACTION: 'USER_INTERACTION'
};

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.requestTimes = new Map();
    this.slowQueryThreshold = 5000; // 5 seconds
    this.maxMetricsHistory = 1000;

    // Enhanced metrics storage
    this.detailedMetrics = [];
    this.cacheMetrics = {
      hits: 0,
      misses: 0,
      totalRequests: 0
    };
    this.errorMetrics = {
      total: 0,
      byType: new Map(),
      byEndpoint: new Map()
    };
    this.retryMetrics = {
      total: 0,
      byOperation: new Map()
    };
    this.fallbackMetrics = {
      total: 0,
      byOperation: new Map()
    };

    // Performance observers
    this.observers = new Set();

    // Browser performance API support
    this.supportsPerformanceAPI = typeof performance !== 'undefined' &&
                                  typeof performance.mark === 'function';
  }

  /**
   * Start timing a request
   * @param {string} requestId - Unique request identifier
   * @param {Object} metadata - Request metadata
   */
  startTiming(requestId, metadata = {}) {
    this.requestTimes.set(requestId, {
      startTime: Date.now(),
      metadata
    });
  }

  /**
   * End timing a request and record metrics
   * @param {string} requestId - Unique request identifier
   * @param {Object} result - Request result metadata
   */
  endTiming(requestId, result = {}) {
    const timing = this.requestTimes.get(requestId);
    if (!timing) {
      console.warn(`PerformanceMonitor: No timing found for request ${requestId}`);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - timing.startTime;
    
    // Record metric
    const metric = {
      requestId,
      duration,
      startTime: timing.startTime,
      endTime,
      metadata: timing.metadata,
      result,
      timestamp: new Date().toISOString()
    };

    this.recordMetric(metric);
    this.requestTimes.delete(requestId);

    // Log slow queries
    if (duration > this.slowQueryThreshold) {
      console.warn(`PerformanceMonitor: Slow query detected`, {
        requestId,
        duration: `${duration}ms`,
        metadata: timing.metadata
      });
    }

    return metric;
  }

  /**
   * Record a performance metric
   * @param {Object} metric - Performance metric
   */
  recordMetric(metric) {
    const endpoint = metric.metadata.endpoint || 'unknown';

    if (!this.metrics.has(endpoint)) {
      this.metrics.set(endpoint, []);
    }

    const endpointMetrics = this.metrics.get(endpoint);
    endpointMetrics.push(metric);

    // Keep only recent metrics
    if (endpointMetrics.length > this.maxMetricsHistory) {
      endpointMetrics.splice(0, endpointMetrics.length - this.maxMetricsHistory);
    }

    // Store in detailed metrics for enhanced analytics
    this.detailedMetrics.push({
      type: METRIC_TYPES.REQUEST_DURATION,
      timestamp: Date.now(),
      data: metric,
      sessionId: this.getSessionId()
    });

    // Limit detailed metrics
    if (this.detailedMetrics.length > this.maxMetricsHistory) {
      this.detailedMetrics = this.detailedMetrics.slice(-this.maxMetricsHistory);
    }

    // Notify observers
    this.notifyObservers('metric_recorded', metric);
  }

  /**
   * Record cache hit
   * @param {string} key - Cache key
   * @param {Object} metadata - Additional metadata
   */
  recordCacheHit(key, metadata = {}) {
    this.cacheMetrics.hits++;
    this.cacheMetrics.totalRequests++;

    this.detailedMetrics.push({
      type: METRIC_TYPES.CACHE_HIT,
      timestamp: Date.now(),
      data: { key, ...metadata },
      sessionId: this.getSessionId()
    });

    this.notifyObservers('cache_hit', { key, metadata });
  }

  /**
   * Record cache miss
   * @param {string} key - Cache key
   * @param {Object} metadata - Additional metadata
   */
  recordCacheMiss(key, metadata = {}) {
    this.cacheMetrics.misses++;
    this.cacheMetrics.totalRequests++;

    this.detailedMetrics.push({
      type: METRIC_TYPES.CACHE_MISS,
      timestamp: Date.now(),
      data: { key, ...metadata },
      sessionId: this.getSessionId()
    });

    this.notifyObservers('cache_miss', { key, metadata });
  }

  /**
   * Record error
   * @param {Error} error - Error object
   * @param {Object} metadata - Additional metadata
   */
  recordError(error, metadata = {}) {
    this.errorMetrics.total++;

    const errorType = error.type || error.name || 'UnknownError';
    const endpoint = metadata.endpoint || 'unknown';

    // Track by type
    this.errorMetrics.byType.set(errorType,
      (this.errorMetrics.byType.get(errorType) || 0) + 1);

    // Track by endpoint
    this.errorMetrics.byEndpoint.set(endpoint,
      (this.errorMetrics.byEndpoint.get(endpoint) || 0) + 1);

    this.detailedMetrics.push({
      type: METRIC_TYPES.ERROR_RATE,
      timestamp: Date.now(),
      data: {
        errorType,
        errorMessage: error.message,
        endpoint,
        stack: error.stack,
        ...metadata
      },
      sessionId: this.getSessionId()
    });

    this.notifyObservers('error_recorded', { error, metadata });
  }

  /**
   * Record retry attempt
   * @param {string} operation - Operation being retried
   * @param {number} attempt - Attempt number
   * @param {Object} metadata - Additional metadata
   */
  recordRetry(operation, attempt, metadata = {}) {
    this.retryMetrics.total++;
    this.retryMetrics.byOperation.set(operation,
      (this.retryMetrics.byOperation.get(operation) || 0) + 1);

    this.detailedMetrics.push({
      type: METRIC_TYPES.RETRY_COUNT,
      timestamp: Date.now(),
      data: { operation, attempt, ...metadata },
      sessionId: this.getSessionId()
    });

    this.notifyObservers('retry_recorded', { operation, attempt, metadata });
  }

  /**
   * Record fallback usage
   * @param {string} operation - Operation using fallback
   * @param {string} reason - Reason for fallback
   * @param {Object} metadata - Additional metadata
   */
  recordFallback(operation, reason, metadata = {}) {
    this.fallbackMetrics.total++;
    this.fallbackMetrics.byOperation.set(operation,
      (this.fallbackMetrics.byOperation.get(operation) || 0) + 1);

    this.detailedMetrics.push({
      type: METRIC_TYPES.FALLBACK_USAGE,
      timestamp: Date.now(),
      data: { operation, reason, ...metadata },
      sessionId: this.getSessionId()
    });

    this.notifyObservers('fallback_recorded', { operation, reason, metadata });
  }

  /**
   * Get performance statistics for an endpoint
   * @param {string} endpoint - Endpoint name
   * @param {number} timeWindow - Time window in milliseconds (default: 1 hour)
   * @returns {Object} Performance statistics
   */
  getEndpointStats(endpoint, timeWindow = 60 * 60 * 1000) {
    const metrics = this.metrics.get(endpoint) || [];
    const cutoffTime = Date.now() - timeWindow;
    
    const recentMetrics = metrics.filter(m => m.endTime > cutoffTime);
    
    if (recentMetrics.length === 0) {
      return {
        endpoint,
        requestCount: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        slowQueries: 0,
        timeWindow
      };
    }

    const durations = recentMetrics.map(m => m.duration);
    const slowQueries = recentMetrics.filter(m => m.duration > this.slowQueryThreshold);

    return {
      endpoint,
      requestCount: recentMetrics.length,
      avgDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      slowQueries: slowQueries.length,
      slowQueryPercentage: Math.round((slowQueries.length / recentMetrics.length) * 100),
      timeWindow,
      recentRequests: recentMetrics.slice(-10) // Last 10 requests
    };
  }

  /**
   * Get overall performance statistics
   * @param {number} timeWindow - Time window in milliseconds
   * @returns {Object} Overall performance statistics
   */
  getOverallStats(timeWindow = 60 * 60 * 1000) {
    const allEndpoints = Array.from(this.metrics.keys());
    const endpointStats = allEndpoints.map(endpoint => 
      this.getEndpointStats(endpoint, timeWindow)
    );

    const totalRequests = endpointStats.reduce((sum, stats) => sum + stats.requestCount, 0);
    const totalSlowQueries = endpointStats.reduce((sum, stats) => sum + stats.slowQueries, 0);

    return {
      totalEndpoints: allEndpoints.length,
      totalRequests,
      totalSlowQueries,
      slowQueryPercentage: totalRequests > 0 ? Math.round((totalSlowQueries / totalRequests) * 100) : 0,
      endpointStats,
      timeWindow
    };
  }

  /**
   * Get top slow queries
   * @param {number} limit - Number of queries to return
   * @param {number} timeWindow - Time window in milliseconds
   * @returns {Array} Top slow queries
   */
  getTopSlowQueries(limit = 10, timeWindow = 60 * 60 * 1000) {
    const cutoffTime = Date.now() - timeWindow;
    const allMetrics = [];

    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics.filter(m => m.endTime > cutoffTime));
    }

    return allMetrics
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit)
      .map(metric => ({
        requestId: metric.requestId,
        endpoint: metric.metadata.endpoint,
        duration: metric.duration,
        timestamp: metric.timestamp,
        metadata: metric.metadata
      }));
  }

  /**
   * Clear old metrics
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const cutoffTime = Date.now() - maxAge;
    let cleanedCount = 0;

    for (const [endpoint, metrics] of this.metrics.entries()) {
      const originalLength = metrics.length;
      const filteredMetrics = metrics.filter(m => m.endTime > cutoffTime);
      
      if (filteredMetrics.length !== originalLength) {
        this.metrics.set(endpoint, filteredMetrics);
        cleanedCount += originalLength - filteredMetrics.length;
      }
    }

    // Clean up request times for abandoned requests
    for (const [requestId, timing] of this.requestTimes.entries()) {
      if (timing.startTime < cutoffTime) {
        this.requestTimes.delete(requestId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`PerformanceMonitor: Cleaned ${cleanedCount} old metrics`);
    }
  }

  /**
   * Generate performance report
   * @param {number} timeWindow - Time window in milliseconds
   * @returns {Object} Performance report
   */
  generateReport(timeWindow = 60 * 60 * 1000) {
    const overallStats = this.getOverallStats(timeWindow);
    const topSlowQueries = this.getTopSlowQueries(5, timeWindow);

    return {
      reportTime: new Date().toISOString(),
      timeWindow,
      summary: {
        totalEndpoints: overallStats.totalEndpoints,
        totalRequests: overallStats.totalRequests,
        totalSlowQueries: overallStats.totalSlowQueries,
        slowQueryPercentage: overallStats.slowQueryPercentage
      },
      endpointPerformance: overallStats.endpointStats,
      topSlowQueries,
      recommendations: this.generateRecommendations(overallStats)
    };
  }

  /**
   * Generate performance recommendations
   * @param {Object} stats - Performance statistics
   * @returns {Array} Recommendations
   */
  generateRecommendations(stats) {
    const recommendations = [];

    if (stats.slowQueryPercentage > 10) {
      recommendations.push({
        type: 'warning',
        message: `High percentage of slow queries (${stats.slowQueryPercentage}%). Consider optimizing database queries or adding caching.`
      });
    }

    // Cache hit rate recommendations
    const cacheHitRate = this.getCacheHitRate();
    if (cacheHitRate < 50) {
      recommendations.push({
        type: 'warning',
        message: `Low cache hit rate (${cacheHitRate.toFixed(1)}%). Consider increasing cache TTL or improving cache strategies.`
      });
    }

    // Error rate recommendations
    const errorRate = this.getErrorRate();
    if (errorRate > 5) {
      recommendations.push({
        type: 'critical',
        message: `High error rate (${errorRate.toFixed(1)}%). Review error logs and implement better error handling.`
      });
    }

    // Fallback usage recommendations
    const fallbackRate = this.getFallbackRate();
    if (fallbackRate > 10) {
      recommendations.push({
        type: 'warning',
        message: `High fallback usage (${fallbackRate.toFixed(1)}%). Check SAP connection stability.`
      });
    }

    stats.endpointStats.forEach(endpoint => {
      if (endpoint.avgDuration > 3000) {
        recommendations.push({
          type: 'warning',
          message: `Endpoint ${endpoint.endpoint} has high average response time (${endpoint.avgDuration}ms). Consider optimization.`
        });
      }

      if (endpoint.slowQueryPercentage > 20) {
        recommendations.push({
          type: 'critical',
          message: `Endpoint ${endpoint.endpoint} has very high slow query percentage (${endpoint.slowQueryPercentage}%). Immediate attention required.`
        });
      }
    });

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'info',
        message: 'Performance looks good! All endpoints are performing within acceptable limits.'
      });
    }

    return recommendations;
  }

  /**
   * Get cache hit rate percentage
   * @returns {number} Cache hit rate percentage
   */
  getCacheHitRate() {
    if (this.cacheMetrics.totalRequests === 0) return 0;
    return (this.cacheMetrics.hits / this.cacheMetrics.totalRequests) * 100;
  }

  /**
   * Get error rate percentage
   * @returns {number} Error rate percentage
   */
  getErrorRate() {
    const totalRequests = this.getTotalRequests();
    if (totalRequests === 0) return 0;
    return (this.errorMetrics.total / totalRequests) * 100;
  }

  /**
   * Get fallback usage rate percentage
   * @returns {number} Fallback rate percentage
   */
  getFallbackRate() {
    const totalRequests = this.getTotalRequests();
    if (totalRequests === 0) return 0;
    return (this.fallbackMetrics.total / totalRequests) * 100;
  }

  /**
   * Get total number of requests
   * @returns {number} Total requests
   */
  getTotalRequests() {
    let total = 0;
    for (const metrics of this.metrics.values()) {
      total += metrics.length;
    }
    return total;
  }

  /**
   * Get enhanced analytics
   * @param {number} timeWindow - Time window in milliseconds
   * @returns {Object} Enhanced analytics
   */
  getEnhancedAnalytics(timeWindow = 60 * 60 * 1000) {
    const cutoff = Date.now() - timeWindow;
    const recentMetrics = this.detailedMetrics.filter(m => m.timestamp >= cutoff);

    return {
      timeWindow,
      totalMetrics: recentMetrics.length,
      cache: {
        hitRate: this.getCacheHitRate(),
        totalRequests: this.cacheMetrics.totalRequests,
        hits: this.cacheMetrics.hits,
        misses: this.cacheMetrics.misses
      },
      errors: {
        total: this.errorMetrics.total,
        rate: this.getErrorRate(),
        byType: Object.fromEntries(this.errorMetrics.byType),
        byEndpoint: Object.fromEntries(this.errorMetrics.byEndpoint)
      },
      retries: {
        total: this.retryMetrics.total,
        byOperation: Object.fromEntries(this.retryMetrics.byOperation)
      },
      fallbacks: {
        total: this.fallbackMetrics.total,
        rate: this.getFallbackRate(),
        byOperation: Object.fromEntries(this.fallbackMetrics.byOperation)
      },
      trends: this.calculateTrends(recentMetrics)
    };
  }

  /**
   * Calculate performance trends
   * @param {Array} metrics - Metrics array
   * @returns {Array} Trend data
   */
  calculateTrends(metrics) {
    const bucketSize = 60000; // 1 minute buckets
    const buckets = new Map();

    metrics.forEach(metric => {
      const bucketTime = Math.floor(metric.timestamp / bucketSize) * bucketSize;

      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, {
          timestamp: bucketTime,
          requests: 0,
          errors: 0,
          cacheHits: 0,
          cacheMisses: 0,
          retries: 0,
          fallbacks: 0
        });
      }

      const bucket = buckets.get(bucketTime);

      switch (metric.type) {
        case METRIC_TYPES.REQUEST_DURATION:
          bucket.requests++;
          break;
        case METRIC_TYPES.ERROR_RATE:
          bucket.errors++;
          break;
        case METRIC_TYPES.CACHE_HIT:
          bucket.cacheHits++;
          break;
        case METRIC_TYPES.CACHE_MISS:
          bucket.cacheMisses++;
          break;
        case METRIC_TYPES.RETRY_COUNT:
          bucket.retries++;
          break;
        case METRIC_TYPES.FALLBACK_USAGE:
          bucket.fallbacks++;
          break;
      }
    });

    return Array.from(buckets.values())
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get session ID for tracking
   * @returns {string} Session ID
   */
  getSessionId() {
    if (!this.sessionId) {
      this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }
    return this.sessionId;
  }

  /**
   * Add performance observer
   * @param {Function} observer - Observer function
   */
  addObserver(observer) {
    this.observers.add(observer);
  }

  /**
   * Remove performance observer
   * @param {Function} observer - Observer function
   */
  removeObserver(observer) {
    this.observers.delete(observer);
  }

  /**
   * Notify observers
   * @param {string} event - Event type
   * @param {Object} data - Event data
   */
  notifyObservers(event, data) {
    this.observers.forEach(observer => {
      try {
        observer(event, data);
      } catch (error) {
        console.error('Error in performance observer:', error);
      }
    });
  }

  /**
   * Reset all metrics
   */
  resetMetrics() {
    this.metrics.clear();
    this.detailedMetrics = [];
    this.cacheMetrics = { hits: 0, misses: 0, totalRequests: 0 };
    this.errorMetrics = { total: 0, byType: new Map(), byEndpoint: new Map() };
    this.retryMetrics = { total: 0, byOperation: new Map() };
    this.fallbackMetrics = { total: 0, byOperation: new Map() };
  }

  /**
   * Export metrics for analysis
   * @returns {Object} Exported metrics
   */
  exportMetrics() {
    return {
      basic: this.generateReport(),
      enhanced: this.getEnhancedAnalytics(),
      raw: this.detailedMetrics
    };
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Clean up old metrics every hour
setInterval(() => {
  performanceMonitor.cleanup();
}, 60 * 60 * 1000);

export default performanceMonitor;
