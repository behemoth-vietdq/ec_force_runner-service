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
const { getBrowserPool } = require('./utils/browserPool');

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
  // Initialize browser pool
  try {
    logger.info('Initializing browser pool...');
    const browserPool = getBrowserPool();
    await browserPool.initialize();
    logger.info('Browser pool initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize browser pool:', error);
    logger.warn('Service will start without browser pool');
  }

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

  // Graceful shutdown
  const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);
    
    server.close(async () => {
      logger.info('HTTP server closed');
      
      // Shutdown browser pool
      try {
        const browserPool = getBrowserPool();
        await browserPool.shutdown();
        logger.info('Browser pool shut down successfully');
      } catch (error) {
        logger.error('Error shutting down browser pool:', error);
      }
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  return server;
};

// Start server if not in test mode
if (require.main === module) {
  startServer();
}

module.exports = app;
