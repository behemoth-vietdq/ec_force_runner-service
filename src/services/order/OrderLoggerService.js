const logger = require('../../utils/logger');
const GetOrderService = require('../ecforce/GetOrderService');

/**
 * Helper functions for data formatting
 */
function safeString(value) {
  return (value === undefined || value === null) ? '' : String(value);
}

function jsonOrNull(value) {
  try {
    if (value == null) return null;
    if (Array.isArray(value) && value.length === 0) return null;
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * Build structured log object for order
 */
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

    const ecOrder = context.result;
    if (!ecOrder) return null;

    const { orderData, included } = extractOrderData(ecOrder);
    const { customerObj, orderItems, subsOrder, orderAttrs } = parseOrderIncludes(orderData, included);

    logMainOrder(account, customer, customerObj, orderAttrs, orderData, orderItems);
    logSubsOrder(account, customer, customerObj, orderAttrs, subsOrder, included);

    return ecOrder;
  } catch (err) {
    logger.error('OrderLoggerService failed to fetch/log order', { 
      message: err.message, 
      stack: err.stack 
    });
    return null;
  }
}

/**
 * Extract order data and included resources
 * @private
 */
function extractOrderData(ecOrder) {
  const orderData = ecOrder.body || ecOrder;
  const included = Array.isArray(orderData.included) ? orderData.included : [];
  return { orderData, included };
}

/**
 * Parse order includes to extract related objects
 * @private
 */
function parseOrderIncludes(orderData, included) {
  const customerObj = included.find((i) => i.type === 'customer') || null;
  const orderItemIds = (orderData?.data?.relationships?.order_items?.data || []).map((i) => i.id);
  const orderItems = included.filter((i) => i.type === 'order_item' && orderItemIds.includes(i.id));
  const subsOrder = included.find((i) => i.type === 'sub_order') || null;
  const orderAttrs = (orderData?.data && orderData.data.attributes) ? orderData.data.attributes : {};

  return { customerObj, orderItems, subsOrder, orderAttrs };
}

/**
 * Log main order information
 * @private
 */
function logMainOrder(account, customer, customerObj, orderAttrs, orderData, orderItems) {
  const mainLog = buildLog({
    kind: 'order_created',
    accountId: account.id,
    customerId: customer?.id || customerObj?.id,
    resource: orderAttrs,
    data: orderData,
    customer: customerObj,
    orderItems,
  });

  logger.info(mainLog);
}

/**
 * Log subscription order if present
 * @private
 */
function logSubsOrder(account, customer, customerObj, orderAttrs, subsOrder, included) {
  if (!orderAttrs.subs_order_id && !subsOrder) return;

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

  subLog.ecforce_params.init_order_id = safeString(initOrderId);
  logger.info(subLog);
}

module.exports = {
  logOrderParams,
};
