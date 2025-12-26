const BaseService = require('./BaseService');

class GetOrderService extends BaseService {
  async call() {
    await this.initInfo();

    await this.request(async () => {
      const orderId = this.context.orderId || this.context.order_id || this.context.params?.orderId;
      if (!orderId) throw new Error('orderId required');

      const params = this.context.params || {};
      const resp = await this.ecForceAdmin.getOrder(orderId, params);
      this.context.result = resp && resp.body ? resp.body : resp;
    });
  }
}

module.exports = GetOrderService;
