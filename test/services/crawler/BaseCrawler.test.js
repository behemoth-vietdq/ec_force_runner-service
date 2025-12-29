const puppeteer = require('puppeteer');

// Mock puppeteer first
jest.mock('puppeteer');

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  getErrorMessage: jest.fn((err) => err?.message || String(err))
}));

// Mock screenshot utility
jest.mock('../../../src/utils/screenshot', () => ({
  takeScreenshot: jest.fn()
}));

const BaseCrawler = require('../../../src/services/crawler/BaseCrawler');

describe('BaseCrawler', () => {
  let crawler;
  let mockBrowser;
  let mockPage;

  beforeEach(() => {
    // Setup mock page
    mockPage = {
      goto: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue(undefined),
      setUserAgent: jest.fn().mockResolvedValue(undefined),
      setDefaultTimeout: jest.fn(),
      on: jest.fn(),
      waitForSelector: jest.fn().mockResolvedValue({}),
      url: jest.fn().mockReturnValue('https://example.com')
    };

    // Setup mock browser
    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
      pages: jest.fn().mockResolvedValue([mockPage]),
      process: jest.fn().mockReturnValue(null)
    };

    // Setup puppeteer mock
    puppeteer.launch = jest.fn().mockResolvedValue(mockBrowser);

    crawler = new BaseCrawler();
  });

  afterEach(async () => {
    if (crawler && crawler.browser) {
      await crawler.closeBrowser().catch(() => {});
    }
    jest.clearAllMocks();
  });

  describe('initBrowser', () => {
    it('should initialize browser successfully', async () => {
      await crawler.initBrowser();

      expect(puppeteer.launch).toHaveBeenCalled();
      expect(crawler.browser).toBe(mockBrowser);
      expect(crawler.page).toBe(mockPage);
    });

    it('should not initialize browser twice', async () => {
      // First initialization
      crawler.browser = mockBrowser;
      crawler.page = mockPage;
      
      // Second attempt should just return the existing page
      const result = await crawler.initBrowser();

      expect(puppeteer.launch).not.toHaveBeenCalled();
      expect(result).toBe(mockPage);
    });
  });

  describe('closeBrowser', () => {
    it('should close browser successfully', async () => {
      crawler.browser = mockBrowser;
      
      await crawler.closeBrowser();

      expect(mockBrowser.close).toHaveBeenCalled();
      expect(crawler.browser).toBeNull();
    });

    it('should handle browser not initialized', async () => {
      await expect(crawler.closeBrowser()).resolves.not.toThrow();
    });
  });

  describe('waitForElement', () => {
    it('should wait for selector successfully', async () => {
      crawler.page = mockPage;
      mockPage.waitForSelector = jest.fn().mockResolvedValue({});
      
      await crawler.waitForElement('#test-selector', { timeout: 5000 });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        '#test-selector',
        expect.objectContaining({ timeout: 5000 })
      );
    });
  });

  describe('handleError', () => {
    it('should format error with message', async () => {
      const error = new Error('Test error');
      crawler.page = mockPage;
      
      await expect(crawler.handleError(error, 'Test operation')).resolves.not.toThrow();
    });
  });

  describe('elementExists', () => {
    it('should return true if element exists', async () => {
      crawler.page = mockPage;
      mockPage.waitForSelector = jest.fn().mockResolvedValue({});
      
      const result = await crawler.elementExists('#test');
      
      expect(result).toBe(true);
    });

    it('should return false if element does not exist', async () => {
      crawler.page = mockPage;
      mockPage.waitForSelector = jest.fn().mockRejectedValue(new Error('Timeout'));
      
      const result = await crawler.elementExists('#test');
      
      expect(result).toBe(false);
    });
  });
});
