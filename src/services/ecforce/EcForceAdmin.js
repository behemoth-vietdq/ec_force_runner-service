/*
 * Clean, small EC-Force admin HTTP client.
 * - explicit constructor with options
 * - clear `signIn()`, `request()` and convenience helpers
 * - simple retry/backoff for 429
 */

const axios = require("axios");
const FormData = require("form-data");
const logger = require("../../utils/logger");

class AuthenticateFail extends Error {}
class SignInError extends Error {}
class TooManyRequest extends Error {}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const mask = (s) =>
  typeof s === "string" && s.length > 6
    ? `${s.slice(0, 4)}***${s.slice(-2)}`
    : s;

function normalizeShopUrl(raw) {
  try {
    const u = new URL(raw);
    u.username = "";
    u.password = "";
    return u.origin;
  } catch (e) {
    return raw;
  }
}

class EcForceAdmin {
  constructor(options = {}) {
    const {
      shopUrl,
      adminEmail,
      adminPassword,
      token = null,
      extraHeaders = {},
    } = options;
    if (!shopUrl || !adminEmail || !adminPassword) {
      throw new Error(
        "EcForceAdmin: shopUrl, adminEmail and adminPassword are required"
      );
    }

    this.baseUrl = normalizeShopUrl(String(shopUrl)).replace(/\/*$/, "");
    this.adminEmail = adminEmail;
    this.adminPassword = adminPassword;
    this.token = token || null;
    this.extraHeaders = { ...(extraHeaders || {}) };
    if (!token && (!adminEmail || !adminPassword)) {
      throw new Error(
        "EcForceAdmin: adminEmail and adminPassword are required when token is not provided"
      );
    }

    this.http = axios.create({ baseURL: this.baseUrl, timeout: 30000 });
    if (this.token) this._attachAuthHeader(this.token);
  }

  _attachAuthHeader(token) {
    this.token = token;
    this.http.defaults.headers.common = this.http.defaults.headers.common || {};
    this.http.defaults.headers.common[
      "Authorization"
    ] = `Token token="${token}"`;
  }

  setToken(token) {
    if (!token) return;
    this._attachAuthHeader(token);
  }

  setExtraHeaders(headers = {}) {
    this.extraHeaders = Object.assign({}, this.extraHeaders, headers || {});
  }

  async signIn() {
    const url = "/api/v2/admins/sign_in.json";
    const form = new FormData();
    form.append("admin[email]", this.adminEmail);
    form.append("admin[password]", this.adminPassword);

    try {
      const resp = await this.http.post(url, form, {
        headers: form.getHeaders(),
      });
      if (resp.status !== 200) throw new SignInError("signIn failed");
      const token = resp.data && resp.data.authentication_token;
      if (!token)
        throw new SignInError("no authentication_token in signIn response");
      this.setToken(token);
      return token;
    } catch (err) {
      logger.warn("EcForceAdmin.signIn error", {
        status: err?.response?.status,
        body: err?.response?.data,
      });
      if (err?.response?.status === 401)
        throw new SignInError("invalid credentials");
      throw err;
    }
  }

  async request(method, path, { params = {}, data = null } = {}) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt += 1;
      try {
        const url = path.startsWith("/") ? path : `/${path}`;

        // Build headers per-request to avoid accidental mutation
        const headers = Object.assign(
          {},
          this.http.defaults.headers.common || {}
        );
        // merge user-provided extra headers (cookies etc.)
        Object.assign(headers, this.extraHeaders || {});
        if (this.token)
          headers["Authorization"] = `Token token="${this.token}"`;

        logger.debug("EcForceAdmin.request", {
          attempt,
          method,
          url,
          params: typeof params === "object" ? Object.keys(params) : params,
          headers: {
            Authorization: mask(headers["Authorization"]),
            Cookie: headers.Cookie,
          },
        });

        const resp = await this.http.request({
          method,
          url,
          params,
          data,
          headers,
        });

        logger.debug("EcForceAdmin.response", {
          method,
          url,
          status: resp.status,
        });

        if (resp.status === 401)
          throw new AuthenticateFail("authentication failed");
        return { body: resp.data, code: resp.status, headers: resp.headers };
      } catch (err) {
        const status = err?.response?.status;
        const respBody = err?.response?.data;

        logger.warn("EcForceAdmin.request error", {
          method,
          path,
          attempt,
          status,
          responseBody: respBody,
        });

        if (status === 401) throw new AuthenticateFail("authentication failed");
        if (status === 429) {
          // Respect Retry-After when provided
          const retryAfter =
            parseInt(err.response?.headers?.["retry-after"] || "1", 10) *
              1000 || 1000;
          const backoff = retryAfter * attempt;
          if (attempt < maxRetries) {
            logger.info(
              `Rate limited, backing off ${backoff}ms (attempt ${attempt})`
            );
            await sleep(backoff);
            continue;
          }
          throw new TooManyRequest("too many requests");
        }

        // If this is an axios error with response, rethrow for caller to inspect
        if (err.response) throw err;
        throw err;
      }
    }
  }

  // convenience helpers
  async getCustomers(params = {}) {
    return this.request("get", "/api/v2/admin/customers.json", { params });
  }

  async getOrder(orderId, params = {}) {
    return this.request("get", `/api/v2/admin/orders/${orderId}.json`, {
      params,
    });
  }

  async getProducts(params = {}) {
    return this.request("get", "/api/v2/admin/products.json", { params });
  }

  async getProduct(productId, params = {}) {
    if (typeof productId !== "string" && typeof productId !== "number") {
      throw new TypeError("productId must be a string or number");
    }

    const safeProductId = String(productId).trim();

    if (!safeProductId) {
      throw new TypeError("productId must not be empty");
    }

    if (safeProductId.includes("/") || safeProductId.includes("..")) {
      throw new TypeError("productId contains invalid characters");
    }

    return this.request("get", `/api/v2/admin/products/${safeProductId}.json`, {
      params,
    });
  }

  async getStockItems(params = {}) {
    return this.request("get", "/api/v2/admin/stock_items.json", { params });
  }
}

module.exports = {
  EcForceAdmin,
  AuthenticateFail,
  SignInError,
  TooManyRequest,
};
