/**
 * React Hooks for Pagination and Lazy Loading
 * Provides easy-to-use hooks for implementing pagination and lazy loading in React components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { PaginationHelper, LazyLoadingManager } from '../lib/utils/paginationUtils';

/**
 * Pagination Hook
 * @param {Object} options - Pagination options
 * @returns {Object} Pagination state and methods
 */
export function usePagination(options = {}) {
  const {
    initialPage = 1,
    pageSize = 25,
    totalCount = 0,
    onPageChange = null,
    prefetchPages = 1
  } = options;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [isLoading, setIsLoading] = useState(false);
  const paginationHelper = useRef(new PaginationHelper({ pageSize, prefetchPages }));

  // Calculate pagination metadata
  const pagination = paginationHelper.current.calculatePagination(totalCount, currentPage);

  // Handle page change
  const handlePageChange = useCallback(async (newPage) => {
    if (newPage === currentPage || newPage < 1 || newPage > pagination.totalPages) {
      return;
    }

    setIsLoading(true);
    setCurrentPage(newPage);

    try {
      if (onPageChange) {
        await onPageChange(newPage);
      }
    } catch (error) {
      console.error('Error changing page:', error);
      // Revert page change on error
      setCurrentPage(currentPage);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pagination.totalPages, onPageChange]);

  // Navigation methods
  const goToFirstPage = useCallback(() => handlePageChange(1), [handlePageChange]);
  const goToLastPage = useCallback(() => handlePageChange(pagination.totalPages), [handlePageChange, pagination.totalPages]);
  const goToNextPage = useCallback(() => handlePageChange(currentPage + 1), [handlePageChange, currentPage]);
  const goToPreviousPage = useCallback(() => handlePageChange(currentPage - 1), [handlePageChange, currentPage]);

  // Get page numbers for UI
  const pageNumbers = paginationHelper.current.getPageNumbers(pagination.totalPages, currentPage);

  // Get prefetch pages
  const prefetchPages = paginationHelper.current.getPrefetchPages(currentPage, pagination.totalPages);

  return {
    // State
    currentPage,
    isLoading,
    pagination,
    pageNumbers,
    prefetchPages,

    // Methods
    goToPage: handlePageChange,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPreviousPage,

    // Utilities
    canGoNext: pagination.hasNext,
    canGoPrevious: pagination.hasPrevious,
    isFirstPage: pagination.isFirstPage,
    isLastPage: pagination.isLastPage
  };
}

/**
 * Lazy Loading Hook
 * @param {Function} loadFunction - Function to load data
 * @param {Object} options - Lazy loading options
 * @returns {Object} Lazy loading state and methods
 */
export function useLazyLoading(loadFunction, options = {}) {
  const {
    batchSize = 10,
    retryAttempts = 3,
    retryDelay = 1000,
    autoLoad = true
  } = options;

  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadedPages, setLoadedPages] = useState(new Set());

  const lazyManager = useRef(new LazyLoadingManager({
    batchSize,
    retryAttempts,
    retryDelay
  }));

  // Set up observers
  useEffect(() => {
    const manager = lazyManager.current;

    const observer = (event, data) => {
      switch (event) {
        case 'loading_start':
          setIsLoading(true);
          setError(null);
          break;
        case 'loading_success':
          setData(prevData => {
            const newData = [...prevData];
            // Insert data at correct position based on page
            const startIndex = (data.page - 1) * batchSize;
            data.data.forEach((item, index) => {
              newData[startIndex + index] = item;
            });
            return newData;
          });
          setLoadedPages(prev => new Set([...prev, data.page]));
          setIsLoading(false);
          break;
        case 'loading_error':
          setError(data.error);
          setIsLoading(false);
          break;
        case 'cache_hit':
          // Handle cache hit if needed
          break;
      }
    };

    manager.addObserver(observer);

    return () => {
      manager.removeObserver(observer);
    };
  }, [batchSize]);

  // Load more data
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    try {
      const nextPage = Math.floor(data.length / batchSize) + 1;
      const result = await lazyManager.current.loadPage(nextPage, loadFunction);
      
      if (!result || result.length === 0) {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more data:', error);
      setError(error);
    }
  }, [isLoading, hasMore, data.length, batchSize, loadFunction]);

  // Load specific page
  const loadPage = useCallback(async (page) => {
    try {
      await lazyManager.current.loadPage(page, loadFunction);
    } catch (error) {
      console.error(`Error loading page ${page}:`, error);
      setError(error);
    }
  }, [loadFunction]);

  // Reset data
  const reset = useCallback(() => {
    setData([]);
    setLoadedPages(new Set());
    setHasMore(true);
    setError(null);
    lazyManager.current.clearCache();
  }, []);

  // Auto-load initial data
  useEffect(() => {
    if (autoLoad && data.length === 0 && !isLoading) {
      loadMore();
    }
  }, [autoLoad, data.length, isLoading, loadMore]);

  return {
    // State
    data,
    isLoading,
    error,
    hasMore,
    loadedPages: Array.from(loadedPages),

    // Methods
    loadMore,
    loadPage,
    reset,

    // Utilities
    totalLoaded: data.length,
    stats: lazyManager.current.getStats()
  };
}

