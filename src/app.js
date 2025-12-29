const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
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

// Cleanup old screenshots on startup
cleanupOldScreenshots(7);

// Schedule periodic cleanup (every 24 hours)
setInterval(() => {
  cleanupOldScreenshots(7);
}, 24 * 60 * 60 * 1000);

// Start server
const startServer = async () => {
  const server = app.listen(config.server.port, config.server.host, () => {
    logger.info('='.repeat(50));
    logger.info('🚀 Line Shop Runner Service started successfully');
    logger.info('='.repeat(50));
    logger.info(`Environment: ${config.server.env}`);
    logger.info(`Server: http://${config.server.host}:${config.server.port}`);
    logger.info(`Health Check: http://${config.server.host}:${config.server.port}/healthz`);
    logger.info(`API Endpoint: http://${config.server.host}:${config.server.port}/api`);
    logger.info(`Headless Mode: ${config.puppeteer.headless}`);
    logger.info(`Log Level: ${config.logging.level}`);
    logger.info('='.repeat(50));
  });

  // Set server socket/request timeout to configured value (ms)
  try {
    server.setTimeout(config.server.requestTimeout);
    logger.info(`HTTP server socket timeout set to ${config.server.requestTimeout}ms`);
  } catch (err) {
    logger.warn('Unable to set server socket timeout', { error: err.message });
  }

  // Graceful shutdown
  const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);
    
    server.close(async () => {
      logger.info('HTTP server closed');
      logger.info('Graceful shutdown completed');
      process.exit(0);
    });

    // Force shutdown after configured timeout (default 5 minutes)
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, config.server.shutdownTimeout);
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
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
