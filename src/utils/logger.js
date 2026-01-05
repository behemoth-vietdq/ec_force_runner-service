const winston = require('winston');
const config = require('../config');
const path = require('path');
const fs = require('fs');
const { getContext } = require('./asyncContext');

// Create logs directory if it doesn't exist
const logDir = path.dirname(config.logging.file);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define console format for better readability with requestId
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf((log) => {
    // Filter out .well-known requests
    if (log.message && log.message.includes('.well-known')) {
      return false;
    }
    const requestId = log.requestId ? `[${log.requestId}] ` : '';
    if (log.stack) {
      return `${log.timestamp} [${log.level}] ${requestId}${log.stack}`;
    }
    return `${log.timestamp} [${log.level}] ${requestId}${log.message}`;
  })
);

// Create logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'line-shop-runner-service' },
  transports: [
    // Write all logs to file
    new winston.transports.File({ 
      filename: config.logging.file,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // Write errors to separate file
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5,
    }),
  ],
});

// Add console transport (always enabled for Docker logs)
const consoleTransport = new winston.transports.Console({
  format: consoleFormat,
});

logger.add(consoleTransport);

// Silence console logs ONLY when running Jest tests (not in dev/prod)
// File logs still work, only console is silenced during test runs
if (process.env.JEST_WORKER_ID !== undefined) {
  consoleTransport.silent = true;
}

// Store original log methods
const originalInfo = logger.info.bind(logger);
const originalError = logger.error.bind(logger);
const originalWarn = logger.warn.bind(logger);
const originalDebug = logger.debug.bind(logger);

/**
 * Format log message with metadata and request ID
 */
const formatLogMessage = (message, meta = {}, requestId) => {
  let msgStr = typeof message === 'string' ? message : serializeValue(message);

  const hasMeta = meta && Object.keys(meta).length > 0;
  if (hasMeta) {
    msgStr = `${msgStr} | ${serializeValue(meta)}`;
  }

  if (requestId) {
    msgStr = `[${requestId}] ${msgStr}`;
  }

  return msgStr;
};

/**
 * Serialize value to string
 * @private
 */
function serializeValue(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

/**
 * Create logger method with request ID context
 * @private
 */
function createLoggerMethod(originalMethod) {
  return (message, meta = {}) => {
    const store = getContext();
    const requestId = store?.requestId;
    const combined = formatLogMessage(message, meta, requestId);
    return originalMethod(combined);
  };
}

// Override methods to always log a single string (message + serialized meta)
logger.info = createLoggerMethod(originalInfo);
logger.error = createLoggerMethod(originalError);
logger.warn = createLoggerMethod(originalWarn);
logger.debug = createLoggerMethod(originalDebug);

/**
 * Format error message consistently
 * @param {Error|string|any} error - Error object or message
 * @returns {string} Formatted error message
 */
const getErrorMessage = (error) => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error?.message) return error.message;
  try {
    return String(error);
  } catch (e) {
    return 'Error converting error to string';
  }
};

module.exports = logger;
module.exports.getErrorMessage = getErrorMessage;
