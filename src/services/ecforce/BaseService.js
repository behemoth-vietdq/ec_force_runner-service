const { EcForceAdmin, AuthenticateFail, SignInError } = require('./EcForceAdmin');
const logger = require('../../utils/logger');

/**
 * BaseService: small, opinionated initializer for EC-Force client usage.
 * - keeps initialization explicit and readable
 * - accepts the `context` object (account, params, etc.)
 * - handles one-shot sign-in only when a token is not provided
 */
class BaseService {
  constructor(context = {}, client = null) {
    this.context = context;
    // allow DI of a pre-built client (useful for tests)
    this.ecForceAdmin = client;
  }

  /**
   * Private method to persist token back to account
   */
  async _persistToken(token) {
    try {
      this.context.account.options = this.context.account.options || {};
      this.context.account.options.ec_force_info = this.context.account.options.ec_force_info || {};
      this.context.account.options.ec_force_info.token = token;
      if (typeof this.context.account.save === 'function') {
        await this.context.account.save();
      }
    } catch (err) {
      logger.warn('BaseService: failed to persist token to account', { error: err.message });
    }
  }

  async initInfo() {
    const account = this.context.account;
    if (!account) throw new Error('Account required');

    const ecForceInfo = account.options && account.options.ec_force_info;
    const adminEmail = ecForceInfo?.email;
    const adminPassword = ecForceInfo?.password;
    const shopUrl = ecForceInfo?.shop_url;
    const providedToken = ecForceInfo?.token || null;

    if (!adminEmail || !adminPassword || !shopUrl) {
      throw new Error('missing required fields: email, password or shop_url');
    }

    // create client if not injected
    if (!this.ecForceAdmin) {
      this.ecForceAdmin = new EcForceAdmin({ shopUrl, adminEmail, adminPassword, token: providedToken });
    }

    // pass through cookie or any extra request headers
    const extra = {};
    if (ecForceInfo?.cookie) extra.Cookie = ecForceInfo.cookie;
    if (ecForceInfo?.request_headers && typeof ecForceInfo.request_headers === 'object') {
      Object.assign(extra, ecForceInfo.request_headers);
    }
    if (Object.keys(extra).length > 0) this.ecForceAdmin.setExtraHeaders(extra);

    // If token not provided in config, perform a one-time sign-in and persist
    if (!providedToken) {
      try {
        const newToken = await this.ecForceAdmin.signIn();
        // store token back to account.options.ec_force_info.token if possible
        await this._persistToken(newToken);
        this.ecForceAdmin.setToken(newToken);
      } catch (err) {
        // Sign-in failed: rethrow a clear error
        throw new Error('authenticate fail');
      }
    }
  }

  /**
   * Execute `fn` with simple re-auth logic.
   * - If account originally provided a token, do NOT attempt automatic sign-in on 401.
   * - Otherwise perform one sign-in and retry once.
   */
  async request(fn) {
    const initialHasToken = !!(this.context.account?.options?.ec_force_info?.token);

    let didSignIn = false;
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        return await fn();
      } catch (err) {
        // clear, intentional handling for auth errors
        if (err instanceof AuthenticateFail) {
          if (initialHasToken) {
            // token was user-provided: do not attempt to sign-in for them
            throw new Error('authenticate fail');
          }

          if (didSignIn) throw new Error('authenticate fail');

          // try sign-in once, then retry
          try {
            const newToken = await this.ecForceAdmin.signIn();
            this.ecForceAdmin.setToken(newToken);
            // persist token into account.options if possible
            await this._persistToken(newToken);
            didSignIn = true;
            continue; // retry the fn
          } catch (signinErr) {
            throw new Error('authenticate fail');
          }
        }

        // Retry a couple of times on optimistic concurrency errors
        if (err && err.name === 'StaleObjectError' && attempt < 3) {
          continue;
        }

        // Bubble other errors up unwrapped (caller can choose how to handle)
        throw err;
      }
    }
  }
}

module.exports = BaseService;
