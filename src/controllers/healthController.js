const logger = require('../utils/logger');
const { getErrorMessage } = require('../utils/logger');
const config = require('../config');
const puppeteer = require('puppeteer');

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
    const checks = await HealthController._performHealthChecks();
    const statusCode = checks.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(checks);
  }

  /**
   * Perform all health checks
   * @private
   */
  static async _performHealthChecks() {
    const checks = {
      uptime: process.uptime(),
      timestamp: Date.now(),
      environment: config.server.env,
      status: 'healthy',
      checks: {},
    };

    checks.checks.memory = HealthController._checkMemory();
    checks.checks.browser = await HealthController._checkBrowser();
    checks.checks.gcs = await HealthController._checkGCS();

    // Update overall status based on individual checks
    if (HealthController._hasErrors(checks.checks)) {
      checks.status = 'degraded';
    }

    return checks;
  }

  /**
   * Check memory usage
   * @private
   */
  static _checkMemory() {
    const memUsage = process.memoryUsage();
    return {
      status: 'ok',
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    };
  }

  /**
   * Check browser availability
   * @private
   */
  static async _checkBrowser() {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: 5000,
      });
      await browser.close();
      return { status: 'ok', message: 'Browser can launch' };
    } catch (error) {
      return { status: 'error', message: getErrorMessage(error) };
    }
  }

  /**
   * Check GCS availability
   * @private
   */
  static async _checkGCS() {
    if (!config.gcs.bucketName || !config.gcs.keyFile) {
      return { status: 'not_configured', message: 'GCS not configured' };
    }

    try {
      const { Storage } = require('@google-cloud/storage');
      const storage = new Storage({
        keyFilename: config.gcs.keyFile,
        projectId: config.gcs.projectId,
      });
      const bucket = storage.bucket(config.gcs.bucketName);
      await bucket.exists();
      return { status: 'ok', message: 'GCS accessible' };
    } catch (error) {
      return { status: 'error', message: getErrorMessage(error) };
    }
  }

  /**
   * Check if any check has errors
   * @private
   */
  static _hasErrors(checks) {
    return Object.values(checks).some(check => check.status === 'error');
  }
}

module.exports = HealthController;
