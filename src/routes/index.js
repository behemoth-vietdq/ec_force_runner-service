const express = require("express");
const rateLimit = require("express-rate-limit");
const OrderController = require("../controllers/orderController");
const HealthController = require("../controllers/healthController");
const authMiddleware = require("../middleware/auth");
const OrderValidation = require("../middleware/orderValidation");
const { asyncHandler } = require("../middleware/errorHandler");
const { getMetrics } = require("../utils/metrics");
const config = require("../config");

const router = express.Router();

// Rate limiter configuration
const createOrderLimiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please try again later",
    },
  },
  skip: () => !config.security.enableRateLimit,
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
});

// Health check routes (no auth required)
router.get("/healthz", asyncHandler(HealthController.checkHealth));
router.get("/healthz/detailed", asyncHandler(HealthController.checkHealthDetailed));

// Prometheus metrics endpoint (no auth required for scraping)
if (config.metrics.enabled) {
  router.get(config.metrics.path, getMetrics);
}

// Readiness probe for Kubernetes
router.get("/ready", asyncHandler(HealthController.checkHealth));

// Liveness probe for Kubernetes
router.get("/live", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Order routes (auth required)
router.post(
  "/api/orders/create",
  authMiddleware,
  createOrderLimiter,
  OrderValidation.sanitizeBody,
  OrderValidation.validateCreateOrder,
  asyncHandler(OrderController.createOrder)
);

// API info route
router.get("/api", (req, res) => {
  res.json({
    success: true,
    service: "line-shop-runner-service",
    version: require("../../package.json").version,
    environment: config.server.env,
    endpoints: {
      health: "GET /healthz",
      healthDetailed: "GET /healthz/detailed",
      ready: "GET /ready",
      live: "GET /live",
      metrics: config.metrics.enabled ? `GET ${config.metrics.path}` : "disabled",
      createOrder: "POST /api/orders/create",
    },
    documentation: "See README.md for detailed API documentation",
  });
});

module.exports = router;
