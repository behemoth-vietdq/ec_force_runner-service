/**
 * Retry utility with exponential backoff
 * Lightweight retry mechanism for transient failures
 */

const logger = require('./logger');
const { getErrorMessage } = require('./logger');

/**
 * Retry configuration
 */
const DEFAULT_CONFIG = {
  maxAttempts: 3,
  initialDelay: 1000,      // 1 second
  maxDelay: 30000,         // 30 seconds
  backoffMultiplier: 2,
  timeout: 300000,         // 5 minutes
};

/**
 * Execute function with retry logic and exponential backoff
 */
async function retryWithBackoff(fn, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const { maxAttempts, initialDelay, maxDelay, backoffMultiplier, timeout, operationName = 'operation' } = config;

  const startTime = Date.now();
  let lastError;
  let currentDelay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check if we've exceeded total timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeout) {
      logger.warn(`Retry timeout exceeded`, {
        operationName,
        elapsed,
        timeout,
        attempt
      });
      throw new Error(`Operation timeout after ${elapsed}ms (max: ${timeout}ms)`);
    }

    try {
      logger.info(`Executing ${operationName}`, {
        attempt,
        maxAttempts,
        elapsed: `${elapsed}ms`
      });

      // Execute the function
      const result = await fn();

      if (attempt > 1) {
        logger.info(`${operationName} succeeded after ${attempt} attempts`, {
          totalTime: `${Date.now() - startTime}ms`
        });
      }

      return result;

    } catch (error) {
      lastError = error;
      
      logger.warn(`${operationName} failed`, {
        attempt,
        maxAttempts,
        error: getErrorMessage(error),
        errorCode: error?.code,
        willRetry: attempt < maxAttempts
      });

      // Don't retry on final attempt
      if (attempt >= maxAttempts) {
        logger.error(`${operationName} failed after ${maxAttempts} attempts`, {
          totalTime: `${Date.now() - startTime}ms`,
          lastError: getErrorMessage(error)
        });
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(currentDelay, maxDelay);
      
      logger.info(`Retrying ${operationName} in ${delay}ms`, {
        attempt: attempt + 1,
        maxAttempts
      });

      // Wait before retrying
      await sleep(delay);

      // Increase delay for next attempt
      currentDelay *= backoffMultiplier;
    }
  }

  // All retries exhausted, throw the last error
  throw lastError;
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  retryWithBackoff,
  sleep,
  DEFAULT_CONFIG
};
