const BaseService = require('./BaseService');

class GetCustomersService extends BaseService {
  async call() {
    await this.initInfo();

    await this.request(async () => {
      const params = this.context.params || {};
      const resp = await this.ecForceAdmin.getCustomers(params);
      this.context.result = resp;
    });
  }
}

module.exports = GetCustomersService;
