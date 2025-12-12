const express = require("express");
const rateLimit = require("express-rate-limit");
const OrderController = require("../controllers/orderController");
const HealthController = require("../controllers/healthController");
const {
  createOrderSchema,
  validateRequest,
} = require("../middleware/validateRequest");
const { asyncHandler } = require("../middleware/errorHandler");
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
});

// Health check routes
router.get("/healthz", asyncHandler(HealthController.checkHealth));

// Order routes
router.post(
  "/api/orders/create",
  createOrderLimiter,
  validateRequest(createOrderSchema),
  asyncHandler(OrderController.createOrder)
);

// API info route
router.get("/api", (req, res) => {
  res.json({
    success: true,
    service: "line-shop-runner-service",
    version: require("../../package.json").version,
    endpoints: {
      health: "GET /health",
      status: "GET /health/status",
      createOrder: "POST /api/orders/create",
      testConnection: "POST /api/orders/test-connection",
      orderStatus: "GET /api/orders/status/:requestId",
    },
    documentation: "See README.md for detailed API documentation",
  });
});

module.exports = router;
