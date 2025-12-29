const EcForceOrderCrawler = require("../services/crawler/EcForceOrderCrawler");
const logger = require("../utils/logger");
const { getErrorMessage } = require("../utils/logger");
const OrderNotificationService = require("../services/order/OrderNotificationService");
const OrderLoggerService = require("../services/order/OrderLoggerService");
const { CrawlerError, ErrorCodes } = require("../middleware/errorHandler");

/**
 * Order controller - handles EC-Force order creation
 */
class OrderController {
  /**
   * Create order via EC-Force crawler
   * POST /api/orders/create
   * Body: { account, customer, form_data }
   */
  static async createOrder(req, res, next) {
    const {
      account: rawAccount,
      customer: rawCustomer,
      form_data: rawFormData,
    } = req.body || {};
    const requestId = req.id;
    logger.info("Order creation request received", { requestId });

    let crawler = null;
    let parsedAccount;
    let parsedCustomer;
    const formData = rawFormData;

    try {
      // Parse JSON strings if needed (validation already done by middleware)
      parsedAccount = OrderController._parseJSON(rawAccount, "account");
      parsedCustomer = OrderController._parseJSON(rawCustomer, "customer");

      // Create crawler instance
      crawler = new EcForceOrderCrawler({
        account: parsedAccount,
        customer: parsedCustomer,
        formData,
      });

      // Execute crawler (await the async execution so controller can catch rejections)
      const result = await crawler.execute();

      logger.info("Order created successfully", {
        requestId,
        orderId: result.data?.order_id,
        orderNumber: result.data?.order_number,
        executionTime: result.executionTime,
      });

      // Fetch EC-Force order detail and log structured params (non-blocking)
      OrderLoggerService.logOrderParams(
        parsedAccount,
        parsedCustomer,
        result.data?.order_id
      ).catch((err) =>
        logger.error(`Failed to log EC-Force order params: ${err.message}`)
      );

      // Send success notification (non-blocking)
      OrderNotificationService.sendOrderSuccessNotification(
        result.data,
        parsedAccount,
        parsedCustomer
      ).catch((err) =>
        logger.error(`Failed to send success notification: ${err.message}`)
      );

      // Return success response
      res.json({
        success: true,
        data: result.data,
        meta: {
          execution_time_ms: result.executionTime,
          request_id: requestId,
        },
      });
    } catch (error) {
      logger.error(`Order creation failed: ${getErrorMessage(error)}`);

      // Send failure notification (non-blocking)
      if (parsedAccount && parsedCustomer) {
        OrderNotificationService.sendOrderFailureNotification(
          parsedAccount,
          parsedCustomer,
          {
            product: formData?.product,
            shopUrl: parsedAccount.options?.ec_force_info?.shop_url,
          }
        ).catch((notifyErr) =>
          logger.error(`Failed to send failure notification: ${notifyErr?.message || String(notifyErr)}`)
        );
      }

      next(error);
    } finally {
      // Ensure browser is closed
      if (crawler) {
        try {
          await crawler.closeBrowser();
        } catch (cleanupError) {
          logger.error("Failed to cleanup crawler", {
            requestId,
            error: cleanupError?.message || String(cleanupError),
          });
        }
      }
    }
  }

  /**
   * Parse JSON string or return object as-is
   */
  static _parseJSON(data, fieldName) {
    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch (error) {
        throw new CrawlerError(
          `Invalid JSON in field: ${fieldName}`,
          ErrorCodes.VALIDATION_ERROR,
          400,
          { parseError: getErrorMessage(error) }
        );
      }
    }

    if (typeof data === "object" && data !== null) {
      return data;
    }

    throw new CrawlerError(
      `Invalid data type for field: ${fieldName}`,
      ErrorCodes.VALIDATION_ERROR,
      400
    );
  }
}

module.exports = OrderController;
