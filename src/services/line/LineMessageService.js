const logger = require('../../utils/logger');

/**
 * Minimal LINE Messaging API helper for pushing messages to users
 */
class LineMessageService {
  constructor({ accessToken, channelId, channelSecret } = {}) {
    this.accessToken = accessToken;
    this.channelId = channelId;
    this.channelSecret = channelSecret;
    this.apiBase = 'https://api.line.me';
    this.pushEndpoint = '/v2/bot/message/push';
  }

  async sendMessage(to, message) {
    if (!this.accessToken) {
      throw new Error('LINE access token not configured');
    }

    const messages = Array.isArray(message)
      ? message
      : [{ type: 'text', text: String(message) }];

    const body = {
      to,
      messages,
    };

    const url = `${this.apiBase}${this.pushEndpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.accessToken}`,
    };

    try {
      const fetchFn = (typeof fetch !== 'undefined') ? fetch : (...args) => require('node-fetch')(...args);
      const res = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const respText = await res.text().catch(() => '');
        logger.error('LINE API returned non-2xx response', { status: res.status, body: respText });
        const err = new Error(`LINE API error ${res.status}`);
        err.status = res.status;
        err.body = respText;
        throw err;
      }

      return res.json().catch(() => ({}));
    } catch (err) {
      logger.error('Failed to call LINE API', { error: err.message });
      throw err;
    }
  }
}

module.exports = LineMessageService;