/**
 * Infinite Scroll Hook
 * @param {Function} loadFunction - Function to load data
 * @param {Object} options - Infinite scroll options
 * @returns {Object} Infinite scroll state and methods
 */
export function useInfiniteScroll(loadFunction, options = {}) {
  const {
    threshold = 0.8,
    rootMargin = '100px',
    ...lazyOptions
  } = options;

  const lazyLoading = useLazyLoading(loadFunction, lazyOptions);
  const [isFetching, setIsFetching] = useState(false);
  const sentinelRef = useRef(null);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && lazyLoading.hasMore && !lazyLoading.isLoading && !isFetching) {
          setIsFetching(true);
          lazyLoading.loadMore().finally(() => {
            setIsFetching(false);
          });
        }
      },
      {
        rootMargin,
        threshold
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.unobserve(sentinel);
    };
  }, [lazyLoading.hasMore, lazyLoading.isLoading, isFetching, lazyLoading.loadMore, rootMargin, threshold]);

  return {
    ...lazyLoading,
    isFetching,
    sentinelRef
  };
}

/**
 * Virtual Scroll Hook
 * @param {Array} items - Array of items to virtualize
 * @param {Object} options - Virtual scroll options
 * @returns {Object} Virtual scroll state and methods
 */
export function useVirtualScroll(items, options = {}) {
  const {
    itemHeight = 50,
    containerHeight = 400,
    overscan = 5
  } = options;

  const [scrollTop, setScrollTop] = useState(0);
  const [containerRef, setContainerRef] = useState(null);

  // Calculate visible range
  const visibleItemCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(startIndex + visibleItemCount, items.length - 1);

  // Add overscan
  const overscanStart = Math.max(0, startIndex - overscan);
  const overscanEnd = Math.min(items.length - 1, endIndex + overscan);

  const visibleItems = items.slice(overscanStart, overscanEnd + 1);
  const totalHeight = items.length * itemHeight;
  const offsetY = overscanStart * itemHeight;

  // Handle scroll
  const handleScroll = useCallback((event) => {
    setScrollTop(event.target.scrollTop);
  }, []);

  // Container ref callback
  const setRef = useCallback((node) => {
    if (node) {
      setContainerRef(node);
      node.addEventListener('scroll', handleScroll);
    } else if (containerRef) {
      containerRef.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll, containerRef]);

  return {
    // Visible items
    visibleItems,
    startIndex: overscanStart,
    endIndex: overscanEnd,

    // Styling
    totalHeight,
    offsetY,

    // Refs
    containerRef: setRef,

    // State
    scrollTop,
    visibleRange: {
      start: startIndex,
      end: endIndex
    }
  };
}

export default {
  usePagination,
  useLazyLoading,
  useInfiniteScroll,
  useVirtualScroll
};
