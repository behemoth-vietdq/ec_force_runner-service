const crypto = require('crypto');

/**
 * Request ID middleware
 * Assigns unique ID to each request for tracking
 */
const requestIdMiddleware = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};

module.exports = requestIdMiddleware;
