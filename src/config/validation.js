/**
 * Configuration Validation with Joi
 * 
 * Validates environment variables and configuration on startup
 * to catch missing or invalid configuration early.
 */

const Joi = require('joi');

/**
 * Configuration schema
 */
const configSchema = Joi.object({
  // Server configuration
  server: Joi.object({
    env: Joi.string().valid('development', 'staging', 'production').required(),
    host: Joi.string().default('0.0.0.0'),
    port: Joi.number().integer().min(1).max(65535).default(3000),
    corsOrigin: Joi.string().default('*'),
    requestTimeout: Joi.number().integer().min(1000).default(300000),
    shutdownTimeout: Joi.number().integer().min(1000).default(300000),
  }).required(),

  // Logging configuration
  logging: Joi.object({
    level: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    format: Joi.string().valid('json', 'simple').default('json'),
    file: Joi.string().default('./logs/app.log'),
  }).required(),

  // Puppeteer configuration
  puppeteer: Joi.object({
    headless: Joi.boolean().default(true),
    timeout: Joi.number().integer().min(1000).default(30000),
    defaultViewport: Joi.object({
      width: Joi.number().integer().min(800).default(1920),
      height: Joi.number().integer().min(600).default(1080),
    }).default(),
    args: Joi.array().items(Joi.string()).default([]),
    userAgent: Joi.string().optional(),
  }).required(),

  // Crawler configuration
  crawler: Joi.object({
    debugging: Joi.boolean().default(false),
    screenshotsEnabled: Joi.boolean().default(true),
    screenshotsDir: Joi.string().default('screenshots'),
  }).required(),

  // GCS configuration (optional)
  gcs: Joi.object({
    projectId: Joi.string().optional(),
    bucketName: Joi.string().optional(),
    keyFile: Joi.string().optional(),
  }).optional(),

  // API keys
  apiKeys: Joi.object({
    admin: Joi.array().items(Joi.string()).min(1).required(),
  }).required(),

  // LINE messaging API configuration (optional)
  lineMessaging: Joi.object({
    channelAccessToken: Joi.string().optional(),
    channelSecret: Joi.string().optional(),
  }).optional(),
}).unknown(true); // Allow unknown keys for constants

/**
 * Validate configuration object
 * 
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validated configuration
 * @throws {Error} If validation fails
 */
function validateConfig(config) {
  const { error, value } = configSchema.validate(config, {
    abortEarly: false, // Show all errors
    stripUnknown: false, // Keep unknown keys
  });

  if (error) {
    const errorMessages = error.details.map(detail => {
      return `  - ${detail.path.join('.')}: ${detail.message}`;
    }).join('\n');

    const errorMessage = `Configuration validation failed:\n${errorMessages}`;
    throw new Error(errorMessage);
  }

  return value;
}

module.exports = {
  validateConfig,
  configSchema,
};
