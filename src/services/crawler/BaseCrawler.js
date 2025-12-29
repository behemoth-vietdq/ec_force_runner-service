const puppeteer = require("puppeteer");
const config = require("../../config");
const constants = require("../../config/constants");
const logger = require("../../utils/logger");
const { getErrorMessage } = require("../../utils/logger");
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
    // Don't re-initialize if browser already exists
    if (this.browser && this.page) {
      logger.debug('Browser already initialized, skipping');
      return this.page;
    }

    let browser = null;
    try {
      const headless = this.options.headless;

      logger.info(`Initializing browser - headless: ${headless}`);

      browser = await this._launchBrowser(headless);
      const page = await browser.newPage();

      if (this.options.userAgent) {
        await page.setUserAgent(this.options.userAgent);
      }

      page.setDefaultTimeout(this.options.timeout);

      // Use 'once' instead of 'on' to prevent memory leaks
      if (config.crawler.debugging) {
        page.on("console", this._handleConsoleLog);
      }
      page.on("pageerror", this._handlePageError);

      // Store references only after successful initialization
      this.browser = browser;
      this.page = page;

      logger.info("Browser initialized successfully");
      return this.page;
    } catch (error) {
      logger.error(`Failed to initialize browser: ${getErrorMessage(error)}`);
      
      // Critical: close browser if it was created but page setup failed
      if (browser) {
        try {
          await browser.close();
          logger.debug('Cleaned up browser after init failure');
        } catch (cleanupError) {
          logger.error('Failed to cleanup browser:', cleanupError);
        }
      }
      
      throw new CrawlerError(
        "Failed to initialize browser",
        ErrorCodes.BROWSER_INIT_FAILED,
        500,
        { originalError: getErrorMessage(error) }
      );
    }
  }

  /**
   * Launch browser with appropriate configuration
   */
  async _launchBrowser(headless) {
    return await puppeteer.launch({
      headless,
      executablePath: headless ? undefined : this._getChromeExecutablePath(),
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
   * Get Chrome executable path based on platform
   * @private
   */
  _getChromeExecutablePath() {
    // Check environment variable first
    if (process.env.CHROME_EXECUTABLE_PATH) {
      logger.info(`Using Chrome from env: ${process.env.CHROME_EXECUTABLE_PATH}`);
      return process.env.CHROME_EXECUTABLE_PATH;
    }

    // Platform-specific default paths
    const platformPaths = {
      darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      linux: '/usr/bin/google-chrome',
      win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    };

    const platform = process.platform;
    const chromePath = platformPaths[platform];

    if (!chromePath) {
      logger.warn(`Unknown platform: ${platform}, using Puppeteer's bundled Chromium`);
      return undefined;
    }

    logger.info(`Using Chrome for ${platform}: ${chromePath}`);
    return chromePath;
  }

  /**
   * Event handler for console logs (bound to instance)
   * @private
   */
  _handleConsoleLog = (msg) => {
    logger.debug(`Browser console [${msg.type()}]: ${msg.text()}`);
  };

  /**
   * Event handler for page errors (bound to instance)
   * @private
   */
  _handlePageError = (error) => {
    logger.error("Page error", { error: getErrorMessage(error) });
  };

  /**
   * Close browser safely with proper cleanup
   */
  async closeBrowser() {
    // Atomically check and clear references to prevent double-close
    const browser = this.browser;
    const page = this.page;
    
    if (!browser) {
      return; // Already closed
    }

    // Clear references immediately to prevent race conditions
    this.browser = null;
    this.page = null;

    try {
      // Remove event listeners to prevent memory leaks
      if (page) {
        page.removeListener("console", this._handleConsoleLog);
        page.removeListener("pageerror", this._handlePageError);
      }
      
      await browser.close();
      logger.info("Browser closed successfully");
    } catch (error) {
      logger.error("Error closing browser:", error);
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
        { url, originalError: getErrorMessage(error) }
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
        { selector, originalError: getErrorMessage(error) }
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
          `Click attempt ${attempt} failed for ${selector}: ${getErrorMessage(error)}`
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
        logger.warn(`Fill attempt ${attempt} failed: ${getErrorMessage(error)}`);
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
        { selector, value, originalError: getErrorMessage(error) }
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
      `Error in ${context}: ${getErrorMessage(error)}\nStack: ${error?.stack || ''}`
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
        logger.warn(`Retry ${attempt}/${maxAttempts} failed: ${getErrorMessage(error)}`);
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
