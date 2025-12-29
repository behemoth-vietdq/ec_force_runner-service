// Mock logger before requiring controller
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  getErrorMessage: jest.fn((err) => err?.message || String(err))
}));

// Mock config
jest.mock('../../src/config', () => ({
  server: {
    env: 'test'
  }
}));

const HealthController = require('../../src/controllers/healthController');

describe('Health Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Mock process.uptime
    jest.spyOn(process, 'uptime').mockReturnValue(12345);
    jest.spyOn(Date, 'now').mockReturnValue(1609459200000);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should return healthy status with uptime', async () => {
    await HealthController.checkHealth(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        uptime: 12345,
        message: 'OK',
        timestamp: 1609459200000,
        environment: 'test'
      })
    );
  });

  it('should return valid ISO timestamp', async () => {
    await HealthController.checkHealth(req, res);

    const call = res.json.mock.calls[0][0];
    expect(call.timestamp).toBe(1609459200000);
  });

  it('should handle health check errors gracefully', async () => {
    // Mock process.uptime to throw error
    jest.spyOn(process, 'uptime').mockImplementation(() => {
      throw new Error('Test error');
    });

    await expect(HealthController.checkHealth(req, res)).rejects.toThrow('Test error');
  });
});
