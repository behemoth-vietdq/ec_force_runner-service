require("dotenv").config();
const { validateConfig } = require("./validation");

/**
 * Safely parse integer with fallback
 * Returns fallback if value is NaN, undefined, or invalid
 */
const safeParseInt = (value, fallback, min = 0) => {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
};

const config = {
  server: {
    port: safeParseInt(process.env.APP_PORT, 4000, 1),
    host: "0.0.0.0",
    env: process.env.APP_ENV || "development",
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    // graceful shutdown timeout (ms)
    shutdownTimeout: safeParseInt(process.env.SHUTDOWN_TIMEOUT_MS, 300000, 1000),
    // request / operation timeout (ms) - used to configure server socket timeout
    requestTimeout: safeParseInt(process.env.REQUEST_TIMEOUT_MS, 300000, 1000),
  },

  puppeteer: {
    headless: process.env.CRAWLER_DEBUGGING !== "true",
    defaultViewport: { width: 1920, height: 1080 },
    timeout: safeParseInt(process.env.PUPPETEER_TIMEOUT, 300000, 1000),
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: process.env.LOG_FORMAT || "json",
    file: process.env.LOG_FILE || "./logs/app.log",
  },

  crawler: {
    debugging: process.env.CRAWLER_DEBUGGING === "true",
    screenshotsEnabled: process.env.SCREENSHOTS_ENABLED !== "false",
    screenshotsDir: process.env.SCREENSHOTS_DIR || "screenshots",
  },

  gcs: {
    bucketName: process.env.GCS_BUCKET_NAME,
    keyFile: process.env.GCS_KEY_FILE,
    projectId: process.env.GCS_PROJECT_ID,
  },

  apiKeys: {
    admin: process.env.API_KEY 
      ? process.env.API_KEY.split(",").filter(Boolean)
      : [], // Empty array will fail validation
  },

  security: {
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== "false",
    rateLimitWindowMs: safeParseInt(process.env.RATE_LIMIT_WINDOW_MS, 60000, 1000),
    rateLimitMaxRequests: safeParseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 60, 1),
  },

  lineMessaging: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED !== "false",
    path: process.env.METRICS_PATH || "/metrics",
  },
};

// Validate configuration on load
const validatedConfig = validateConfig(config);

module.exports = validatedConfig;
