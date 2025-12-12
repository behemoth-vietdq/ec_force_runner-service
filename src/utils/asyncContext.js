const { AsyncLocalStorage } = require('async_hooks');

const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Get the current async context
 * @returns {Object|undefined} Context object with requestId
 */
const getContext = () => {
  return asyncLocalStorage.getStore();
};

/**
 * Run function with async context
 * @param {Object} store - Context data to store
 * @param {Function} callback - Function to run with context
 */
const runWithContext = (store, callback) => {
  return asyncLocalStorage.run(store, callback);
};

/**
 * Middleware to set up async context for request
 */
const requestContextMiddleware = (req, res, next) => {
  const store = {
    requestId: req.requestId,
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
  };
  
  runWithContext(store, () => {
    next();
  });
};

module.exports = {
  getContext,
  runWithContext,
  requestContextMiddleware,
};
