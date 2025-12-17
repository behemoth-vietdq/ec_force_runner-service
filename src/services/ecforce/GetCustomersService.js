const BaseService = require('./BaseService');

class GetCustomersService extends BaseService {
  constructor(context = {}) {
    super(context);
  }

  async call() {
    this.initInfo();
    await this.request(async () => {
      const params = this.context.params || {};
      this.context.result = await this.ecForceAdmin.getCustomers(params);
    });
  }
}

module.exports = GetCustomersService;
