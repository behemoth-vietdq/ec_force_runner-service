// Test setup file
// Mock environment variables
process.env.APP_ENV = 'development';  // Changed to valid enum value
process.env.APP_PORT = '4001';
process.env.API_KEY = 'test-api-key';
process.env.LOG_LEVEL = 'error'; // Quiet logs during tests
process.env.PUPPETEER_TIMEOUT = '5000';
process.env.CRAWLER_DEBUGGING = 'false';
process.env.SCREENSHOTS_ENABLED = 'false';

// Global test utilities
global.testConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'http://localhost:4001'
};

// Suppress console during tests (optional)
if (process.env.SILENCE_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}
