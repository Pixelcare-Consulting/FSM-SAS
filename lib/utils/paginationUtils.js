/**
 * Pagination and Lazy Loading Utilities for SAS FSM Portal
 * Provides efficient data loading strategies for large datasets
 */

/**
 * Pagination Configuration
 */
export const PAGINATION_DEFAULTS = {
  pageSize: 25,
  maxPageSize: 100,
  minPageSize: 5,
  prefetchPages: 1, // Number of pages to prefetch
  virtualScrollThreshold: 1000 // Items threshold for virtual scrolling
};

/**
 * Pagination Helper Class
 */
export class PaginationHelper {
  constructor(options = {}) {
    this.pageSize = options.pageSize || PAGINATION_DEFAULTS.pageSize;
    this.maxPageSize = options.maxPageSize || PAGINATION_DEFAULTS.maxPageSize;
    this.minPageSize = options.minPageSize || PAGINATION_DEFAULTS.minPageSize;
    this.prefetchPages = options.prefetchPages || PAGINATION_DEFAULTS.prefetchPages;
    
    // Ensure page size is within bounds
    this.pageSize = Math.max(this.minPageSize, Math.min(this.maxPageSize, this.pageSize));
  }

  /**
   * Calculate pagination metadata
   * @param {number} totalCount - Total number of items
   * @param {number} currentPage - Current page (1-based)
   * @returns {Object} Pagination metadata
   */
  calculatePagination(totalCount, currentPage = 1) {
    const totalPages = Math.ceil(totalCount / this.pageSize);
    const hasNext = currentPage < totalPages;
    const hasPrevious = currentPage > 1;
    const startIndex = (currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize - 1, totalCount - 1);

    return {
      currentPage,
      pageSize: this.pageSize,
      totalCount,
      totalPages,
      hasNext,
      hasPrevious,
      startIndex,
      endIndex,
      itemsOnPage: endIndex - startIndex + 1,
      isFirstPage: currentPage === 1,
      isLastPage: currentPage === totalPages,
      nextPage: hasNext ? currentPage + 1 : null,
      previousPage: hasPrevious ? currentPage - 1 : null
    };
  }

  /**
   * Get page numbers for pagination UI
   * @param {number} totalPages - Total number of pages
   * @param {number} currentPage - Current page
   * @param {number} maxVisible - Maximum visible page numbers
   * @returns {Array} Array of page numbers to display
   */
  getPageNumbers(totalPages, currentPage, maxVisible = 7) {
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxVisible - 1);

    // Adjust start if we're near the end
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    const pages = [];
    
    // Add first page and ellipsis if needed
    if (start > 1) {
      pages.push(1);
      if (start > 2) {
        pages.push('...');
      }
    }

    // Add visible pages
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    // Add ellipsis and last page if needed
    if (end < totalPages) {
      if (end < totalPages - 1) {
        pages.push('...');
      }
      pages.push(totalPages);
    }

    return pages;
  }

  /**
   * Calculate which pages to prefetch
   * @param {number} currentPage - Current page
   * @param {number} totalPages - Total pages
   * @returns {Array} Array of page numbers to prefetch
   */
  getPrefetchPages(currentPage, totalPages) {
    const pages = [];
    
    // Prefetch next pages
    for (let i = 1; i <= this.prefetchPages; i++) {
      const nextPage = currentPage + i;
      if (nextPage <= totalPages) {
        pages.push(nextPage);
      }
    }

    // Prefetch previous pages
    for (let i = 1; i <= this.prefetchPages; i++) {
      const prevPage = currentPage - i;
      if (prevPage >= 1) {
        pages.push(prevPage);
      }
    }

    return pages;
  }
}

/**
 * Lazy Loading Manager
 */
export class LazyLoadingManager {
  constructor(options = {}) {
    this.loadedPages = new Set();
    this.loadingPages = new Set();
    this.cache = new Map();
    this.observers = new Set();
    this.batchSize = options.batchSize || 10;
    this.loadThreshold = options.loadThreshold || 0.8; // Load when 80% scrolled
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
  }

  /**
   * Register an observer for lazy loading events
   * @param {Function} observer - Observer function
   */
  addObserver(observer) {
    this.observers.add(observer);
  }

  /**
   * Remove an observer
   * @param {Function} observer - Observer function to remove
   */
  removeObserver(observer) {
    this.observers.delete(observer);
  }

  /**
   * Notify observers of events
   * @param {string} event - Event type
   * @param {Object} data - Event data
   */
  notifyObservers(event, data) {
    this.observers.forEach(observer => {
      try {
        observer(event, data);
      } catch (error) {
        console.error('Error in lazy loading observer:', error);
      }
    });
  }

