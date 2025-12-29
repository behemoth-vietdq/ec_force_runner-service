/**
 * URL sanitization to prevent injection attacks
 */
const { getErrorMessage } = require('./logger');

/**
 * Sanitize URL to prevent injection
 * Uses whitelist approach after validation
 */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL');
  }

  const trimmed = url.trim();

  // Validate it's a proper HTTP/HTTPS URL first
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP and HTTPS protocols are allowed');
    }
    
    // Return the validated URL (URL constructor already sanitizes)
    return parsed.href;
  } catch (error) {
    throw new Error(`Invalid URL format: ${getErrorMessage(error)}`);
  }
}

/**
 * Sanitize query parameter to prevent injection
 * Uses whitelist approach for better security
 */
function sanitizeQueryParam(param) {
  if (!param) return '';
  
  if (typeof param !== 'string') {
    param = String(param);
  }

  // Whitelist: only allow safe characters (alphanumeric, space, basic punctuation)
  const sanitized = param
    .trim()
    .replace(/[^a-zA-Z0-9 .,@_-]/g, '') // Only allow safe chars
    .substring(0, 255); // Limit length

  return sanitized;
}

/**
 * Sanitize object fields
 */
function sanitizeObject(obj, fields) {
  const sanitized = { ...obj };
  
  fields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = sanitizeQueryParam(sanitized[field]);
    }
  });

  return sanitized;
}

/**
 * Validate and sanitize customer ID
 * Only allows alphanumeric, dash, underscore with length limits
 */
function sanitizeCustomerId(customerId) {
  if (!customerId) {
    throw new Error('Customer ID is required');
  }

  const str = String(customerId);
  
  // Length validation
  if (str.length < 1 || str.length > 100) {
    throw new Error('Customer ID must be between 1 and 100 characters');
  }

  // Whitelist: only alphanumeric, dash, underscore
  const sanitized = str.replace(/[^a-zA-Z0-9_-]/g, '');
  
  if (sanitized !== str) {
    throw new Error('Customer ID contains invalid characters. Only alphanumeric, dash, and underscore allowed');
  }

  return sanitized;
}

module.exports = {
  sanitizeUrl,
  sanitizeQueryParam,
  sanitizeObject,
  sanitizeCustomerId,
};
