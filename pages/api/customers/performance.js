// pages/api/customers/performance.js
import performanceMonitor from '../../../lib/utils/performanceMonitor.js';
import customerCache from '../../../lib/utils/customerCache.js';
import { 
  sendSuccess, 
  sendError, 
  sendUnauthorized, 
  sendMethodNotAllowed,
  asyncHandler
} from '../../../lib/utils/apiResponse.js';

/**
 * Customer API Performance Monitoring Endpoint
 * 
 * GET /api/customers/performance - Get performance metrics and cache statistics
 * DELETE /api/customers/performance - Clear performance metrics and cache
 * 
 * Query Parameters for GET:
 * - timeWindow: Time window in minutes (default: 60)
 * - endpoint: Specific endpoint to get stats for
 * - format: Response format (summary/detailed, default: summary)
 */
const handler = asyncHandler(async (req, res) => {
  // Basic authentication check (you might want to add admin role check)
  const sessionCookies = (() => {
    const b1session = req.cookies.B1SESSION;
    const routeid = req.cookies.ROUTEID;
    const sessionExpiry = req.cookies.B1SESSION_EXPIRY;

    if (!b1session || !routeid) return null;
    if (sessionExpiry && Date.now() >= new Date(sessionExpiry).getTime()) return null;
    
    return { b1session, routeid };
  })();

  if (!sessionCookies) {
    return sendUnauthorized(res, 'Session is missing or expired');
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGetPerformance(req, res);
      
      case 'DELETE':
        return await handleClearPerformance(req, res);
      
      default:
        return sendMethodNotAllowed(res, ['GET', 'DELETE']);
    }

  } catch (error) {
    console.error('Error in performance monitoring API:', {
      message: error.message,
      stack: error.stack,
      method: req.method,
      query: req.query,
      timestamp: new Date().toISOString()
    });

    return sendError(res, 'Failed to process performance request', 500);
  }
});

/**
 * Handle GET request for performance metrics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Response
 */
async function handleGetPerformance(req, res) {
  const timeWindowMinutes = parseInt(req.query.timeWindow) || 60;
  const timeWindow = timeWindowMinutes * 60 * 1000; // Convert to milliseconds
  const endpoint = req.query.endpoint;
  const format = req.query.format === 'detailed' ? 'detailed' : 'summary';

  try {
    let performanceData;

    if (endpoint) {
      // Get specific endpoint stats
      performanceData = {
        endpoint: performanceMonitor.getEndpointStats(endpoint, timeWindow),
        timeWindow: timeWindowMinutes
      };
    } else {
      // Get overall stats
      if (format === 'detailed') {
        performanceData = {
          overall: performanceMonitor.getOverallStats(timeWindow),
          topSlowQueries: performanceMonitor.getTopSlowQueries(10, timeWindow),
          report: performanceMonitor.generateReport(timeWindow)
        };
      } else {
        performanceData = performanceMonitor.getOverallStats(timeWindow);
      }
    }

    // Get cache statistics
    const cacheStats = customerCache.getStats();

    const responseData = {
      performance: performanceData,
      cache: cacheStats,
      meta: {
        timeWindow: timeWindowMinutes,
        format,
        endpoint: endpoint || 'all',
        requestTime: new Date().toISOString()
      }
    };

    return sendSuccess(res, responseData, 'Performance metrics retrieved successfully');

  } catch (error) {
    console.error('Error getting performance metrics:', error);
    throw error;
  }
}

/**
 * Handle DELETE request to clear performance data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Response
 */
async function handleClearPerformance(req, res) {
  const clearCache = req.query.clearCache === 'true';
  const clearMetrics = req.query.clearMetrics !== 'false'; // Default to true

  try {
    let clearedItems = [];

    if (clearMetrics) {
      // Clear performance metrics
      const oldStats = performanceMonitor.getOverallStats();
      performanceMonitor.metrics.clear();
      performanceMonitor.requestTimes.clear();
      
      clearedItems.push({
        type: 'performance_metrics',
        count: oldStats.totalRequests
      });
    }

    if (clearCache) {
      // Clear customer cache
      const oldCacheStats = customerCache.getStats();
      customerCache.clear();
      
      clearedItems.push({
        type: 'cache_entries',
        count: oldCacheStats.totalEntries
      });
    }

    const responseData = {
      cleared: clearedItems,
      meta: {
        clearCache,
        clearMetrics,
        requestTime: new Date().toISOString()
      }
    };

    return sendSuccess(res, responseData, 'Performance data cleared successfully');

  } catch (error) {
    console.error('Error clearing performance data:', error);
    throw error;
  }
}

export default handler;
