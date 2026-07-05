// utils/supabaseCache.js (renamed from firebaseCache.js)
// Generic caching utility for Supabase data
import { useState, useEffect } from 'react';

const CACHE_DURATION = {
  JOBS: 2 * 60 * 1000,      // 2 minutes for jobs
  WORKERS: 5 * 60 * 1000,   // 5 minutes for workers
  COMPANY: 30 * 60 * 1000,  // 30 minutes for company info
  SETTINGS: 15 * 60 * 1000  // 15 minutes for settings
};

const cache = new Map();

export const useFirebaseCache = (key, fetchFunction, options = {}) => {
  const { 
    duration = CACHE_DURATION.JOBS,
    dependencies = [], 
    filter = null,
    page = 1,
    pageSize = 10
  } = options;

  const cacheKey = filter ? `${key}-${filter}-${page}-${pageSize}` : key;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Check cache
        const cachedData = cache.get(cacheKey);
        if (cachedData && Date.now() - cachedData.timestamp < duration) {
          setData(cachedData.data);
          setTotalItems(cachedData.totalItems);
          setLoading(false);
          return;
        }

        // Fetch new data
        const { data: newData, totalItems: total } = await fetchFunction({
          filter,
          page,
          pageSize
        });
        
        // Update cache
        cache.set(cacheKey, {
          data: newData,
          totalItems: total,
          timestamp: Date.now()
        });

        setData(newData);
        setTotalItems(total);
      } catch (err) {
        setError(err);
        console.error(`Error fetching ${key}:`, err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [...dependencies, filter, page, pageSize]);

  return { data, loading, error, totalItems };
};

export const clearCache = (key) => {
  if (key) {
    // Clear all cached entries that start with the key
    for (const cacheKey of cache.keys()) {
      if (cacheKey.startsWith(key)) {
        cache.delete(cacheKey);
      }
    }
  } else {
    cache.clear();
  }
};