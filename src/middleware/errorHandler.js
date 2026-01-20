const logger = require("../utils/logger");
const config = require("../config");

/**
 * Custom error class for crawler errors
 */
class CrawlerError extends Error {
  constructor(message, code, statusCode = 500, details = {}) {
    super(message);
    this.name = "CrawlerError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // Distinguishes operational errors from programming errors
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create a CrawlerError from any error
   */
  static from(error, code = ErrorCodes.INTERNAL_ERROR, statusCode = 500) {
    if (error instanceof CrawlerError) {
      return error;
    }
    return new CrawlerError(
      error.message || "Unknown error",
      code,
      statusCode,
      { originalError: error.message }
    );
  }
}

/**
 * Error codes - organized by category
 */
const ErrorCodes = {
  // Browser errors (5xx - server/infrastructure issues)
  BROWSER_INIT_FAILED: "BROWSER_INIT_FAILED",
  BROWSER_NAVIGATION_FAILED: "BROWSER_NAVIGATION_FAILED",
  BROWSER_TIMEOUT: "BROWSER_TIMEOUT",

  // Element errors (5xx - page structure issues)
  ELEMENT_NOT_FOUND: "ELEMENT_NOT_FOUND",
  ELEMENT_INTERACTION_FAILED: "ELEMENT_INTERACTION_FAILED",

  // Authentication errors (4xx - client credential issues)
  LOGIN_FAILED: "LOGIN_FAILED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  UNAUTHORIZED: "UNAUTHORIZED",

  // Order errors (4xx/5xx depending on cause)
  ORDER_CREATION_FAILED: "ORDER_CREATION_FAILED",
  ORDER_SUBMISSION_FAILED: "ORDER_SUBMISSION_FAILED",
  ORDER_VALIDATION_FAILED: "ORDER_VALIDATION_FAILED",

  // Validation errors (4xx - client input issues)
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",

  // Timeout errors (5xx - infrastructure issues)
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  PAGE_LOAD_TIMEOUT: "PAGE_LOAD_TIMEOUT",
  CRAWLER_TIMEOUT: "CRAWLER_TIMEOUT",

  // Rate limiting (4xx)
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",

  // General errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  CONFIG_ERROR: "CONFIG_ERROR",
  NOT_FOUND: "NOT_FOUND",
};

/**
 * Map error codes to HTTP status codes
 */
const ErrorStatusMap = {
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.INVALID_INPUT]: 400,
  [ErrorCodes.MISSING_REQUIRED_FIELD]: 400,
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.LOGIN_FAILED]: 401,
  [ErrorCodes.INVALID_CREDENTIALS]: 401,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCodes.BROWSER_INIT_FAILED]: 500,
  [ErrorCodes.BROWSER_NAVIGATION_FAILED]: 500,
  [ErrorCodes.BROWSER_TIMEOUT]: 504,
  [ErrorCodes.TIMEOUT_ERROR]: 504,
  [ErrorCodes.PAGE_LOAD_TIMEOUT]: 504,
  [ErrorCodes.CRAWLER_TIMEOUT]: 504,
  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.UNKNOWN_ERROR]: 500,
};

/**
 * Determine if error details should be exposed to client
 */
const shouldExposeDetails = (err) => {
  // Always expose validation errors
  if (err.code === ErrorCodes.VALIDATION_ERROR) return true;
  // Expose details in development
  if (config.server.env === "development") return true;
  // Don't expose internal error details in production
  return false;
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Prevent double response
  if (res.headersSent) {
    return next(err);
  }

  // Determine error code for logging (avoid undefined)
  const errorCode =
    err.code ||
    (err instanceof CrawlerError
      ? ErrorCodes.UNKNOWN_ERROR
      : ErrorCodes.INTERNAL_ERROR);

  // Determine status code
  const statusCode = 
    err.statusCode || 
    ErrorStatusMap[errorCode] || 
    500;

  // Log error with structured data
  const logData = {
    errorName: err.name || "Error",
    errorCode,
    statusCode,
    url: req.originalUrl,
    method: req.method,
    requestId: req.id,
    userAgent: req.get("user-agent"),
  };

  // Log stack trace for 5xx errors
  if (statusCode >= 500) {
    logger.error(`Error occurred: ${err.message}`, {
      ...logData,
      stack: err.stack,
    });
  } else {
    logger.warn(`Client error: ${err.message}`, logData);
  }

  // Handle Joi validation errors
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: "Validation error",
        details: err.details.map((d) => ({
          field: d.path.join("."),
          message: d.message,
        })),
      },
      requestId: req.id,
    });
  }

  // Build error response
  const errorResponse = {
    success: false,
    error: {
      code: errorCode,
      message: statusCode >= 500 && config.server.env === "production"
        ? "Internal server error"
        : err.message || "Internal server error",
    },
    requestId: req.id,
  };

  // Add details if appropriate
  if (shouldExposeDetails(err) && err.details) {
    errorResponse.error.details = err.details;
  }

  // Add stack trace in development
  if (config.server.env === "development" && err.stack) {
    errorResponse.error.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * 404 handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCodes.NOT_FOUND,
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
    requestId: req.id,
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
  ErrorStatusMap,
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
