const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Constant-time string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  
  // If lengths differ, still compare to prevent timing attack
  if (bufA.length !== bufB.length) {
    // Compare with a dummy buffer of same length as bufA
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * API Key authentication middleware
 * Validates X-API-Key header against configured keys
 * Note: Query param support removed for security (avoids logging/caching API keys)
 */
const authMiddleware = (req, res, next) => {
  const validKeys = config.apiKeys.admin;

  if (config.server.env === 'development' && validKeys.length === 0) {
    logger.warn('API authentication disabled - no API keys configured');
    return next();
  }

  if (validKeys.length === 0) {
    logger.error('API keys not configured');
    return res.status(500).json({
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: 'Server configuration error',
      },
    });
  }

  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'API key required in X-API-Key header',
      },
    });
  }

  // Use constant-time comparison to prevent timing attacks
  const isValidKey = validKeys.some(validKey => constantTimeCompare(apiKey, validKey));
  
  if (!isValidKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key',
      },
    });
  }

  next();
};

module.exports = authMiddleware;
