const express = require("express");
const rateLimit = require("express-rate-limit");
const OrderController = require("../controllers/orderController");
const HealthController = require("../controllers/healthController");
const authMiddleware = require("../middleware/auth");
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
router.get("/healthz/detailed", asyncHandler(HealthController.checkHealthDetailed));

// Order routes
router.post(
  "/api/orders/create",
  authMiddleware,
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
      createOrder: "POST /api/orders/create",
    },
    documentation: "See README.md for detailed API documentation",
  });
});

module.exports = router;
