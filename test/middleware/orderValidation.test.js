// Mock logger before requiring modules
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  getErrorMessage: jest.fn((err) => err?.message || String(err))
}));

const OrderValidation = require('../../src/middleware/orderValidation');
const { CrawlerError, ErrorCodes } = require('../../src/middleware/errorHandler');

describe('Order Validation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {}
    };
    res = {};
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateCreateOrder', () => {
    const validOrderData = {
      account: 'test-account',
      customer: 'test-customer',
      form_data: {
        customer_id: 'C123',
        product: {
          name: 'Test Product',
          quantity: 1
        },
        shipping_address_id: 'A123'
      }
    };

    it('should pass with valid order data', () => {
      req.body = validOrderData;

      OrderValidation.validateCreateOrder(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject missing required fields', () => {
      req.body = {};

      OrderValidation.validateCreateOrder(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ErrorCodes.VALIDATION_ERROR
        })
      );
    });

    it('should accept account as object', () => {
      req.body = {
        ...validOrderData,
        account: { username: 'test', password: 'pass' }
      };

      OrderValidation.validateCreateOrder(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject invalid account type', () => {
      req.body = {
        ...validOrderData,
        account: 12345
      };

      OrderValidation.validateCreateOrder(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ErrorCodes.VALIDATION_ERROR
        })
      );
    });

    it('should collect multiple validation errors', () => {
      req.body = {
        form_data: {}
      };

      OrderValidation.validateCreateOrder(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error.message).toBe('Validation failed');
      expect(error.details.errors).toContain('account is required');
      expect(error.details.errors).toContain('customer is required');
    });

    it('should reject missing customer_id in form_data', () => {
      req.body = {
        account: 'test-account',
        customer: 'test-customer',
        form_data: {
          product: { name: 'Test' },
          shipping_address_id: 'A123'
        }
      };

      OrderValidation.validateCreateOrder(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.details.errors).toContain('form_data.customer_id is required');
    });

    it('should reject missing product name', () => {
      req.body = {
        account: 'test-account',
        customer: 'test-customer',
        form_data: {
          customer_id: 'C123',
          product: {},
          shipping_address_id: 'A123'
        }
      };

      OrderValidation.validateCreateOrder(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.details.errors).toContain('form_data.product.name is required');
    });
  });
});
