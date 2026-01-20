/**
 * Configuration Validation with Joi
 * 
 * Validates environment variables and configuration on startup
 * to catch missing or invalid configuration early.
 */

const Joi = require('joi');

/**
 * Determine if running in production-like environment
 */
const isProduction = () => {
  const env = process.env.APP_ENV || process.env.NODE_ENV || 'development';
  return env === 'production' || env === 'staging';
};

/**
 * Configuration schema
 * - In production: API keys are required
 * - In development: API keys are optional (allows easier local testing)
 */
const configSchema = Joi.object({
  // Server configuration
  server: Joi.object({
    env: Joi.string().valid('development', 'staging', 'production', 'test').required(),
    host: Joi.string().default('0.0.0.0'),
    port: Joi.number().integer().min(1).max(65535).default(4000),
    corsOrigin: Joi.string().allow('').default('*'),
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
    timeout: Joi.number().integer().min(1000).default(300000),
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
    projectId: Joi.string().allow('').optional(),
    bucketName: Joi.string().allow('').optional(),
    keyFile: Joi.string().allow('').optional(),
    signedUrlExpiry: Joi.number().integer().min(60000).default(3600000),
  }).optional(),

  // API keys - required in production, optional in development
  apiKeys: Joi.object({
    admin: isProduction()
      ? Joi.array().items(Joi.string().min(16)).min(1).required()
        .messages({
          'array.min': 'At least one API key is required in production',
          'string.min': 'API keys must be at least 16 characters long',
        })
      : Joi.array().items(Joi.string()).default([]),
  }).required(),

  // Security configuration
  security: Joi.object({
    enableRateLimit: Joi.boolean().default(true),
    rateLimitWindowMs: Joi.number().integer().min(1000).default(60000),
    rateLimitMaxRequests: Joi.number().integer().min(1).default(60),
  }).required(),

  // LINE messaging API configuration (optional)
  lineMessaging: Joi.object({
    channelAccessToken: Joi.string().allow('').optional(),
    channelSecret: Joi.string().allow('').optional(),
  }).optional(),

  // Metrics configuration
  metrics: Joi.object({
    enabled: Joi.boolean().default(true),
    path: Joi.string().default('/metrics'),
  }).required(),
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
    
    // In production, throw error immediately
    if (isProduction()) {
      throw new Error(errorMessage);
    }
    
    // In development, log warning but continue
    console.warn(`⚠️  ${errorMessage}`);
    console.warn('⚠️  Continuing with defaults in development mode...\n');
  }

  return value;
}

/**
 * Validate that required production settings are configured
 * Call this before starting the server in production
 */
function validateProductionConfig(config) {
  const errors = [];

  if (config.server.env === 'production') {
    // Check API keys
    if (!config.apiKeys.admin || config.apiKeys.admin.length === 0) {
      errors.push('API_KEY environment variable is required in production');
    }

    // Check CORS origin
    if (config.server.corsOrigin === '*') {
      errors.push('CORS_ORIGIN should not be "*" in production');
    }

    // Check debugging is disabled
    if (config.crawler.debugging) {
      errors.push('CRAWLER_DEBUGGING should be false in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Production configuration errors:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  return true;
}

module.exports = {
  validateConfig,
  validateProductionConfig,
  configSchema,
};
