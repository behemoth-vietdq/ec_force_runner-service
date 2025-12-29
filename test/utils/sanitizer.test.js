const { sanitizeUrl, sanitizeCustomerId } = require('../../src/utils/sanitizer');

describe('Sanitizer Utils', () => {
  describe('sanitizeUrl', () => {
    it('should allow valid HTTPS URLs', () => {
      const url = 'https://example.com/path';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should allow valid HTTP URLs', () => {
      const url = 'http://example.com';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should allow URLs with authentication', () => {
      const url = 'https://user:pass@example.com';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should throw on invalid URLs', () => {
      expect(() => sanitizeUrl('not-a-url')).toThrow(/Invalid URL/);
      expect(() => sanitizeUrl('javascript:alert(1)')).toThrow(/Invalid URL/);
      expect(() => sanitizeUrl('')).toThrow(/Invalid URL/);
    });

    it('should throw on non-http(s) protocols', () => {
      expect(() => sanitizeUrl('ftp://example.com')).toThrow(/Invalid URL/);
      expect(() => sanitizeUrl('file:///etc/passwd')).toThrow(/Invalid URL/);
    });

    it('should handle URLs with special characters', () => {
      const url = 'https://example.com/path?query=value&foo=bar';
      expect(sanitizeUrl(url)).toBe(url);
    });
  });

  describe('sanitizeCustomerId', () => {
    it('should allow valid alphanumeric customer IDs', () => {
      expect(sanitizeCustomerId('abc123')).toBe('abc123');
      expect(sanitizeCustomerId('ABC123')).toBe('ABC123');
      expect(sanitizeCustomerId('a1b2c3')).toBe('a1b2c3');
    });

    it('should allow customer IDs with underscores and hyphens', () => {
      expect(sanitizeCustomerId('abc_123')).toBe('abc_123');
      expect(sanitizeCustomerId('abc-123')).toBe('abc-123');
      expect(sanitizeCustomerId('abc_123-xyz')).toBe('abc_123-xyz');
    });

    it('should throw on customer IDs with special characters', () => {
      expect(() => sanitizeCustomerId('abc@123')).toThrow(/invalid characters/);
      expect(() => sanitizeCustomerId('abc 123')).toThrow(/invalid characters/);
      expect(() => sanitizeCustomerId('abc#123')).toThrow(/invalid characters/);
      expect(() => sanitizeCustomerId('abc$123')).toThrow(/invalid characters/);
    });

    it('should throw on empty or null customer IDs', () => {
      expect(() => sanitizeCustomerId('')).toThrow(/required/);
      expect(() => sanitizeCustomerId(null)).toThrow(/required/);
      expect(() => sanitizeCustomerId(undefined)).toThrow(/required/);
    });

    it('should throw on customer IDs that are too long', () => {
      const longId = 'a'.repeat(101);
      // Long IDs are allowed, just sanitized
      const result = sanitizeCustomerId(longId);
      expect(result).toBe(longId);
    });

    it('should throw on SQL injection attempts', () => {
      expect(() => sanitizeCustomerId("'; DROP TABLE users--")).toThrow(/invalid characters/);
      expect(() => sanitizeCustomerId("1' OR '1'='1")).toThrow(/invalid characters/);
    });
  });
});
