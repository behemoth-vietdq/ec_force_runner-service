const logger = require('../utils/logger');

/**
 * Custom error class for crawler errors
 */
class CrawlerError extends Error {
  constructor(message, code, statusCode = 500, details = {}) {
    super(message);
    this.name = 'CrawlerError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error codes
 */
const ErrorCodes = {
  // Browser errors
  BROWSER_INIT_FAILED: 'BROWSER_INIT_FAILED',
  BROWSER_NAVIGATION_FAILED: 'BROWSER_NAVIGATION_FAILED',
  
  // Element errors
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  ELEMENT_INTERACTION_FAILED: 'ELEMENT_INTERACTION_FAILED',
  
  // Authentication errors
  LOGIN_FAILED: 'LOGIN_FAILED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  
  // Order errors
  ORDER_CREATION_FAILED: 'ORDER_CREATION_FAILED',
  ORDER_SUBMISSION_FAILED: 'ORDER_SUBMISSION_FAILED',
  ORDER_VALIDATION_FAILED: 'ORDER_VALIDATION_FAILED',
  
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  
  // Timeout errors
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  PAGE_LOAD_TIMEOUT: 'PAGE_LOAD_TIMEOUT',
  
  // General errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error
  logger.error(`Error occurred - name: ${err.name}, message: ${err.message}, code: ${err.code}, url: ${req.originalUrl}, method: ${req.method}`);

  // Handle Joi validation errors
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation error',
        details: err.details.map(d => ({
          field: d.path.join('.'),
          message: d.message,
        })),
      },
    });
  }

  // Handle custom CrawlerError
  if (err instanceof CrawlerError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  // Handle generic errors
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || ErrorCodes.INTERNAL_ERROR;
  
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

/**
 * 404 handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.originalUrl} not found`,
    },
  });
};

/**
 * Async handler wrapper to catch promise rejections
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  CrawlerError,
  ErrorCodes,
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
