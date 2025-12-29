/**
 * Prometheus metrics for monitoring
 * Comprehensive metrics for production monitoring with Grafana/Prometheus
 */

const client = require('prom-client');
const logger = require('./logger');

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'line_shop_runner_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
});

// ==================== HTTP Request Metrics ====================

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register]
});

const httpRequestTotal = new client.Counter({
  name: 'http_request_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

const httpRequestsInProgress = new client.Gauge({
  name: 'http_requests_in_progress',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method', 'route'],
  registers: [register]
});

// ==================== Crawler Metrics ====================

const crawlerDuration = new client.Histogram({
  name: 'crawler_execution_duration_seconds',
  help: 'Time taken to complete crawler execution',
  labelNames: ['status', 'shop'],
  buckets: [5, 10, 20, 30, 45, 60, 90, 120],
  registers: [register]
});

const crawlerTotal = new client.Counter({
  name: 'crawler_executions_total',
  help: 'Total number of crawler executions',
  labelNames: ['status', 'shop'], // success, failed
  registers: [register]
});

const crawlerErrors = new client.Counter({
  name: 'crawler_errors_total',
  help: 'Total number of crawler errors by type',
  labelNames: ['error_code', 'shop'],
  registers: [register]
});

const crawlerStepDuration = new client.Histogram({
  name: 'crawler_step_duration_seconds',
  help: 'Duration of individual crawler steps',
  labelNames: ['step'], // login, navigate, fill_form, submit, extract
  buckets: [0.5, 1, 2, 5, 10, 20, 30],
  registers: [register]
});

const crawlerScreenshots = new client.Counter({
  name: 'crawler_screenshots_total',
  help: 'Number of screenshots captured',
  labelNames: ['type'], // error, success
  registers: [register]
});

// ==================== Business Metrics ====================

const ordersCreated = new client.Counter({
  name: 'orders_created_total',
  help: 'Total number of orders successfully created',
  labelNames: ['shop'],
  registers: [register]
});

const ordersFailed = new client.Counter({
  name: 'orders_failed_total',
  help: 'Total number of failed order creation attempts',
  labelNames: ['shop', 'reason'],
  registers: [register]
});

// ==================== GCS Metrics ====================

const gcsUploadDuration = new client.Histogram({
  name: 'gcs_upload_duration_seconds',
  help: 'Time taken to upload to GCS',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

const gcsUploadTotal = new client.Counter({
  name: 'gcs_uploads_total',
  help: 'Total number of GCS uploads',
  labelNames: ['status'], // success, failed
  registers: [register]
});

// ==================== Helper Functions ====================

/**
 * Record HTTP request metrics
 */
function recordHttpRequest(method, route, statusCode, duration) {
  httpRequestDuration.labels(method, route, statusCode).observe(duration);
  httpRequestTotal.labels(method, route, statusCode).inc();
}

/**
 * Track HTTP request in progress
 */
function startHttpRequest(method, route) {
  httpRequestsInProgress.labels(method, route).inc();
  return () => httpRequestsInProgress.labels(method, route).dec();
}

/**
 * Record crawler execution
 */
function recordCrawlerExecution(status, shop, durationSeconds) {
  crawlerDuration.labels(status, shop).observe(durationSeconds);
  crawlerTotal.labels(status, shop).inc();
}

/**
 * Record crawler error
 */
function recordCrawlerError(errorCode, shop) {
  crawlerErrors.labels(errorCode, shop).inc();
}

/**
 * Record crawler step duration
 */
function recordCrawlerStep(step, durationSeconds) {
  crawlerStepDuration.labels(step).observe(durationSeconds);
}

/**
 * Record screenshot
 */
function recordScreenshot(type) {
  crawlerScreenshots.labels(type).inc();
}

/**
 * Record order created
 */
function recordOrderCreated(shop) {
  ordersCreated.labels(shop).inc();
}

/**
 * Record order failed
 */
function recordOrderFailed(shop, reason) {
  ordersFailed.labels(shop, reason).inc();
}

/**
 * Record GCS upload
 */
function recordGcsUpload(status, durationSeconds) {
  gcsUploadTotal.labels(status).inc();
  if (durationSeconds) {
    gcsUploadDuration.observe(durationSeconds);
  }
}

/**
 * Get metrics endpoint handler
 */
async function getMetrics(req, res) {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Error generating metrics', { error: error.message });
    res.status(500).end(error.message);
  }
}

module.exports = {
  register,
  getMetrics,
  
  // HTTP
  recordHttpRequest,
  startHttpRequest,
  
  // Crawler
  recordCrawlerExecution,
  recordCrawlerError,
  recordCrawlerStep,
  recordScreenshot,
  
  // Business
  recordOrderCreated,
  recordOrderFailed,
  
  // GCS
  recordGcsUpload
};
