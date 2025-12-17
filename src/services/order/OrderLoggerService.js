const logger = require("../../utils/logger");
const GetOrderService = require("../ecforce/GetOrderService");

/**
 * Fetch EC-Force order via GetOrderService and log structured params
 * @param {Object} account - account object with options.ec_force_info
 * @param {Object} customer - customer object
 * @param {string} orderId - order id (EC-Force internal id)
 */
async function logOrderParams(account, customer, orderId) {
  if (!account || !orderId) return null;

  const context = { account, orderId, params: {} };

  try {
    const svc = new GetOrderService(context);
    await svc.call();
    const ec_order = context.result;
    if (!ec_order) return null;

    const included = ec_order.included || [];

    const customerObj = included.find((i) => i.type === "customer");
    const orderItemIds = (
      ec_order?.data?.relationships?.order_items?.data || []
    ).map((i) => i.id);
    const orderItems = included.filter(
      (i) => i.type === "order_item" && orderItemIds.includes(i.id)
    );
    const subsOrder = included.find((i) => i.type === "sub_order");
    const orderAttrs = ec_order?.data?.attributes || {};

    const order_log_params = {
      timestamp: new Date().toISOString(),
      logType: "ecforce",
      category: "order_created",
      params: {
        account_id: String(account.id || ""),
        customer_id: String(customer?.id || customerObj?.id || ""),
      },
      ecforce_params: {
        resource_type: "Order",
        resource_id: String(orderAttrs.id || ""),
        resource_number: orderAttrs.number || null,
        created_at: orderAttrs.created_at || null,
        subs_order_id: String(orderAttrs.subs_order_id || ""),
      },
      data: JSON.stringify(ec_order),
      customer: customerObj ? JSON.stringify(customerObj) : null,
      order_items: orderItems.length ? JSON.stringify(orderItems) : null,
    };

    logger.info(order_log_params);

    // If subs order exists or subs_order_id present, log subs order
    if (orderAttrs.subs_order_id || subsOrder) {
      const subsOrderAttrs = subsOrder?.attributes || {};
      const subsOrderItemIds = (
        subsOrder?.relationships?.order_items?.data || []
      ).map((i) => i.id);
      const subsOrderItems = included.filter(
        (i) => i.type === "order_item" && subsOrderItemIds.includes(i.id)
      );
      const initOrderId = (subsOrder?.relationships?.orders?.data || []).map(
        (i) => i.id
      )[0];

      const sub_order_log_params = {
        timestamp: new Date().toISOString(),
        logType: "ecforce",
        category: "subs_order_created",
        params: {
          account_id: String(account.id || ""),
          customer_id: String(customer?.id || customerObj?.id || ""),
        },
        ecforce_params: {
          resource_type: "SubsOrder",
          resource_id: String(subsOrderAttrs.id || ""),
          resource_number: subsOrderAttrs.number || null,
          created_at: subsOrderAttrs.created_at || null,
          init_order_id: String(initOrderId || ""),
        },
        data: subsOrder ? JSON.stringify(subsOrder) : null,
        customer: customerObj ? JSON.stringify(customerObj) : null,
        order_items: subsOrderItems.length
          ? JSON.stringify(subsOrderItems)
          : null,
      };

      logger.info(sub_order_log_params);
    }

    return ec_order;
  } catch (err) {
    logger.error(
      `OrderLoggerService failed to fetch/log order: ${err.message}`
    );
    return null;
  }
}

module.exports = {
  logOrderParams,
};
