const EcForceOrderCrawler = require("../services/crawler/EcForceOrderCrawler");
const logger = require("../utils/logger");

/**
 * Order controller for handling order creation requests
 */
class OrderController {
  /**
   * Create order using crawler
   * POST /api/orders/create
   */
  static async createOrder(req, res, next) {
    logger.info(
      `Order creation request received - shopUrl: ${req.body.shop_url}, customerId: ${req.body.form_data?.customer_id}`
    );

    let crawler = null;

    try {
      // Extract request data
      const { shop_url, credentials, form_data, options = {} } = req.body;

      // Create crawler instance
      crawler = new EcForceOrderCrawler({
        shopUrl: shop_url,
        credentials,
        formData: form_data,
        headless: options.headless !== undefined ? options.headless : true,
        timeout: options.timeout || 60000,
        debugMode: options.debug_mode || false,
      });

      // Execute crawler
      const result = await crawler.execute();

      // Log success
      logger.info(
        `Order created successfully - orderNumber: ${result.data.order_number}, executionTime: ${result.executionTimeMs}ms`
      );

      // Return response
      res.json({
        success: true,
        data: result.data,
        execution_time_ms: result.executionTimeMs,
      });
    } catch (error) {
      logger.error(`Order creation failed - error: ${error.message}`);

      // Pass error to error handler middleware
      next(error);
    } finally {
      // Ensure browser is closed
      if (crawler) {
        try {
          await crawler.closeBrowser();
        } catch (cleanupError) {
          logger.error("Failed to cleanup crawler:", cleanupError);
        }
      }
    }
  }
}

module.exports = OrderController;
