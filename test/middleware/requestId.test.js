const requestIdMiddleware = require('../../src/middleware/requestId');

describe('Request ID Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {}
    };
    res = {
      setHeader: jest.fn()
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate a new request ID if not provided', () => {
    requestIdMiddleware(req, res, next);

    expect(req.id).toBeDefined();
    expect(typeof req.id).toBe('string');
    expect(req.id.length).toBeGreaterThan(0);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should use provided X-Request-Id header', () => {
    const customId = 'custom-request-id-123';
    req.headers['x-request-id'] = customId;

    requestIdMiddleware(req, res, next);

    expect(req.id).toBe(customId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should generate unique IDs for different requests', () => {
    const req1 = { headers: {} };
    const req2 = { headers: {} };

    requestIdMiddleware(req1, res, next);
    requestIdMiddleware(req2, res, next);

    expect(req1.id).not.toBe(req2.id);
  });

  it('should generate UUID format IDs', () => {
    requestIdMiddleware(req, res, next);

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(req.id).toMatch(uuidRegex);
  });

  it('should handle case-insensitive header names', () => {
    req.headers['x-request-id'] = 'test-id';

    requestIdMiddleware(req, res, next);

    expect(req.id).toBe('test-id');
  });
});
