/**
 * Prometheus Metrics for Monitoring
 * Provides comprehensive metrics for production monitoring with Grafana/Prometheus
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

// ==================== Browser Pool Metrics ====================

const browserPoolSize = new client.Gauge({
  name: 'browser_pool_size',
  help: 'Number of browser instances in pool by status',
  labelNames: ['status'], // available, in_use, total
  registers: [register]
});

const browserPoolWaitTime = new client.Histogram({
  name: 'browser_pool_wait_time_seconds',
  help: 'Time spent waiting for available browser',
  buckets: [0.01, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

const browserInstanceAge = new client.Histogram({
  name: 'browser_instance_age_seconds',
  help: 'Age of browser instances when retired',
  buckets: [60, 300, 600, 1200, 1800, 3600],
  registers: [register]
});

const browserInstanceUsage = new client.Histogram({
  name: 'browser_instance_usage_count',
  help: 'Number of times a browser instance was used before retirement',
  buckets: [10, 25, 50, 75, 100, 150, 200],
  registers: [register]
});

// ==================== Circuit Breaker Metrics ====================

const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
  labelNames: ['service', 'name'],
  registers: [register]
});

const circuitBreakerFailures = new client.Counter({
  name: 'circuit_breaker_failures_total',
  help: 'Total number of failures recorded by circuit breaker',
  labelNames: ['service', 'name'],
  registers: [register]
});

const circuitBreakerOpenDuration = new client.Histogram({
  name: 'circuit_breaker_open_duration_seconds',
  help: 'Duration circuit breaker stayed in OPEN state',
  labelNames: ['service', 'name'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register]
});

const circuitBreakerTransitions = new client.Counter({
  name: 'circuit_breaker_state_transitions_total',
  help: 'Number of circuit breaker state transitions',
  labelNames: ['service', 'name', 'from_state', 'to_state'],
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
 * Update browser pool metrics
 */
function updateBrowserPoolMetrics(stats) {
  browserPoolSize.labels('total').set(stats.total);
  browserPoolSize.labels('available').set(stats.available);
  browserPoolSize.labels('in_use').set(stats.inUse);
}

/**
 * Record browser wait time
 */
function recordBrowserWaitTime(seconds) {
  browserPoolWaitTime.observe(seconds);
}

/**
 * Record browser retirement
 */
function recordBrowserRetirement(ageSeconds, usageCount) {
  browserInstanceAge.observe(ageSeconds);
  browserInstanceUsage.observe(usageCount);
}

/**
 * Update circuit breaker state
 */
function updateCircuitBreakerState(service, name, state) {
  const stateMap = { CLOSED: 0, HALF_OPEN: 1, OPEN: 2 };
  circuitBreakerState.labels(service, name).set(stateMap[state] || 0);
}

/**
 * Record circuit breaker failure
 */
function recordCircuitBreakerFailure(service, name) {
  circuitBreakerFailures.labels(service, name).inc();
}

/**
 * Record circuit breaker state transition
 */
function recordCircuitBreakerTransition(service, name, fromState, toState) {
  circuitBreakerTransitions.labels(service, name, fromState, toState).inc();
}

/**
 * Record circuit breaker open duration
 */
function recordCircuitBreakerOpenDuration(service, name, seconds) {
  circuitBreakerOpenDuration.labels(service, name).observe(seconds);
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
  
  // Browser Pool
  updateBrowserPoolMetrics,
  recordBrowserWaitTime,
  recordBrowserRetirement,
  
  // Circuit Breaker
  updateCircuitBreakerState,
  recordCircuitBreakerFailure,
  recordCircuitBreakerTransition,
  recordCircuitBreakerOpenDuration,
  
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
