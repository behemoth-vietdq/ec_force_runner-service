/**
 * Health check controller
 */
class HealthController {
  /**
   * Basic health check
   */
  static async checkHealth(req, res) {
    const healthcheck = {
      uptime: process.uptime(),
      message: "OK",
      timestamp: Date.now(),
      environment: process.env.APP_ENV || "development",
    };
    res.status(200).json(healthcheck);
  }
}

module.exports = HealthController;
