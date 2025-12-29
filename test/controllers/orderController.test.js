// Mock dependencies before requiring controller
jest.mock('../../src/services/crawler/EcForceOrderCrawler');
jest.mock('../../src/services/order/OrderNotificationService');
jest.mock('../../src/services/order/OrderLoggerService');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  getErrorMessage: jest.fn((err) => err?.message || String(err))
}));

const OrderController = require('../../src/controllers/orderController');
const EcForceOrderCrawler = require('../../src/services/crawler/EcForceOrderCrawler');
const OrderNotificationService = require('../../src/services/order/OrderNotificationService');
const OrderLoggerService = require('../../src/services/order/OrderLoggerService');

describe('Order Controller', () => {
  let req, res, next;
  let mockCrawlerInstance;

  beforeEach(() => {
    req = {
      body: {
        account: JSON.stringify({ username: 'test', password: 'pass' }),
        customer: JSON.stringify({ id: 'C123', name: 'John Doe' }),
        form_data: {
          customer_id: 'C123',
          product: {
            name: 'Test Product',
            quantity: 1
          },
          shipping_address_id: 'A123'
        }
      },
      id: 'req-123'
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    next = jest.fn();

    // Setup mock crawler instance
    mockCrawlerInstance = {
      execute: jest.fn().mockResolvedValue({
        data: {
          order_id: 'ORDER-123',
          order_number: 'ORD-456'
        },
        executionTime: 1000
      }),
      closeBrowser: jest.fn().mockResolvedValue(undefined)
    };

    EcForceOrderCrawler.mockImplementation(() => mockCrawlerInstance);

    // Mock notification and logger services
    OrderNotificationService.sendOrderSuccessNotification = jest.fn().mockResolvedValue(undefined);
    OrderNotificationService.sendOrderFailureNotification = jest.fn().mockResolvedValue(undefined);
    OrderLoggerService.logOrderParams = jest.fn().mockResolvedValue(undefined);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    it('should create order successfully', async () => {
      await OrderController.createOrder(req, res, next);

      expect(EcForceOrderCrawler).toHaveBeenCalledWith({
        account: { username: 'test', password: 'pass' },
        customer: { id: 'C123', name: 'John Doe' },
        formData: req.body.form_data
      });

      expect(mockCrawlerInstance.execute).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          order_id: 'ORDER-123',
          order_number: 'ORD-456'
        },
        meta: {
          execution_time_ms: 1000,
          request_id: 'req-123'
        }
      });
      expect(next).not.toHaveBeenCalled();
      expect(mockCrawlerInstance.closeBrowser).toHaveBeenCalled();
    });

    it('should handle processing errors', async () => {
      const mockError = new Error('Processing failed');
      mockCrawlerInstance.execute.mockRejectedValue(mockError);

      await OrderController.createOrder(req, res, next);

      expect(next).toHaveBeenCalledWith(mockError);
      expect(res.json).not.toHaveBeenCalled();
      expect(mockCrawlerInstance.closeBrowser).toHaveBeenCalled();
    });

    it('should pass all required parameters to crawler', async () => {
      await OrderController.createOrder(req, res, next);

      expect(EcForceOrderCrawler).toHaveBeenCalledWith(
        expect.objectContaining({
          account: expect.objectContaining({ username: 'test' }),
          customer: expect.objectContaining({ id: 'C123' }),
          formData: expect.objectContaining({
            customer_id: 'C123',
            product: expect.objectContaining({ name: 'Test Product' })
          })
        })
      );
    });

    it('should handle empty response from crawler', async () => {
      mockCrawlerInstance.execute.mockResolvedValue({
        data: null,
        executionTime: 500
      });

      await OrderController.createOrder(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: null,
        meta: {
          execution_time_ms: 500,
          request_id: 'req-123'
        }
      });
    });

    it('should handle account as object', async () => {
      req.body.account = { username: 'user', password: 'pass' };

      await OrderController.createOrder(req, res, next);

      expect(EcForceOrderCrawler).toHaveBeenCalledWith(
        expect.objectContaining({
          account: { username: 'user', password: 'pass' }
        })
      );
    });

    it('should handle customer as object', async () => {
      req.body.customer = { id: 'C123', name: 'John Doe' };

      await OrderController.createOrder(req, res, next);

      expect(EcForceOrderCrawler).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: { id: 'C123', name: 'John Doe' }
        })
      );
    });
  });
});
