require("dotenv").config();

module.exports = {
  server: {
    port: parseInt(process.env.APP_PORT, 10) || 4000,
    host: "0.0.0.0",
    env: process.env.APP_ENV || "development",
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    apiKey: process.env.API_KEY,
  },

  puppeteer: {
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
    timeout: 60000,
  },

  logging: {
    level: "info",
    file: "./logs/app.log",
  },

  screenshots: {
    enabled: true,
    path: "./screenshots",
  },

  security: {
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== "false",
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  crawler: {
    maxRetries: parseInt(process.env.CRAWLER_MAX_RETRIES, 10) || 3,
    retryDelayMs: parseInt(process.env.CRAWLER_RETRY_DELAY_MS, 10) || 2000,
    debugging: process.env.CRAWLER_DEBUGGING === "true",
    browserTimeout: parseInt(process.env.BROWSER_TIMEOUT, 10) || 60000,
  },

  gcs: {
    bucketName: process.env.GCS_BUCKET_NAME,
    keyFile: process.env.GCS_KEY_FILE,
    projectId: process.env.GCS_PROJECT_ID,
    signedUrlExpiry: parseInt(process.env.GCS_SIGNED_URL_EXPIRY, 10) || 3600000,
  },

  redis: {
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    path: process.env.METRICS_PATH || '/metrics',
  },
};
