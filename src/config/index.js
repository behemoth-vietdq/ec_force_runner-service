require("dotenv").config();
const { validateConfig } = require("./validation");

const config = {
  server: {
    port: parseInt(process.env.APP_PORT, 10) || 4000,
    host: "0.0.0.0",
    env: process.env.APP_ENV || "development",
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    // graceful shutdown timeout (ms)
    shutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 300000,
    // request / operation timeout (ms) - used to configure server socket timeout
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 300000,
  },

  puppeteer: {
    headless: process.env.CRAWLER_DEBUGGING !== "true",
    defaultViewport: { width: 1920, height: 1080 },
    timeout: parseInt(process.env.PUPPETEER_TIMEOUT, 10) || 300000,
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
    admin: (process.env.API_KEY || "").split(",").filter(Boolean),
  },

  security: {
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== "false",
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
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
