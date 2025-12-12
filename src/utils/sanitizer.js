/**
 * URL sanitization utility
 * Prevents injection attacks in URLs and query parameters
 */

/**
 * Sanitize URL to prevent injection
 * @param {string} url - URL to sanitize
 * @returns {string} Sanitized URL
 */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL');
  }

  // Remove any dangerous characters
  const sanitized = url
    .trim()
    .replace(/[<>'"]/g, '') // Remove HTML/JS injection chars
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, ''); // Remove vbscript: protocol

  // Validate it's a proper HTTP/HTTPS URL
  try {
    const parsed = new URL(sanitized);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid URL protocol');
    }
    return sanitized;
  } catch (error) {
    throw new Error(`Invalid URL format: ${error.message}`);
  }
}

/**
 * Sanitize query parameter to prevent injection
 * @param {string} param - Parameter value to sanitize
 * @returns {string} Sanitized parameter
 */
function sanitizeQueryParam(param) {
  if (!param) return '';
  
  if (typeof param !== 'string') {
    param = String(param);
  }

  // Remove dangerous characters that could be used in injection attacks
  return param
    .trim()
    .replace(/[<>'"&;`|*?~$^()[\]{}\\]/g, '') // Remove shell/SQL/XSS chars
    .replace(/\.\./g, '') // Remove directory traversal
    .substring(0, 255); // Limit length
}

/**
 * Sanitize object with multiple fields
 * @param {Object} obj - Object to sanitize
 * @param {Array} fields - Fields to sanitize
 * @returns {Object} Sanitized object
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
 * @param {string} customerId - Customer ID to validate
 * @returns {string} Sanitized customer ID
 */
function sanitizeCustomerId(customerId) {
  if (!customerId) {
    throw new Error('Customer ID is required');
  }

  // Only allow alphanumeric and dash/underscore
  const sanitized = String(customerId).replace(/[^a-zA-Z0-9_-]/g, '');
  
  if (sanitized !== String(customerId)) {
    throw new Error('Customer ID contains invalid characters');
  }

  return sanitized;
}

module.exports = {
  sanitizeUrl,
  sanitizeQueryParam,
  sanitizeObject,
  sanitizeCustomerId,
};
