/**
 * Circuit Breaker Pattern Implementation
 * Redis-based shared state for distributed systems (multi-pod Kubernetes deployment)
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 * 
 * Features:
 * - Shared state across all pods via Redis
 * - Atomic operations with Redis
 * - Prometheus metrics integration
 * - Automatic state transitions
 */

const logger = require('./logger');
const { CIRCUIT_BREAKER } = require('../config/constants');
const {
  updateCircuitBreakerState,
  recordCircuitBreakerFailure,
  recordCircuitBreakerTransition,
  recordCircuitBreakerOpenDuration
} = require('./metrics');

const CIRCUIT_STATE = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

// Redis client (initialized in getRedisClient)
let redisClient = null;

/**
 * Get or create Redis client
 */
function getRedisClient() {
  if (redisClient && redisClient.status === 'ready') {
    return redisClient;
  }

  const Redis = require('ioredis');
  const config = require('../config');
  
  if (!config.redis || !config.redis.url) {
    logger.warn('Redis not configured, circuit breaker will work in standalone mode');
    return null;
  }

  try {
    redisClient = new Redis(config.redis.url, {
      password: config.redis.password,
      db: config.redis.db || 0,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected for circuit breaker');
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to create Redis client', { error: error.message });
    return null;
  }
}

/**
 * Distributed Circuit Breaker with Redis
 */
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.service = options.service || 'unknown';
    this.redisKeyPrefix = `circuit:${this.service}:${this.name}`;
    
    // Configuration
    this.failureThreshold = options.failureThreshold || CIRCUIT_BREAKER.FAILURE_THRESHOLD;
    this.successThreshold = options.successThreshold || CIRCUIT_BREAKER.SUCCESS_THRESHOLD;
    this.timeout = options.timeout || CIRCUIT_BREAKER.TIMEOUT;
    this.resetTimeout = options.resetTimeout || CIRCUIT_BREAKER.RESET_TIMEOUT;
    
    // Local cache (fallback when Redis unavailable)
    this.localState = CIRCUIT_STATE.CLOSED;
    this.localFailureCount = 0;
    this.localSuccessCount = 0;
    this.localNextAttempt = Date.now();
    this.lastError = null;
    
    // Redis client
    this.redis = getRedisClient();
    
    // Track state open time for metrics
    this.stateOpenedAt = null;
    
    // Initialize metrics
    this.updateMetrics(CIRCUIT_STATE.CLOSED);
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, ...args) {
    const state = await this.getState();
    
    if (state === CIRCUIT_STATE.OPEN) {
      const nextAttempt = await this.getNextAttempt();
      if (Date.now() < nextAttempt) {
        const error = new Error(`Circuit breaker is OPEN for ${this.name}`);
        error.code = 'CIRCUIT_OPEN';
        error.lastError = this.lastError;
        logger.warn(`Circuit breaker OPEN: ${this.name}`, {
          service: this.service,
          nextAttempt: new Date(nextAttempt).toISOString()
        });
        throw error;
      }
      
      // Try half-open state
      await this.setState(CIRCUIT_STATE.HALF_OPEN);
      logger.info(`Circuit breaker entering HALF_OPEN state: ${this.name}`);
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn, args);
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure(error);
      throw error;
    }
  }

  /**
   * Execute function with timeout protection
   */
  async executeWithTimeout(fn, args) {
    return Promise.race([
      fn(...args),
      new Promise((_, reject) => 
        setTimeout(() => {
          const error = new Error(`Circuit breaker timeout after ${this.timeout}ms for ${this.name}`);
          error.code = 'CIRCUIT_TIMEOUT';
          reject(error);
        }, this.timeout)
      )
    ]);
  }

  /**
   * Handle successful execution
   */
  async onSuccess() {
    await this.resetFailures();
    this.lastError = null;

    const state = await this.getState();
    if (state === CIRCUIT_STATE.HALF_OPEN) {
      const successCount = await this.incrementSuccess();
      
      if (successCount >= this.successThreshold) {
        const oldState = state;
        await this.setState(CIRCUIT_STATE.CLOSED);
        await this.resetSuccess();
        
        // Record state transition
        recordCircuitBreakerTransition(this.service, this.name, oldState, CIRCUIT_STATE.CLOSED);
        
        // Record how long circuit was open
        if (this.stateOpenedAt) {
          const duration = (Date.now() - this.stateOpenedAt) / 1000;
          recordCircuitBreakerOpenDuration(this.service, this.name, duration);
          this.stateOpenedAt = null;
        }
        
        logger.info(`Circuit breaker closed: ${this.name}`);
      }
    }
  }

  /**
   * Handle failed execution
   */
  async onFailure(error) {
    const failureCount = await this.incrementFailures();
    this.lastError = error.message;
    
    // Record failure metric
    recordCircuitBreakerFailure(this.service, this.name);
    
    logger.error(`Circuit breaker failure: ${this.name}`, {
      service: this.service,
      error: error.message,
      failureCount,
      state: await this.getState()
    });

    const state = await this.getState();
    if (state === CIRCUIT_STATE.HALF_OPEN) {
      await this.open();
    } else if (failureCount >= this.failureThreshold) {
      await this.open();
    }
  }

  /**
   * Open the circuit
   */
  async open() {
    const oldState = await this.getState();
    await this.setState(CIRCUIT_STATE.OPEN);
    await this.setNextAttempt(Date.now() + this.resetTimeout);
    await this.resetSuccess();
    
    // Record state transition
    if (oldState !== CIRCUIT_STATE.OPEN) {
      recordCircuitBreakerTransition(this.service, this.name, oldState, CIRCUIT_STATE.OPEN);
      this.stateOpenedAt = Date.now();
    }
    
    logger.warn(`Circuit breaker opened: ${this.name}`, {
      service: this.service,
      failureCount: await this.getFailureCount(),
      resetAt: new Date(Date.now() + this.resetTimeout).toISOString()
    });
  }

  /**
   * Force close the circuit (for testing/manual intervention)
   */
  async forceClose() {
    const oldState = await this.getState();
    await this.setState(CIRCUIT_STATE.CLOSED);
    await this.resetFailures();
    await this.resetSuccess();
    this.lastError = null;
    
    // Record state transition
    if (oldState !== CIRCUIT_STATE.CLOSED) {
      recordCircuitBreakerTransition(this.service, this.name, oldState, CIRCUIT_STATE.CLOSED);
    }
    
    logger.info(`Circuit breaker force closed: ${this.name}`);
  }

  // ==================== Redis Operations ====================

  async getState() {
    if (!this.redis) return this.localState;
    
    try {
      const state = await this.redis.get(`${this.redisKeyPrefix}:state`);
      return state || CIRCUIT_STATE.CLOSED;
    } catch (error) {
      logger.error('Redis error getting state, using local', { error: error.message });
      return this.localState;
    }
  }

  async setState(state) {
    this.localState = state;
    this.updateMetrics(state);
    
    if (!this.redis) return;
    
    try {
      await this.redis.set(`${this.redisKeyPrefix}:state`, state, 'EX', 3600);
    } catch (error) {
      logger.error('Redis error setting state', { error: error.message });
    }
  }

  async incrementFailures() {
    this.localFailureCount++;
    
    if (!this.redis) return this.localFailureCount;
    
    try {
      const count = await this.redis.incr(`${this.redisKeyPrefix}:failures`);
      await this.redis.expire(`${this.redisKeyPrefix}:failures`, 300); // 5 minutes TTL
      return count;
    } catch (error) {
      logger.error('Redis error incrementing failures', { error: error.message });
      return this.localFailureCount;
    }
  }

  async resetFailures() {
    this.localFailureCount = 0;
    
    if (!this.redis) return;
    
    try {
      await this.redis.del(`${this.redisKeyPrefix}:failures`);
    } catch (error) {
      logger.error('Redis error resetting failures', { error: error.message });
    }
  }

  async getFailureCount() {
    if (!this.redis) return this.localFailureCount;
    
    try {
      const count = await this.redis.get(`${this.redisKeyPrefix}:failures`);
      return parseInt(count) || 0;
    } catch (error) {
      return this.localFailureCount;
    }
  }

  async incrementSuccess() {
    this.localSuccessCount++;
    
    if (!this.redis) return this.localSuccessCount;
    
    try {
      const count = await this.redis.incr(`${this.redisKeyPrefix}:success`);
      await this.redis.expire(`${this.redisKeyPrefix}:success`, 60);
      return count;
    } catch (error) {
      logger.error('Redis error incrementing success', { error: error.message });
      return this.localSuccessCount;
    }
  }

  async resetSuccess() {
    this.localSuccessCount = 0;
    
    if (!this.redis) return;
    
    try {
      await this.redis.del(`${this.redisKeyPrefix}:success`);
    } catch (error) {
      logger.error('Redis error resetting success', { error: error.message });
    }
  }

  async setNextAttempt(timestamp) {
    this.localNextAttempt = timestamp;
    
    if (!this.redis) return;
    
    try {
      const ttl = Math.ceil((timestamp - Date.now()) / 1000);
      if (ttl > 0) {
        await this.redis.set(`${this.redisKeyPrefix}:next`, timestamp, 'EX', ttl);
      }
    } catch (error) {
      logger.error('Redis error setting next attempt', { error: error.message });
    }
  }

  async getNextAttempt() {
    if (!this.redis) return this.localNextAttempt;
    
    try {
      const next = await this.redis.get(`${this.redisKeyPrefix}:next`);
      return parseInt(next) || Date.now();
    } catch (error) {
      return this.localNextAttempt;
    }
  }

  /**
   * Update Prometheus metrics
   */
  updateMetrics(state) {
    updateCircuitBreakerState(this.service, this.name, state);
  }

  /**
   * Get current circuit breaker status
   */
  async getStatus() {
    const state = await this.getState();
    const failureCount = await this.getFailureCount();
    const nextAttempt = await this.getNextAttempt();
    
    return {
      name: this.name,
      service: this.service,
      state,
      failureCount,
      successCount: this.localSuccessCount,
      lastError: this.lastError,
      nextAttempt: state === CIRCUIT_STATE.OPEN ? new Date(nextAttempt).toISOString() : null,
      config: {
        failureThreshold: this.failureThreshold,
        successThreshold: this.successThreshold,
        timeout: this.timeout,
        resetTimeout: this.resetTimeout
      }
    };
  }
}

// Singleton instances for different services
const circuitBreakers = {
  ecforce: new CircuitBreaker('ec-force', {
    service: 'ecforce',
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000, // 30s for browser operations
    resetTimeout: 60000 // 1 minute cooldown
  }),
  
  gcs: new CircuitBreaker('google-cloud-storage', {
    service: 'gcs',
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 10000, // 10s for upload
    resetTimeout: 30000 // 30s cooldown
  })
};

/**
 * Get circuit breaker instance by name
 */
function getCircuitBreaker(name) {
  if (!circuitBreakers[name]) {
    throw new Error(`Circuit breaker not found: ${name}`);
  }
  return circuitBreakers[name];
}

/**
 * Get all circuit breaker statuses
 */
async function getAllStatuses() {
  const statuses = await Promise.all(
    Object.values(circuitBreakers).map(cb => cb.getStatus())
  );
  return statuses;
}

/**
 * Graceful shutdown - close Redis connection
 */
async function shutdown() {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Circuit breaker Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection', { error: error.message });
    }
  }
}

module.exports = {
  CircuitBreaker,
  getCircuitBreaker,
  getAllStatuses,
  shutdown,
  CIRCUIT_STATE
};
