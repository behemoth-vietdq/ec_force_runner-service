const logger = require('../../utils/logger');
const GetOrderService = require('../ecforce/GetOrderService');

function safeString(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}

function jsonOrNull(value) {
  try {
    return value == null ? null : JSON.stringify(value);
  } catch (e) {
    return null;
  }
}

function buildLog({
  kind = 'order_created',
  accountId = '',
  customerId = '',
  resourceType = 'Order',
  resource = {},
  data = null,
  customer = null,
  orderItems = null,
}) {
  return {
    timestamp: new Date().toISOString(),
    logType: 'ecforce',
    category: kind,
    params: {
      account_id: safeString(accountId),
      customer_id: safeString(customerId),
    },
    ecforce_params: {
      resource_type: resourceType,
      resource_id: safeString(resource.id || ''),
      resource_number: resource.number || null,
      created_at: resource.created_at || null,
      subs_order_id: safeString(resource.subs_order_id || ''),
    },
    data: jsonOrNull(data),
    customer: jsonOrNull(customer),
    order_items: jsonOrNull(orderItems),
  };
}

/**
 * Fetch EC-Force order via GetOrderService and log structured params
 * @param {Object} account - account object with options.ec_force_info
 * @param {Object} customer - optional customer object (local)
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

    const included = Array.isArray(ec_order.included) ? ec_order.included : [];

    const customerObj = included.find((i) => i.type === 'customer') || null;
    const orderItemIds = (ec_order?.data?.relationships?.order_items?.data || []).map((i) => i.id);
    const orderItems = included.filter((i) => i.type === 'order_item' && orderItemIds.includes(i.id));
    const subsOrder = included.find((i) => i.type === 'sub_order') || null;
    const orderAttrs = (ec_order?.data && ec_order.data.attributes) ? ec_order.data.attributes : {};

    const mainLog = buildLog({
      kind: 'order_created',
      accountId: account.id,
      customerId: customer?.id || customerObj?.id,
      resource: orderAttrs,
      data: ec_order,
      customer: customerObj,
      orderItems,
    });

    logger.info(mainLog);

    // Log subs order if present
    if (orderAttrs.subs_order_id || subsOrder) {
      const subsOrderAttrs = subsOrder?.attributes || {};
      const subsOrderItemIds = (subsOrder?.relationships?.order_items?.data || []).map((i) => i.id);
      const subsOrderItems = included.filter((i) => i.type === 'order_item' && subsOrderItemIds.includes(i.id));
      const initOrderId = (subsOrder?.relationships?.orders?.data || []).map((i) => i.id)[0] || '';

      const subLog = buildLog({
        kind: 'subs_order_created',
        accountId: account.id,
        customerId: customer?.id || customerObj?.id,
        resourceType: 'SubsOrder',
        resource: subsOrderAttrs,
        data: subsOrder,
        customer: customerObj,
        orderItems: subsOrderItems,
      });

      // add init_order_id explicitly
      subLog.ecforce_params.init_order_id = safeString(initOrderId);
      logger.info(subLog);
    }

    return ec_order;
  } catch (err) {
    logger.error('OrderLoggerService failed to fetch/log order', { message: err.message, stack: err.stack });
    return null;
  }
}

module.exports = {
  logOrderParams,
};
