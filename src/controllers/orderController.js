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
    const { account, customer, form_data } = req.body || {};
    const requestId = req.id;
    
    logger.info("Order creation request received", { requestId });

    let crawler = null;
    let parsedAccount;
    let parsedCustomer;

    try {
      // Parse and validate input data
      parsedAccount = OrderController._parseJSON(account, "account");
      parsedCustomer = OrderController._parseJSON(customer, "customer");

      // Execute order creation
      crawler = new EcForceOrderCrawler({
        account: parsedAccount,
        customer: parsedCustomer,
        formData: form_data,
      });

      const result = await crawler.execute();

      OrderController._logOrderSuccess(requestId, result);
      OrderController._handlePostOrderTasks(parsedAccount, parsedCustomer, form_data, result);

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
      OrderController._handleOrderFailure(parsedAccount, parsedCustomer, form_data, error);
      next(error);
    } finally {
      await OrderController._cleanupCrawler(crawler, requestId);
    }
  }

  /**
   * Log successful order creation
   * @private
   */
  static _logOrderSuccess(requestId, result) {
    logger.info("Order created successfully", {
      requestId,
      orderId: result.data?.order_id,
      orderNumber: result.data?.order_number,
      executionTime: result.executionTime,
    });
  }

  /**
   * Handle post-order tasks (logging and notifications)
   * @private
   */
  static _handlePostOrderTasks(account, customer, formData, result) {
    // Log order parameters (non-blocking)
    OrderLoggerService.logOrderParams(
      account,
      customer,
      result.data?.order_id
    ).catch((err) =>
      logger.error(`Failed to log EC-Force order params: ${getErrorMessage(err)}`)
    );

    // Send success notification (non-blocking)
    OrderNotificationService.sendOrderSuccessNotification(
      result.data,
      account,
      customer
    ).catch((err) =>
      logger.error(`Failed to send success notification: ${getErrorMessage(err)}`)
    );
  }

  /**
   * Handle order creation failure
   * @private
   */
  static _handleOrderFailure(account, customer, formData, error) {
    if (account && customer) {
      OrderNotificationService.sendOrderFailureNotification(
        account,
        customer,
        {
          product: formData?.product,
          shopUrl: account.options?.ec_force_info?.shop_url,
        }
      ).catch((notifyErr) =>
        logger.error(`Failed to send failure notification: ${notifyErr?.message || String(notifyErr)}`)
      );
    }
  }

  /**
   * Clean up crawler resources
   * @private
   */
  static async _cleanupCrawler(crawler, requestId) {
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
