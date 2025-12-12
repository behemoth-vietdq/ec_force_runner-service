require("dotenv").config();

module.exports = {
  server: {
    port: process.env.APP_PORT || 3000,
    host: "0.0.0.0",
    env: process.env.APP_ENV || "development",
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
    enableRateLimit: false,
    rateLimitWindowMs: 900000,
    rateLimitMaxRequests: 100,
  },

  crawler: {
    maxRetries: 3,
    retryDelayMs: 2000,
    debugging: process.env.CRAWLER_DEBUGGING === "true",
  },

  gcs: {
    bucketName: process.env.GCS_BUCKET_NAME,
    keyFile: process.env.GCS_KEY_FILE,
    projectId: process.env.GCS_PROJECT_ID,
  },
};
