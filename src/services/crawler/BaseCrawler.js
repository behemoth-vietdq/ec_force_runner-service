const puppeteer = require("puppeteer");
const config = require("../../config");
const logger = require("../../utils/logger");
const {
  saveErrorScreenshot,
  saveScreenshot,
} = require("../../utils/screenshot");
const { CrawlerError, ErrorCodes } = require("../../middleware/errorHandler");

/**
 * Base Crawler class with common functionality.
 * Provides browser initialization, navigation, element interactions, and error handling.
 */
class BaseCrawler {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.options = { ...config.puppeteer, ...options };
    this.startTime = Date.now();
  }

  /**
   * Initialize browser instance.
   * @throws {CrawlerError} If browser launch fails.
   */
  async initBrowser() {
    try {
      const isProduction = process.env.NODE_ENV === "production";
      const headless = isProduction || process.env.DOCKER_ENV === "true";

      logger.info(`Initializing browser - headless: ${headless}, timeout: ${this.options.timeout}`);

      this.browser = await puppeteer.launch({
        headless,
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
          ...(this.options.args || []),
        ],
        defaultViewport: this.options.defaultViewport,
      });

      this.page = await this.browser.newPage();

      if (this.options.userAgent) {
        await this.page.setUserAgent(this.options.userAgent);
      }

      this.page.setDefaultTimeout(this.options.timeout);

      // Log console, errors, and failed requests if debug enabled
      if (config.debug.enabled) {
        this.page.on("console", (msg) => logger.debug(`Browser console [${msg.type()}]: ${msg.text()}`));
      }
      this.page.on("pageerror", (error) => logger.error("Page error:", error));

      logger.info("Browser initialized successfully");
      return this.page;
    } catch (error) {
      logger.error("Failed to initialize browser:", error);
      throw new CrawlerError(
        "Failed to initialize browser",
        ErrorCodes.BROWSER_INIT_FAILED,
        500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Close browser instance safely.
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
   * Navigate to a URL with wait options.
   * @param {string} url - URL to navigate to.
   * @throws {CrawlerError} If navigation fails.
   */
  async navigateToUrl(url) {
    try {
      logger.info(`Navigating to: ${url}`);
      await this.page.goto(url, { waitUntil: "networkidle2", timeout: this.options.timeout });
      logger.info("Navigation successful");
    } catch (error) {
      await this.handleError(error, "navigation_failed");
      throw new CrawlerError(
        `Failed to navigate to ${url}`,
        ErrorCodes.BROWSER_NAVIGATION_FAILED,
        500,
        { url, originalError: error.message }
      );
    }
  }

  /**
   * Wait for an element to appear.
   * @param {string} selector - CSS selector.
   * @param {Object} options - Wait options.
   * @returns {ElementHandle} The element.
   * @throws {CrawlerError} If element not found.
   */
  async waitForElement(selector, options = {}) {
    const waitOptions = { visible: true, timeout: this.options.timeout, ...options };
    try {
      logger.debug(`Waiting for element: ${selector}`);
      const element = await this.page.waitForSelector(selector, waitOptions);
      logger.debug(`Element found: ${selector}`);
      return element;
    } catch (error) {
      await this.handleError(error, `element_not_found_${selector.replace(/[^a-zA-Z0-9]/g, "_")}`);
      throw new CrawlerError(
        `Element not found: ${selector}`,
        ErrorCodes.ELEMENT_NOT_FOUND,
        500,
        { selector, originalError: error.message }
      );
    }
  }

  /**
   * Click an element with retries and scroll into view.
   * @param {string} selector - CSS selector.
   * @param {Object} options - Options including maxRetries.
   * @throws {CrawlerError} If click fails after retries.
   */
  async clickElement(selector, options = {}) {
    const maxRetries = options.maxRetries || config.crawler.maxRetries;
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const element = await this.waitForElement(selector, options);
        await this.page.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }), element);
        await this.sleep(300);
        await element.click();
        logger.debug(`Element clicked: ${selector}`);
        return;
      } catch (error) {
        lastError = error;
        logger.warn(`Click attempt ${attempt} failed for ${selector}: ${error.message}`);
        if (attempt < maxRetries) await this.sleep(config.crawler.retryDelayMs);
      }
    }
    // Fallback JS click
    try {
      await this.page.evaluate((sel) => document.querySelector(sel)?.click(), selector);
      logger.info(`JS click successful: ${selector}`);
    } catch {
      await this.handleError(lastError, `click_failed_${selector.replace(/[^a-zA-Z0-9]/g, "_")}`);
      throw new CrawlerError(
        `Failed to click ${selector} after ${maxRetries} attempts`,
        ErrorCodes.ELEMENT_INTERACTION_FAILED,
        500,
        { selector, originalError: lastError.message }
      );
    }
  }

  /**
   * Fill an input field with value, with retries and verification.
   * @param {string} selector - CSS selector.
   * @param {string} value - Value to fill.
   * @param {Object} options - Options.
   * @throws {CrawlerError} If fill fails.
   */
  async fillInput(selector, value, options = {}) {
    if (!value) return;
    const maxRetries = options.maxRetries || 3;
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const element = await this.waitForElement(selector, options);
        await this.page.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }), element);
        await this.sleep(200);
        await element.click();
        await this.sleep(100);
        // Clear and type
        await this.page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) el.value = "";
        }, selector);
        await element.type(value, { delay: 50 });
        // Verify
        const actual = await this.page.evaluate((sel) => document.querySelector(sel)?.value, selector);
        if (actual === value) {
          logger.debug(`Input filled: ${selector} = ${value}`);
          return;
        }
        throw new Error(`Value mismatch: expected ${value}, got ${actual}`);
      } catch (error) {
        lastError = error;
        logger.warn(`Fill attempt ${attempt} failed: ${error.message}`);
        if (attempt < maxRetries) await this.sleep(500);
      }
    }
    await this.handleError(lastError, `fill_failed_${selector.replace(/[^a-zA-Z0-9]/g, "_")}`);
    throw new CrawlerError(
      `Failed to fill ${selector} after ${maxRetries} attempts`,
      ErrorCodes.ELEMENT_INTERACTION_FAILED,
      500,
      { selector, value, originalError: lastError.message }
    );
  }

  /**
   * Select an option in dropdown.
   * @param {string} selector - Select selector.
   * @param {string} value - Option value.
   * @param {Object} options - Options.
   * @throws {CrawlerError} If select fails.
   */
  async selectOption(selector, value, options = {}) {
    try {
      await this.waitForElement(selector, options);
      await this.page.select(selector, value);
      logger.debug(`Option selected: ${selector} = ${value}`);
    } catch (error) {
      await this.handleError(error, `select_failed_${selector.replace(/[^a-zA-Z0-9]/g, "_")}`);
      throw new CrawlerError(
        `Failed to select ${selector}`,
        ErrorCodes.ELEMENT_INTERACTION_FAILED,
        500,
        { selector, value, originalError: error.message }
      );
    }
  }

  /**
   * Take a screenshot.
   * @param {string|null} filename - Optional filename.
   * @returns {string|null} Screenshot path or null.
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
   * Handle error with logging and screenshot.
   * @param {Error} error - Error object.
   * @param {string} context - Error context.
   */
  async handleError(error, context = "") {
    logger.error(`Error in ${context}: ${error.message}\nStack: ${error.stack}`);
    if (this.page && config.screenshots.enabled) {
      await saveErrorScreenshot(this.page, error, context);
    }
  }

  /**
   * Sleep for ms.
   * @param {number} ms - Milliseconds.
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if element exists.
   * @param {string} selector - Selector.
   * @param {number} timeout - Timeout in ms.
   * @returns {boolean}
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
   * Retry a function.
   * @param {Function} fn - Async function to retry.
   * @param {number} maxAttempts - Max retries.
   * @param {number} delayMs - Delay between retries.
   * @returns {any} Result of fn.
   * @throws {Error} If all retries fail.
   */
  async withRetry(fn, maxAttempts = config.crawler.maxRetries, delayMs = config.crawler.retryDelayMs) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        logger.warn(`Retry ${attempt}/${maxAttempts} failed: ${error.message}`);
        if (attempt < maxAttempts) await this.sleep(delayMs);
      }
    }
    throw lastError;
  }
}

module.exports = BaseCrawler;