const authMiddleware = require('../../src/middleware/auth');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      query: {},
      ip: '127.0.0.1'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();

    // Mock config
    jest.mock('../../src/config', () => ({
      apiKeys: {
        admin: ['valid-key-1', 'valid-key-2']
      },
      server: {
        env: 'production'
      }
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should allow request with valid API key in header', () => {
    req.headers['x-api-key'] = 'test-api-key';
    
    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject request without API key', () => {
    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'API key required in X-API-Key header'
      }
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject request with invalid API key', () => {
    req.headers['x-api-key'] = 'wrong-key';
    
    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      }
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should be case-sensitive for API keys', () => {
    req.headers['x-api-key'] = 'test-api-key';
    
    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
