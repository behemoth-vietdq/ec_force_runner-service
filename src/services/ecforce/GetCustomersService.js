const BaseService = require('./BaseService');

class GetCustomersService extends BaseService {
  async call() {
    await this.initInfo();

    await this.request(async () => {
      const params = this.context.params || {};
      const resp = await this.ecForceAdmin.getCustomers(params);
      this.context.result = resp && resp.body ? resp.body : resp;
    });
  }
}

module.exports = GetCustomersService;
