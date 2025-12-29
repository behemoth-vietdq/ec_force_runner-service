const puppeteer = require("puppeteer");
const config = require("../../config");
const constants = require("../../config/constants");
const logger = require("../../utils/logger");
const {
  saveErrorScreenshot,
  saveScreenshot,
} = require("../../utils/screenshot");
const { CrawlerError, ErrorCodes } = require("../../middleware/errorHandler");

/**
 * Base Crawler with common Puppeteer operations
 * Provides browser initialization, navigation, element interactions, error handling
 */
class BaseCrawler {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.options = { ...config.puppeteer, ...options };
    this.startTime = Date.now();
  }

  /**
   * Initialize browser instance
   */
  async initBrowser() {
    try {
      const headless = this.options.headless;

      logger.info(`Initializing browser - headless: ${headless}`);

      this.browser = await this._launchBrowser(headless);
      this.page = await this.browser.newPage();

      if (this.options.userAgent) {
        await this.page.setUserAgent(this.options.userAgent);
      }

      this.page.setDefaultTimeout(this.options.timeout);

      if (config.crawler.debugging) {
        this.page.on("console", (msg) =>
          logger.debug(`Browser console [${msg.type()}]: ${msg.text()}`)
        );
      }
      this.page.on("pageerror", (error) => logger.error("Page error", { error: error?.message || String(error) }));

      logger.info("Browser initialized successfully");
      return this.page;
    } catch (error) {
      logger.error(`Failed to initialize browser: ${error?.message || String(error)}`);
      throw new CrawlerError(
        "Failed to initialize browser",
        ErrorCodes.BROWSER_INIT_FAILED,
        500,
        { originalError: error?.message || String(error) }
      );
    }
  }

  /**
   * Launch browser with appropriate configuration
   */
  async _launchBrowser(headless) {
    return await puppeteer.launch({
      headless,
      executablePath: headless ? undefined : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ignoreDefaultArgs: headless ? undefined : ['--enable-automation'],
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        // Add display args for non-headless mode
        ...(headless ? [] : [
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding"
        ]),
        ...(this.options.args || []),
      ],
      defaultViewport: headless ? this.options.defaultViewport : {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      },
    });
  }

  /**
   * Close browser safely
   */
  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
        logger.info("Browser closed successfully");
      } catch (error) {
        logger.error("Error closing browser:", error);
      } finally {
        this.browser = null;
        this.page = null;
      }
    }
  }

  /**
   * Navigate to URL
   */
  async navigateToUrl(url) {
    try {
      logger.info(`Navigating to: ${url}`);
      await this.page.goto(url, {
        waitUntil: "networkidle2",
        timeout: this.options.timeout,
      });
      logger.info("Navigation successful");
    } catch (error) {
      await this.handleError(error, "navigation_failed");
      throw new CrawlerError(
        `Failed to navigate to ${url}`,
        ErrorCodes.BROWSER_NAVIGATION_FAILED,
        500,
        { url, originalError: error?.message || String(error) }
      );
    }
  }

  /**
   * Wait for element to appear
   */
  async waitForElement(selector, options = {}) {
    const waitOptions = {
      visible: true,
      timeout: this.options.timeout,
      ...options,
    };
    try {
      logger.debug(`Waiting for element: ${selector}`);
      const element = await this.page.waitForSelector(selector, waitOptions);
      logger.debug(`Element found: ${selector}`);
      return element;
    } catch (error) {
      await this.handleError(
        error,
        `element_not_found_${selector.replace(/[^a-zA-Z0-9]/g, "_")}`
      );
      throw new CrawlerError(
        `Element not found: ${selector}`,
        ErrorCodes.ELEMENT_NOT_FOUND,
        500,
        { selector, originalError: error?.message || String(error) }
      );
    }
  }

  /**
   * Click element with retries and scroll into view
   */
  async clickElement(selector, options = {}) {
    const maxRetries = options.maxRetries || constants.RETRIES.CLICK_MAX;
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const element = await this.waitForElement(selector, options);
        await this.page.evaluate(
          (el) => el.scrollIntoView({ behavior: "smooth", block: "center" }),
          element
        );
        await this.sleep(constants.DELAYS.AFTER_SCROLL);
        await element.click();
        logger.debug(`Element clicked: ${selector}`);
        return;
      } catch (error) {
        lastError = error;
        logger.warn(
          `Click attempt ${attempt} failed for ${selector}: ${error?.message || String(error)}`
        );
        if (attempt < maxRetries) await this.sleep(constants.DELAYS.BETWEEN_RETRIES);
      }
    }
    // Fallback JS click
    try {
      await this.page.evaluate(
        (sel) => document.querySelector(sel)?.click(),
        selector
      );
      logger.info(`JS click successful: ${selector}`);
    } catch {
      await this.handleError(
        lastError,
        `click_failed_${selector.replace(/[^a-zA-Z0-9]/g, "_")}`
      );
      throw new CrawlerError(
        `Failed to click ${selector} after ${maxRetries} attempts`,
        ErrorCodes.ELEMENT_INTERACTION_FAILED,
        500,
        { selector, originalError: lastError?.message || String(lastError) }
      );
    }
  }

  /**
   * Fill input with value and verification
   */
  async fillInput(selector, value, options = {}) {
    if (!value) return;
    const maxRetries = options.maxRetries || constants.RETRIES.FILL_INPUT_MAX;
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const element = await this.waitForElement(selector, options);
        await this.page.evaluate(
          (el) => el.scrollIntoView({ behavior: "smooth", block: "center" }),
          element
        );
        await this.sleep(constants.DELAYS.BEFORE_CLICK);
        await element.click();
        await this.sleep(constants.DELAYS.BEFORE_TYPE);
        // Clear and type
        await this.page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) el.value = "";
        }, selector);
        await element.type(value, { delay: constants.DELAYS.TYPING_DELAY });
        // Verify
        const actual = await this.page.evaluate(
          (sel) => document.querySelector(sel)?.value,
          selector
        );
        if (actual === value) {
          logger.debug(`Input filled: ${selector} = ${value}`);
          return;
        }
        throw new Error(`Value mismatch: expected ${value}, got ${actual}`);
      } catch (error) {
        lastError = error;
        logger.warn(`Fill attempt ${attempt} failed: ${error?.message || String(error)}`);
        if (attempt < maxRetries) await this.sleep(constants.DELAYS.BETWEEN_RETRIES);
      }
    }
    await this.handleError(
      lastError,
      `fill_failed_${selector.replace(/[^a-zA-Z0-9]/g, "_")}`
    );
    throw new CrawlerError(
      `Failed to fill ${selector} after ${maxRetries} attempts`,
      ErrorCodes.ELEMENT_INTERACTION_FAILED,
      500,
      { selector, value, originalError: lastError?.message || String(lastError) }
    );
  }

  /**
   * Select dropdown option
   */
  async selectOption(selector, value, options = {}) {
    try {
      await this.waitForElement(selector, options);
      await this.page.select(selector, value);
      logger.debug(`Option selected: ${selector} = ${value}`);
    } catch (error) {
      await this.handleError(
        error,
        `select_failed_${selector.replace(/[^a-zA-Z0-9]/g, "_")}`
      );
      throw new CrawlerError(
        `Failed to select ${selector}`,
        ErrorCodes.ELEMENT_INTERACTION_FAILED,
        500,
        { selector, value, originalError: error?.message || String(error) }
      );
    }
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(filename = null) {
    if (!this.page) {
      logger.warn("Cannot take screenshot: page is null");
      return null;
    }
    try {
      return await saveScreenshot(this.page, filename);
    } catch (error) {
      logger.error("Failed to take screenshot:", error);
      return null;
    }
  }

  /**
   * Handle error with logging and screenshot
   */
  async handleError(error, context = "") {
    logger.error(
      `Error in ${context}: ${error?.message || String(error)}\nStack: ${error?.stack || ''}`
    );
    if (this.page && config.crawler.screenshotsEnabled) {
      await saveErrorScreenshot(this.page, error, context);
    }
  }

  /**
   * Sleep for milliseconds
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if element exists
   */
  async elementExists(selector, timeout = 3000) {
    try {
      await this.page.waitForSelector(selector, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retry function with configurable attempts and delay
   */
  async withRetry(
    fn,
    maxAttempts = constants.RETRIES.DEFAULT_MAX,
    delayMs = constants.DELAYS.BETWEEN_RETRIES * 4
  ) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        logger.warn(`Retry ${attempt}/${maxAttempts} failed: ${error?.message || String(error)}`);
        if (attempt < maxAttempts) await this.sleep(delayMs);
      }
    }
    
    // Ensure we always throw a proper error
    if (!lastError) {
      lastError = new Error('Retry failed with unknown error');
    }
    throw lastError;
  }
}

module.exports = BaseCrawler;
