const config = require('../config');
const logger = require('../utils/logger');

/**
 * API Key authentication middleware
 * Validates X-API-Key header or api_key query parameter against configured keys
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

  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    logger.warn(`Authentication failed - no API key provided - IP: ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'API key required. Provide in X-API-Key header or api_key query parameter',
      },
    });
  }

  if (!validKeys.includes(apiKey)) {
    logger.warn(`Authentication failed - invalid API key - IP: ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key',
      },
    });
  }

  logger.debug('API authentication successful');
  next();
};

module.exports = authMiddleware;
