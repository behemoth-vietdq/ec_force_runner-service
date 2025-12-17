const LineMessageService = require('./LineMessageService');
const logger = require('../../utils/logger');

/**
 * Helper to create a LineMessageService from account options
 * @param {Object} account
 * @returns {LineMessageService|null}
 */
function createServiceFromAccount(account) {
  const token = account?.options?.line_message_api_channel_token;
  const channelId = account?.options?.line_message_api_channel_id;
  const channelSecret = account?.options?.line_message_api_channel_secret;

  if (!token || !channelId || !channelSecret) return null;

  return new LineMessageService({
    accessToken: token,
    channelId,
    channelSecret,
  });
}

async function sendText(account, to, text) {
  const svc = createServiceFromAccount(account);
  if (!svc) {
    logger.info('LINE credentials missing, skipping text message');
    return null;
  }

  try {
    return await svc.sendMessage(to, String(text));
  } catch (err) {
    logger.error(`sendText failed: ${err.message}`);
    throw err;
  }
}

async function sendFlex(account, to, flexObject) {
  const svc = createServiceFromAccount(account);
  if (!svc) {
    logger.info('LINE credentials missing, skipping flex message');
    return null;
  }

  // Ensure message is an array of message objects
  const payload = Array.isArray(flexObject) ? flexObject : [flexObject];

  try {
    return await svc.sendMessage(to, payload);
  } catch (err) {
    logger.error(`sendFlex failed: ${err.message}`);
    throw err;
  }
}

module.exports = {
  createServiceFromAccount,
  sendText,
  sendFlex,
};
