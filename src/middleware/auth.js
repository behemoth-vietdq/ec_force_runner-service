const config = require('../config');
const logger = require('../utils/logger');

/**
 * API Key authentication middleware
 * Checks for API key in X-API-Key header or api_key query parameter
 */
const authMiddleware = (req, res, next) => {
  // Skip auth in development if API_KEY not set
  if (config.server.env === 'development' && !config.server.apiKey) {
    logger.warn('API authentication disabled - no API_KEY configured');
    return next();
  }

  if (!config.server.apiKey) {
    logger.error('API_KEY not configured in production environment');
    return res.status(500).json({
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: 'Server configuration error',
      },
    });
  }

  // Get API key from header or query parameter
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

  if (apiKey !== config.server.apiKey) {
    logger.warn(`Authentication failed - invalid API key - IP: ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key',
      },
    });
  }

  // Authentication successful
  logger.debug('API authentication successful');
  next();
};

module.exports = authMiddleware;
