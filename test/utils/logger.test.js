const { getErrorMessage } = require('../../src/utils/logger');

describe('Logger Utils', () => {
  describe('getErrorMessage', () => {
    it('should return "Unknown error" for null/undefined', () => {
      expect(getErrorMessage(null)).toBe('Unknown error');
      expect(getErrorMessage(undefined)).toBe('Unknown error');
    });

    it('should return string as-is', () => {
      expect(getErrorMessage('Test error')).toBe('Test error');
    });

    it('should extract message from Error instance', () => {
      const error = new Error('Something went wrong');
      expect(getErrorMessage(error)).toBe('Something went wrong');
    });

    it('should extract message property from objects', () => {
      const errorObj = { message: 'Custom error' };
      expect(getErrorMessage(errorObj)).toBe('Custom error');
    });

    it('should convert non-string/non-error to string', () => {
      expect(getErrorMessage(404)).toBe('404');
      expect(getErrorMessage(true)).toBe('true');
    });

    it('should handle objects without message property', () => {
      const obj = { code: 'ERR_123', details: 'Info' };
      const result = getErrorMessage(obj);
      // Object without message property converts to string
      expect(result).toBe('[object Object]');
    });
  });
});
