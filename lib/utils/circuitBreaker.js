/**
 * Circuit Breaker Pattern Implementation
 * Prevents infinite retry loops and implements exponential backoff
 * for failed requests in the SAS FSM Portal
 */

// Circuit Breaker States
const CIRCUIT_STATES = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Circuit is open, requests fail fast
  HALF_OPEN: 'HALF_OPEN' // Testing if service is back
};

class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    this.expectedErrors = options.expectedErrors || [];
    
    // State management
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      circuitOpenCount: 0,
      lastResetTime: Date.now()
    };

    // Event listeners
    this.listeners = {
      stateChange: [],
      failure: [],
      success: [],
      timeout: []
    };

    console.log(`CircuitBreaker "${this.name}" initialized with threshold: ${this.failureThreshold}`);
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @param {...any} args - Arguments to pass to the function
   * @returns {Promise} Result of the function or circuit breaker error
   */
  async execute(fn, ...args) {
    this.stats.totalRequests++;

    // Check if circuit is open
    if (this.state === CIRCUIT_STATES.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        const error = new Error(`Circuit breaker "${this.name}" is OPEN. Next attempt in ${Math.ceil((this.nextAttemptTime - Date.now()) / 1000)}s`);
        error.circuitBreakerOpen = true;
        throw error;
      } else {
        // Move to half-open state
        this.state = CIRCUIT_STATES.HALF_OPEN;
        this.emit('stateChange', { from: CIRCUIT_STATES.OPEN, to: CIRCUIT_STATES.HALF_OPEN });
        console.log(`CircuitBreaker "${this.name}" moved to HALF_OPEN state`);
      }
    }

    try {
      const result = await fn(...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    this.stats.successfulRequests++;
    this.failureCount = 0;
    
    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      this.state = CIRCUIT_STATES.CLOSED;
      this.emit('stateChange', { from: CIRCUIT_STATES.HALF_OPEN, to: CIRCUIT_STATES.CLOSED });
      console.log(`CircuitBreaker "${this.name}" recovered - moved to CLOSED state`);
    }
    
    this.emit('success');
  }

  /**
   * Handle failed execution
   * @param {Error} error - The error that occurred
   */
  onFailure(error) {
    this.stats.failedRequests++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // Check if error should be ignored
    if (this.shouldIgnoreError(error)) {
      console.log(`CircuitBreaker "${this.name}" ignoring expected error:`, error.message);
      return;
    }

    console.log(`CircuitBreaker "${this.name}" failure ${this.failureCount}/${this.failureThreshold}:`, error.message);

    // Open circuit if threshold reached
    if (this.failureCount >= this.failureThreshold) {
      this.state = CIRCUIT_STATES.OPEN;
      this.nextAttemptTime = Date.now() + this.recoveryTimeout;
      this.stats.circuitOpenCount++;
      
      this.emit('stateChange', { from: CIRCUIT_STATES.CLOSED, to: CIRCUIT_STATES.OPEN });
      console.log(`CircuitBreaker "${this.name}" OPENED - recovery in ${this.recoveryTimeout / 1000}s`);
    }

    this.emit('failure', error);
  }

  /**
   * Check if error should be ignored (expected errors)
   * @param {Error} error - The error to check
   * @returns {boolean} True if error should be ignored
   */
  shouldIgnoreError(error) {
    return this.expectedErrors.some(expectedError => {
      if (typeof expectedError === 'string') {
        return error.message.includes(expectedError);
      }
      if (expectedError instanceof RegExp) {
        return expectedError.test(error.message);
      }
      if (typeof expectedError === 'function') {
        return expectedError(error);
      }
      return false;
    });
  }

  /**
   * Get current circuit breaker state
   * @returns {Object} Current state and statistics
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      stats: { ...this.stats },
      isOpen: this.state === CIRCUIT_STATES.OPEN,
      isHalfOpen: this.state === CIRCUIT_STATES.HALF_OPEN,
      isClosed: this.state === CIRCUIT_STATES.CLOSED
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset() {
    const previousState = this.state;
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.stats.lastResetTime = Date.now();
    
    this.emit('stateChange', { from: previousState, to: CIRCUIT_STATES.CLOSED });
    console.log(`CircuitBreaker "${this.name}" manually reset to CLOSED state`);
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener function
   */
  on(event, listener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener function
   */
  off(event, listener) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(l => l !== listener);
    }
  }

  /**
   * Emit event to listeners
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in circuit breaker event listener for "${event}":`, error);
        }
      });
    }
  }
}

/**
 * Exponential Backoff Utility
 */
class ExponentialBackoff {
  constructor(options = {}) {
    this.initialDelay = options.initialDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 30000; // 30 seconds
    this.multiplier = options.multiplier || 2;
    this.jitter = options.jitter || true;
    this.maxRetries = options.maxRetries || 5;
  }

  /**
   * Calculate delay for given attempt
   * @param {number} attempt - Attempt number (0-based)
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attempt) {
    if (attempt >= this.maxRetries) {
      return null; // No more retries
    }

    let delay = this.initialDelay * Math.pow(this.multiplier, attempt);
    delay = Math.min(delay, this.maxDelay);

    // Add jitter to prevent thundering herd
    if (this.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * Execute function with exponential backoff
   * @param {Function} fn - Function to execute
   * @param {...any} args - Arguments to pass to function
   * @returns {Promise} Result of successful execution
   */
  async execute(fn, ...args) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        
        if (attempt === this.maxRetries) {
          console.log(`ExponentialBackoff: Max retries (${this.maxRetries}) reached`);
          break;
        }

        const delay = this.calculateDelay(attempt);
        if (delay === null) break;

        console.log(`ExponentialBackoff: Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers
 */
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create circuit breaker
   * @param {string} name - Circuit breaker name
   * @param {Object} options - Circuit breaker options
   * @returns {CircuitBreaker} Circuit breaker instance
   */
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ ...options, name }));
    }
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breaker states
   * @returns {Array} Array of circuit breaker states
   */
  getAllStates() {
    return Array.from(this.breakers.values()).map(breaker => breaker.getState());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    this.breakers.forEach(breaker => breaker.reset());
  }

  /**
   * Remove circuit breaker
   * @param {string} name - Circuit breaker name
   */
  removeBreaker(name) {
    this.breakers.delete(name);
  }
}

// Global circuit breaker manager instance
const circuitBreakerManager = new CircuitBreakerManager();

// Export classes and manager
export {
  CircuitBreaker,
  ExponentialBackoff,
  CircuitBreakerManager,
  CIRCUIT_STATES
};

export default circuitBreakerManager;
