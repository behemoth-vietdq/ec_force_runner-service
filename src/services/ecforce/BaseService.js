const { EcForceAdmin, AuthenticateFail, SignInError } = require('./EcForceAdmin');
const logger = require('../../utils/logger');

class BaseService {
  constructor(context = {}) {
    this.context = context;
    this.ecForceAdmin = null;
  }

  initInfo() {
    const account = this.context.account;
    if (!account) {
      throw new Error('Account required');
    }

    const ecForceInfo = account.options && account.options.ec_force_info;
    const adminEmail = ecForceInfo?.email;
    const adminPassword = ecForceInfo?.password;
    const shopUrl = ecForceInfo?.shop_url;
    const token = ecForceInfo?.token;

    if (!adminEmail || !adminPassword || !shopUrl) {
      throw new Error('missing required fields');
    }

    this.context.ecForceAdmin = new EcForceAdmin(shopUrl, adminEmail, adminPassword, token);
    this.ecForceAdmin = this.context.ecForceAdmin;
  }

  async request(fn) {
    // Mirror the Rails logic: attempt auth if token missing, retry on specific errors
    let needReAuthen = !this.ecForceAdmin.authenticatedToken;
    let newAuthenToken = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (true) {
      try {
        if (needReAuthen && !newAuthenToken) {
          newAuthenToken = await this.ecForceAdmin.getAuthenticateInfo();
          // persist token back to account.options if possible
          try {
            this.context.account.options = this.context.account.options || {};
            this.context.account.options.ec_force_info = this.context.account.options.ec_force_info || {};
            this.context.account.options.ec_force_info.token = newAuthenToken;
            if (typeof this.context.account.save === 'function') {
              await this.context.account.save();
            }
          } catch (e) {
            logger.warn('Failed to persist auth token to account', { error: e.message });
          }
        } else if (newAuthenToken) {
          try {
            this.context.account.options = this.context.account.options || {};
            this.context.account.options.ec_force_info = this.context.account.options.ec_force_info || {};
            this.context.account.options.ec_force_info.token = newAuthenToken;
            if (typeof this.context.account.save === 'function') {
              await this.context.account.save();
            }
          } catch (e) {
            logger.warn('Failed to persist auth token to account', { error: e.message });
          }
        }

        if (newAuthenToken) {
          this.ecForceAdmin.authenticatedToken = newAuthenToken;
        }

        return await fn();
      } catch (err) {
        // Handle AuthenticateFail -> try re-auth
        if (err instanceof AuthenticateFail) {
          needReAuthen = true;
          if (retryCount <= maxRetries) {
            retryCount += 1;
            continue;
          }
        }

        if (err instanceof SignInError) {
          throw new Error('authenticate fail');
        }

        // emulate ActiveRecord::StaleObjectError retry by checking err.name
        if (err.name === 'StaleObjectError' && retryCount <= maxRetries) {
          retryCount += 1;
          continue;
        }

        // other errors: wrap and throw
        throw new Error(`fail to request, error: ${err.message}`);
      }
    }
  }
}

module.exports = BaseService;
