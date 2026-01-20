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

/**
 * Parse boolean from environment variable
 */
const parseBool = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return value === "true" || value === "1";
};

/**
 * Get environment with validation
 */
const getEnv = () => {
  const env = process.env.APP_ENV || process.env.NODE_ENV || "development";
  const validEnvs = ["development", "staging", "production", "test"];
  return validEnvs.includes(env) ? env : "development";
};

const config = {
  server: {
    port: safeParseInt(process.env.APP_PORT, 4000, 1),
    host: process.env.APP_HOST || "0.0.0.0",
    env: getEnv(),
    corsOrigin: process.env.CORS_ORIGIN || (getEnv() === "production" ? "" : "*"),
    // graceful shutdown timeout (ms)
    shutdownTimeout: safeParseInt(process.env.SHUTDOWN_TIMEOUT_MS, 300000, 1000),
    // request / operation timeout (ms) - used to configure server socket timeout
    requestTimeout: safeParseInt(process.env.REQUEST_TIMEOUT_MS, 300000, 1000),
  },

  puppeteer: {
    headless: !parseBool(process.env.CRAWLER_DEBUGGING, false),
    defaultViewport: { 
      width: safeParseInt(process.env.VIEWPORT_WIDTH, 1920, 800),
      height: safeParseInt(process.env.VIEWPORT_HEIGHT, 1080, 600),
    },
    timeout: safeParseInt(process.env.PUPPETEER_TIMEOUT, 300000, 1000),
  },

  logging: {
    level: process.env.LOG_LEVEL || (getEnv() === "production" ? "info" : "debug"),
    format: process.env.LOG_FORMAT || "json",
    file: process.env.LOG_FILE || "./logs/app.log",
  },

  crawler: {
    debugging: parseBool(process.env.CRAWLER_DEBUGGING, false),
    screenshotsEnabled: !parseBool(process.env.SCREENSHOTS_DISABLED, false),
    screenshotsDir: process.env.SCREENSHOTS_DIR || "screenshots",
  },

  gcs: {
    bucketName: process.env.GCS_BUCKET_NAME || "",
    keyFile: process.env.GCS_KEY_FILE || "",
    projectId: process.env.GCS_PROJECT_ID || "",
    signedUrlExpiry: safeParseInt(process.env.GCS_SIGNED_URL_EXPIRY, 3600000, 60000),
  },

  apiKeys: {
    admin: process.env.API_KEY 
      ? process.env.API_KEY.split(",").map(k => k.trim()).filter(Boolean)
      : [], // Empty array will fail validation in production
  },

  security: {
    enableRateLimit: !parseBool(process.env.DISABLE_RATE_LIMIT, false),
    rateLimitWindowMs: safeParseInt(process.env.RATE_LIMIT_WINDOW_MS, 60000, 1000),
    rateLimitMaxRequests: safeParseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 60, 1),
  },

  lineMessaging: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
    channelSecret: process.env.LINE_CHANNEL_SECRET || "",
  },

  metrics: {
    enabled: !parseBool(process.env.METRICS_DISABLED, false),
    path: process.env.METRICS_PATH || "/metrics",
  },
};

// Validate configuration on load
const validatedConfig = validateConfig(config);

module.exports = validatedConfig;
