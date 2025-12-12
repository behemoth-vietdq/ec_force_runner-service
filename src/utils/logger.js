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
logger.add(new winston.transports.Console({
  format: consoleFormat,
}));

// Store original log methods
const originalInfo = logger.info.bind(logger);
const originalError = logger.error.bind(logger);
const originalWarn = logger.warn.bind(logger);
const originalDebug = logger.debug.bind(logger);

// Override methods to auto-inject requestId from async context
logger.info = (message, meta = {}) => {
  const store = getContext();
  const requestId = store?.requestId;
  return originalInfo(message, { ...meta, requestId });
};

logger.error = (message, meta = {}) => {
  const store = getContext();
  const requestId = store?.requestId;
  return originalError(message, { ...meta, requestId });
};

logger.warn = (message, meta = {}) => {
  const store = getContext();
  const requestId = store?.requestId;
  return originalWarn(message, { ...meta, requestId });
};

logger.debug = (message, meta = {}) => {
  const store = getContext();
  const requestId = store?.requestId;
  return originalDebug(message, { ...meta, requestId });
};

// Create a stream for Morgan (deprecated, no longer used)
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

module.exports = logger;
