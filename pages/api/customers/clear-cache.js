// pages/api/customers/clear-cache.js
import customerCache from '../../../lib/utils/customerCache.js';

/**
 * Clear Customer Cache API Endpoint
 * POST /api/customers/clear-cache - Clear all customer cache
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get cache stats before clearing
    const statsBefore = customerCache.getStats();
    
    // Force clear all cache and reset
    const resetResult = customerCache.forceReset();
    
    // Get stats after clearing
    const statsAfter = customerCache.getStats();
    
    console.log('Customer cache cleared:', {
      entriesCleared: resetResult.entriesCleared,
      sizeBefore: statsBefore.totalSizeBytes,
      sizeAfter: statsAfter.totalSizeBytes,
      message: resetResult.message
    });

    return res.status(200).json({
      success: true,
      message: 'Customer cache cleared and reset successfully',
      cleared: {
        entries: resetResult.entriesCleared,
        sizeBytes: statsBefore.totalSizeBytes,
        resetMessage: resetResult.message
      }
    });
    
  } catch (error) {
    console.error('Error clearing customer cache:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to clear cache' 
    });
  }
}
