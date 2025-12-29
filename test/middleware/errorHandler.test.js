const { errorHandler, CrawlerError, ErrorCodes } = require('../../src/middleware/errorHandler');

describe('Error Handler Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      originalUrl: '/api/test',
      method: 'POST'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();

    // Mock logger
    jest.mock('../../src/utils/logger', () => ({
      error: jest.fn()
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CrawlerError', () => {
    it('should create error with all properties', () => {
      const error = new CrawlerError(
        'Test error',
        ErrorCodes.VALIDATION_ERROR,
        400,
        { field: 'test' }
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'test' });
      expect(error.name).toBe('CrawlerError');
    });

    it('should default to 500 status code', () => {
      const error = new CrawlerError('Test', ErrorCodes.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
    });
  });

  describe('errorHandler', () => {
    it('should handle CrawlerError correctly', () => {
      const error = new CrawlerError(
        'Validation failed',
        ErrorCodes.VALIDATION_ERROR,
        400,
        { field: 'email' }
      );

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Validation failed',
          details: { field: 'email' }
        }
      });
    });

    it('should handle Joi validation errors', () => {
      const error = {
        isJoi: true,
        details: [
          {
            path: ['email'],
            message: '"email" is required'
          }
        ]
      };

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Validation error',
          details: [
            {
              field: 'email',
              message: '"email" is required'
            }
          ]
        }
      });
    });

    it('should handle generic errors', () => {
      const error = new Error('Something went wrong');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Something went wrong'
        }
      });
    });

    it('should include stack trace in development mode', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Test error');

      errorHandler(error, req, res, next);

      const call = res.json.mock.calls[0][0];
      expect(call.error).toHaveProperty('stack');
      
      process.env.NODE_ENV = 'test';
    });

    it('should not include stack trace in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Test error');

      errorHandler(error, req, res, next);

      const call = res.json.mock.calls[0][0];
      expect(call.error).not.toHaveProperty('stack');
      
      process.env.NODE_ENV = 'test';
    });

    it('should handle errors with custom status codes', () => {
      const error = new Error('Not found');
      error.statusCode = 404;

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
