const BaseCrawler = require('../../src/services/crawler/BaseCrawler');

describe('BaseCrawler', () => {
  let crawler;

  beforeEach(() => {
    crawler = new BaseCrawler({
      headless: true,
      timeout: 30000,
    });
  });

  afterEach(async () => {
    if (crawler && crawler.browser) {
      await crawler.closeBrowser();
    }
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      expect(crawler).toBeDefined();
      expect(crawler.browser).toBeNull();
      expect(crawler.page).toBeNull();
      expect(crawler.options).toBeDefined();
    });

    it('should merge custom options with defaults', () => {
      const customCrawler = new BaseCrawler({
        headless: false,
        timeout: 10000,
      });

      expect(customCrawler.options.headless).toBe(false);
      expect(customCrawler.options.timeout).toBe(10000);
    });
  });

  describe('initBrowser', () => {
    it('should initialize browser successfully', async () => {
      await crawler.initBrowser();

      expect(crawler.browser).not.toBeNull();
      expect(crawler.page).not.toBeNull();
    }, 30000);

    it('should set up page event listeners', async () => {
      await crawler.initBrowser();

      // Check if page has listeners (this is a basic check)
      expect(crawler.page.listenerCount('console')).toBeGreaterThan(0);
      expect(crawler.page.listenerCount('pageerror')).toBeGreaterThan(0);
    }, 30000);
  });

  describe('closeBrowser', () => {
    it('should close browser cleanly', async () => {
      await crawler.initBrowser();
      await crawler.closeBrowser();

      expect(crawler.browser).toBeNull();
      expect(crawler.page).toBeNull();
    }, 30000);

    it('should not throw error if browser is already null', async () => {
      await expect(crawler.closeBrowser()).resolves.not.toThrow();
    });
  });

  describe('sleep', () => {
    it('should pause execution for specified time', async () => {
      const start = Date.now();
      await crawler.sleep(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('getExecutionTime', () => {
    it('should return execution time', async () => {
      await crawler.sleep(100);
      const execTime = crawler.getExecutionTime();

      expect(execTime).toBeGreaterThan(100);
      expect(typeof execTime).toBe('number');
    });
  });
});
