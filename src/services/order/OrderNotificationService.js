const { sendText, sendFlex } = require("../line/sendMessage");
const logger = require("../../utils/logger");
const { buildSuccessFlex, buildFailureFlex } = require("../line/templates");

/**
 * Service for handling order-related notifications
 */
class OrderNotificationService {
  /**
   * Send LINE notification for successful order creation
   * @param {Object} orderResult - Order result data
   * @param {Object} account - Account data with LINE credentials
   * @param {Object} customer - Customer data with LINE user ID
   */
  static async sendOrderSuccessNotification(orderResult, account, customer) {
    if (!orderResult) {
      logger.warn("No order result available for LINE notification");
      return;
    }

    try {
      // Extract LINE credentials from account.options
      const lineChannelId = account?.options?.line_message_api_channel_id;
      const lineChannelSecret =
        account?.options?.line_message_api_channel_secret;
      const lineAccessToken = account?.options?.line_message_api_channel_token;

      if (!lineChannelId || !lineChannelSecret || !lineAccessToken) {
        logger.info("LINE credentials not configured, skipping notification");
        return;
      }

      // Extract customer LINE user ID
      const customerLineUserId = customer.uid;
      if (!customerLineUserId) {
        logger.info(
          "Customer LINE user ID not available, skipping notification"
        );
        return;
      }

      logger.info(
        `Sending LINE notification to customer: ${customerLineUserId}`
      );

      // prefer using sendMessage helpers that encapsulate LINE API details
      const flexMessage = buildSuccessFlex(orderResult);

      await sendFlex(account, customerLineUserId, [flexMessage]);

      logger.info("LINE notification sent successfully");
    } catch (error) {
      // Don't fail the order if LINE notification fails
      logger.error(`Failed to send LINE notification: ${error.message}`);
    }
  }

  /**
   * Send LINE notification for failed order creation (crawler error)
   * @param {Object} errorInfo - Error information or message
   * @param {Object} account - Account data with LINE credentials
   * @param {Object} customer - Customer data with LINE user ID and display_name
   * @param {Object} [opts] - Optional extras: product, shopUrl
   */
  static async sendOrderFailureNotification(
    account,
    customer,
    opts = {}
  ) {
    try {
      const lineChannelId = account?.options?.line_message_api_channel_id;
      const lineChannelSecret =
        account?.options?.line_message_api_channel_secret;
      const lineAccessToken = account?.options?.line_message_api_channel_token;

      if (!lineChannelId || !lineChannelSecret || !lineAccessToken) {
        logger.info(
          "LINE credentials not configured, skipping failure notification"
        );
        return;
      }

      const customerLineUserId = customer.uid;
      if (!customerLineUserId) {
        logger.info(
          "Customer LINE user ID not available, skipping failure notification"
        );
        return;
      }

      const displayName = customer.display_name || "";
      const product = opts.product || {};
      const shopUrl = opts.shopUrl || account?.options?.ec_force_info?.shop_url || "";

      console.log("flexMessage", shopUrl ) 
      const flexMessage = buildFailureFlex(displayName, product, shopUrl);
      await sendFlex(account, customerLineUserId, [flexMessage]);
    } catch (err) {
      logger.error(`Failed to send LINE failure notification: ${err.message}`);
    }
  }
}

module.exports = OrderNotificationService;
