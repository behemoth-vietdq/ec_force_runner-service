/*
 * Minimal EcForceAdmin client stub.
 *
 * This file provides a small client interface used by the service wrappers.
 * Implement actual HTTP calls according to your EC-Force admin API.
 */

class AuthenticateFail extends Error {}
class SignInError extends Error {}

class EcForceAdmin {
  constructor(shopUrl, adminEmail, adminPassword, authenticatedToken = null) {
    this.shopUrl = shopUrl;
    this.adminEmail = adminEmail;
    this.adminPassword = adminPassword;
    this.authenticatedToken = authenticatedToken;
  }

  // Example: implement to perform authentication and return a token string
  async getAuthenticateInfo() {
    // TODO: Replace with real authentication logic to EC-Force admin
    // e.g. call POST `${this.shopUrl}/api/admin/auth` with credentials
    throw new AuthenticateFail('getAuthenticateInfo not implemented');
  }

  // Example: implement to retrieve customers list
  async getCustomers(params = {}) {
    // TODO: Replace with real API call
    throw new Error('getCustomers not implemented');
  }

  // Example: implement to fetch a single order
  async getOrder(orderId, params = {}) {
    // TODO: Replace with real API call
    throw new Error('getOrder not implemented');
  }
}

module.exports = {
  EcForceAdmin,
  AuthenticateFail,
  SignInError,
};
