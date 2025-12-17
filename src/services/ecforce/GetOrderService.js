const BaseService = require('./BaseService');

class GetOrderService extends BaseService {
  constructor(context = {}) {
    super(context);
  }

  async call() {
    this.initInfo();
    await this.request(async () => {
      const orderId = this.context.orderId || this.context.order_id || this.context.params?.orderId;
      const params = this.context.params || {};
      if (!orderId) throw new Error('orderId required');
      this.context.result = await this.ecForceAdmin.getOrder(orderId, params);
    });
  }
}

module.exports = GetOrderService;
