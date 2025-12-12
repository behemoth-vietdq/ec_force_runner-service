const logger = require('../utils/logger');
const config = require('../config');
const puppeteer = require('puppeteer');
const { getAllStatuses } = require('../utils/circuitBreaker');
const { getBrowserPool } = require('../utils/browserPool');

/**
 * Health check controller with comprehensive checks
 */
class HealthController {
  /**
   * Basic health check with system metrics
   */
  static async checkHealth(req, res) {
    const healthcheck = {
      uptime: process.uptime(),
      message: "OK",
      timestamp: Date.now(),
      environment: config.server.env,
    };
    res.status(200).json(healthcheck);
  }

  /**
   * Detailed health check with dependency checks
   */
  static async checkHealthDetailed(req, res) {
    const checks = {
      uptime: process.uptime(),
      timestamp: Date.now(),
      environment: config.server.env,
      status: 'healthy',
      checks: {},
    };

    // Memory check
    const memUsage = process.memoryUsage();
    checks.checks.memory = {
      status: 'ok',
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    };

    // Browser check
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: 5000,
      });
      await browser.close();
      checks.checks.browser = { status: 'ok', message: 'Browser can launch' };
    } catch (error) {
      checks.checks.browser = { status: 'error', message: error.message };
      checks.status = 'degraded';
    }

    // GCS check (if configured)
    if (config.gcs.bucketName && config.gcs.keyFile) {
      try {
        const { Storage } = require('@google-cloud/storage');
        const storage = new Storage({
          keyFilename: config.gcs.keyFile,
          projectId: config.gcs.projectId,
        });
        const bucket = storage.bucket(config.gcs.bucketName);
        await bucket.exists();
        checks.checks.gcs = { status: 'ok', message: 'GCS accessible' };
      } catch (error) {
        checks.checks.gcs = { status: 'error', message: error.message };
        checks.status = 'degraded';
      }
    } else {
      checks.checks.gcs = { status: 'not_configured', message: 'GCS not configured' };
    }

    // Circuit breaker status
    checks.checks.circuitBreakers = getAllStatuses();

    // Browser pool status
    try {
      const browserPool = getBrowserPool();
      const poolHealth = await browserPool.healthCheck();
      checks.checks.browserPool = {
        status: poolHealth.healthy ? 'ok' : 'degraded',
        stats: poolHealth.stats,
        issues: poolHealth.issues
      };
      
      if (!poolHealth.healthy) {
        checks.status = 'degraded';
      }
    } catch (error) {
      checks.checks.browserPool = {
        status: 'not_initialized',
        message: 'Browser pool not initialized'
      };
    }

    const statusCode = checks.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(checks);
  }
}

module.exports = HealthController;
