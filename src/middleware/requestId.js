const crypto = require('crypto');

/**
 * Request ID middleware
 * Assigns unique ID to each request for tracking
 */
const requestIdMiddleware = (req, res, next) => {
  // Support both `req.requestId` (used by async context) and `req.id` (used in controllers/middlewares)
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = id;
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
};

module.exports = requestIdMiddleware;
