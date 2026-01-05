const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const { getErrorMessage } = require('./utils/logger');
const routes = require('./routes');
const requestIdMiddleware = require('./middleware/requestId');
const { requestContextMiddleware } = require('./utils/asyncContext');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { cleanupOldScreenshots } = require('./utils/screenshot');

// Create Express app
const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: config.server.corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id'],
  credentials: true,
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID middleware (before context)
app.use(requestIdMiddleware);

// Async context middleware (before logging)
app.use(requestContextMiddleware);

// Request logging
app.use(requestLogger);

// Routes
app.use('/', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Screenshot cleanup configuration
const SCREENSHOT_RETENTION_DAYS = 7;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Cleanup old screenshots on startup
cleanupOldScreenshots(SCREENSHOT_RETENTION_DAYS);

// Schedule periodic cleanup
const screenshotCleanupInterval = setInterval(() => {
  cleanupOldScreenshots(SCREENSHOT_RETENTION_DAYS);
}, CLEANUP_INTERVAL_MS);
screenshotCleanupInterval.unref();

/**
 * Create graceful shutdown handler
 */
function createShutdownHandler(server, cleanupInterval) {
  return async (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);
    
    // Clear screenshot cleanup interval
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      logger.info('Screenshot cleanup interval cleared');
    }
    
    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed - no longer accepting new connections');
      logger.info('Waiting for active requests to complete...');
      logger.info('Graceful shutdown completed');
      process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      logger.error(`Forced shutdown after ${config.server.shutdownTimeout}ms timeout`);
      process.exit(1);
    }, config.server.shutdownTimeout).unref();
  };
}

/**
 * Set server socket timeout
 */
function setServerTimeout(server) {
  try {
    server.setTimeout(config.server.requestTimeout);
    logger.info(`HTTP server socket timeout set to ${config.server.requestTimeout}ms`);
  } catch (err) {
    logger.warn('Unable to set server socket timeout', { error: err.message });
  }
}

/**
 * Log server startup information
 */
function logServerStartup() {
  const separator = '='.repeat(50);
  logger.info(separator);
  logger.info('🚀 Line Shop Runner Service started successfully');
  logger.info(separator);
  logger.info(`Environment: ${config.server.env}`);
  logger.info(`Server: http://${config.server.host}:${config.server.port}`);
  logger.info(`Health Check: http://${config.server.host}:${config.server.port}/healthz`);
  logger.info(`API Endpoint: http://${config.server.host}:${config.server.port}/api`);
  logger.info(`Headless Mode: ${config.puppeteer.headless}`);
  logger.info(`Log Level: ${config.logging.level}`);
  logger.info(separator);
}

/**
 * Start server
 */
const startServer = async () => {
  const server = app.listen(config.server.port, config.server.host, logServerStartup);

  // Set server socket timeout
  setServerTimeout(server);

  // Graceful shutdown handler
  const gracefulShutdown = createShutdownHandler(server, screenshotCleanupInterval);

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', { error: getErrorMessage(error), stack: error?.stack });
    gracefulShutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', { reason: String(reason), promise: String(promise) });
  });

  return server;
};

// Start server if not in test mode
if (require.main === module) {
  startServer();
}

module.exports = app;
