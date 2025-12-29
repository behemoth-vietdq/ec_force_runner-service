/**
 * Application constants
 * Centralized place for magic numbers and configuration values
 */

module.exports = {
  // Puppeteer timeouts (milliseconds)
  TIMEOUTS: {
    NAVIGATION: 30000,
    SELECTOR_WAIT: 5000,
    SELECTOR_WAIT_SHORT: 3000,
    SELECTOR_WAIT_LONG: 10000,
    LOGIN_NAVIGATION: 2000,
    MODAL_WAIT: 3000,
    VARIANT_TABLE_WAIT: 3000,
  },

  // Sleep delays (milliseconds)
  DELAYS: {
    AFTER_SCROLL: 300,
    BEFORE_CLICK: 200,
    BEFORE_TYPE: 100,
    TYPING_DELAY: 50,
    BETWEEN_RETRIES: 500,
  },

  // Retry configuration
  RETRIES: {
    DEFAULT_MAX: 3,
    CLICK_MAX: 3,
    FILL_INPUT_MAX: 3,
  },

  // Screenshot configuration
  SCREENSHOTS: {
    CLEANUP_DAYS: 7,
    QUALITY: 80,
  },

  // GCS configuration
  GCS: {
    SIGNED_URL_EXPIRY_HOURS: 1,
    SIGNED_URL_EXPIRY_MS: 3600000,
  },

  // Retry configuration  
  RETRY: {
    MAX_ATTEMPTS: 3,
    INITIAL_DELAY: 2000,      // 2 seconds
    MAX_DELAY: 30000,         // 30 seconds
    BACKOFF_MULTIPLIER: 2,
    TIMEOUT: 300000,          // 5 minutes
  },

  // Health check
  HEALTH_CHECK: {
    BROWSER_TEST_TIMEOUT: 5000,
    GCS_TEST_TIMEOUT: 3000,
  },
};