  /**
   * Load data for a specific page
   * @param {number} page - Page number to load
   * @param {Function} loadFunction - Function to load data
   * @param {Object} options - Loading options
   * @returns {Promise} Loading promise
   */
  async loadPage(page, loadFunction, options = {}) {
    const cacheKey = `page_${page}`;
    
    // Return cached data if available
    if (this.cache.has(cacheKey) && !options.forceReload) {
      this.notifyObservers('cache_hit', { page, data: this.cache.get(cacheKey) });
      return this.cache.get(cacheKey);
    }

    // Skip if already loading
    if (this.loadingPages.has(page)) {
      this.notifyObservers('already_loading', { page });
      return null;
    }

    this.loadingPages.add(page);
    this.notifyObservers('loading_start', { page });

    try {
      const data = await this.retryLoad(loadFunction, page);
      
      // Cache the data
      this.cache.set(cacheKey, data);
      this.loadedPages.add(page);
      
      this.notifyObservers('loading_success', { page, data });
      return data;
    } catch (error) {
      this.notifyObservers('loading_error', { page, error });
      throw error;
    } finally {
      this.loadingPages.delete(page);
    }
  }

  /**
   * Load data with retry logic
   * @param {Function} loadFunction - Function to load data
   * @param {number} page - Page number
   * @returns {Promise} Loading promise
   */
  async retryLoad(loadFunction, page) {
    let lastError;
    
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        return await loadFunction(page);
      } catch (error) {
        lastError = error;
        
        if (attempt < this.retryAttempts - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt); // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          this.notifyObservers('retry_attempt', { page, attempt: attempt + 1, delay });
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Preload multiple pages
   * @param {Array} pages - Array of page numbers to preload
   * @param {Function} loadFunction - Function to load data
   * @returns {Promise} Promise that resolves when all pages are loaded
   */
  async preloadPages(pages, loadFunction) {
    const loadPromises = pages
      .filter(page => !this.loadedPages.has(page) && !this.loadingPages.has(page))
      .map(page => this.loadPage(page, loadFunction).catch(error => {
        console.warn(`Failed to preload page ${page}:`, error);
        return null;
      }));

    return Promise.all(loadPromises);
  }

  /**
   * Check if a page is loaded
   * @param {number} page - Page number
   * @returns {boolean} True if page is loaded
   */
  isPageLoaded(page) {
    return this.loadedPages.has(page);
  }

  /**
   * Check if a page is currently loading
   * @param {number} page - Page number
   * @returns {boolean} True if page is loading
   */
  isPageLoading(page) {
    return this.loadingPages.has(page);
  }

  /**
   * Get cached data for a page
   * @param {number} page - Page number
   * @returns {*} Cached data or null
   */
  getCachedPage(page) {
    return this.cache.get(`page_${page}`) || null;
  }

  /**
   * Clear cache for specific pages or all pages
   * @param {Array} pages - Array of page numbers to clear (optional)
   */
  clearCache(pages = null) {
    if (pages) {
      pages.forEach(page => {
        this.cache.delete(`page_${page}`);
        this.loadedPages.delete(page);
      });
    } else {
      this.cache.clear();
      this.loadedPages.clear();
    }
    
    this.notifyObservers('cache_cleared', { pages });
  }

  /**
   * Get loading statistics
   * @returns {Object} Loading statistics
   */
  getStats() {
    return {
      loadedPages: Array.from(this.loadedPages),
      loadingPages: Array.from(this.loadingPages),
      cachedPages: this.cache.size,
      totalObservers: this.observers.size,
      cacheHitRate: this.calculateCacheHitRate()
    };
  }

  /**
   * Calculate cache hit rate (simplified)
   * @returns {number} Cache hit rate percentage
   */
  calculateCacheHitRate() {
    // This is a simplified calculation
    // In a real implementation, you'd track hits and misses
    const totalRequests = this.loadedPages.size + this.cache.size;
    return totalRequests > 0 ? (this.cache.size / totalRequests) * 100 : 0;
  }
}

/**
 * Virtual Scrolling Helper
 */
export class VirtualScrollHelper {
  constructor(options = {}) {
    this.itemHeight = options.itemHeight || 50;
    this.containerHeight = options.containerHeight || 400;
    this.overscan = options.overscan || 5; // Extra items to render
    this.totalItems = options.totalItems || 0;
  }

  /**
   * Calculate visible range for virtual scrolling
   * @param {number} scrollTop - Current scroll position
   * @returns {Object} Visible range information
   */
  calculateVisibleRange(scrollTop) {
    const visibleItemCount = Math.ceil(this.containerHeight / this.itemHeight);
    const startIndex = Math.floor(scrollTop / this.itemHeight);
    const endIndex = Math.min(startIndex + visibleItemCount, this.totalItems - 1);

    // Add overscan
    const overscanStart = Math.max(0, startIndex - this.overscan);
    const overscanEnd = Math.min(this.totalItems - 1, endIndex + this.overscan);

    return {
      startIndex: overscanStart,
      endIndex: overscanEnd,
      visibleStartIndex: startIndex,
      visibleEndIndex: endIndex,
      totalHeight: this.totalItems * this.itemHeight,
      offsetY: overscanStart * this.itemHeight
    };
  }

  /**
   * Update total items count
   * @param {number} totalItems - New total items count
   */
  updateTotalItems(totalItems) {
    this.totalItems = totalItems;
  }
}

export default {
  PaginationHelper,
  LazyLoadingManager,
  VirtualScrollHelper,
  PAGINATION_DEFAULTS
};
