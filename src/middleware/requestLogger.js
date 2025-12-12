const logger = require('../utils/logger');

/**
 * Enhanced request logger with Rails-style logging
 * Logs request start and completion with timing
 * RequestId is auto-injected by logger from async context
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const clientIp = (req.ip || req.connection.remoteAddress || '').replace(/^::ffff:/, '');
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  // Log request start
  logger.info(
    `Started ${req.method} "${req.originalUrl}" for ${clientIp} at ${timestamp}`
  );

  // Capture response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    if (statusCode >= 200 && statusCode < 300) {
      logger.info(
        `Completed ${statusCode} ${statusCode === 200 ? 'OK' : ''} in ${duration}ms`
      );
    } else if (statusCode >= 400) {
      logger.warn(
        `Completed ${statusCode} in ${duration}ms`
      );
    }
  });

  next();
};

module.exports = requestLogger;
