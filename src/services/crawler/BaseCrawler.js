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
const {
  recordCrawlerExecution,
  recordCrawlerError,
  recordCrawlerStep,
  recordScreenshot,
} = require("../../utils/metrics");

/**
 * Base Crawler with common Puppeteer operations
 * Provides browser initialization, navigation, element interactions, error handling
 * 
 * Features:
 * - Browser lifecycle management with proper cleanup
 * - Retry logic with exponential backoff
 * - Screenshot capture on errors
 * - Prometheus metrics integration
 * - Timeout handling
 */
class BaseCrawler {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.options = { ...config.puppeteer, ...options };
    this.startTime = Date.now();
    this.stepTimings = {}; // Track step execution times
    this.isClosing = false; // Prevent concurrent close operations
  }

  /**
   * Get execution time in seconds
   */
  getExecutionTimeSeconds() {
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Start timing a step
   */
  startStep(stepName) {
    this.stepTimings[stepName] = Date.now();
    logger.debug(`Starting step: ${stepName}`);
  }

  /**
   * End timing a step and record metrics
   */
  endStep(stepName) {
    const startTime = this.stepTimings[stepName];
    if (startTime) {
      const durationSeconds = (Date.now() - startTime) / 1000;
      recordCrawlerStep(stepName, durationSeconds);
      logger.debug(`Step ${stepName} completed in ${durationSeconds.toFixed(2)}s`);
      delete this.stepTimings[stepName];
      return durationSeconds;
    }
    return 0;
  }

  /**
   * Initialize browser instance with timeout protection
   */
  async initBrowser() {
    // Don't re-initialize if browser already exists
    if (this.browser && this.page) {
      logger.debug('Browser already initialized, skipping');
      return this.page;
    }

    this.startStep('browser_init');
    let browser = null;
    
    try {
      const headless = this.options.headless;
      const initTimeout = constants.HEALTH_CHECK.BROWSER_TEST_TIMEOUT * 2; // 10s for init

      logger.info(`Initializing browser - headless: ${headless}`);

      // Launch browser with timeout protection
      browser = await this._withTimeout(
        this._launchBrowser(headless),
        initTimeout,
        'Browser launch timeout'
      );
      
      const page = await browser.newPage();

      // Set user agent if provided
      if (this.options.userAgent) {
        await page.setUserAgent(this.options.userAgent);
      }

      // Set default timeout for all operations
      page.setDefaultTimeout(this.options.timeout);
      page.setDefaultNavigationTimeout(this.options.timeout);

      // Set up event handlers
      if (config.crawler.debugging) {
        page.on("console", this._handleConsoleLog);
      }
      page.on("pageerror", this._handlePageError);
      
      // Handle dialog boxes automatically (prevent hanging)
      page.on("dialog", async (dialog) => {
        logger.warn(`Dialog appeared: ${dialog.type()} - ${dialog.message()}`);
        await dialog.dismiss().catch(() => {});
      });

      // Store references only after successful initialization
      this.browser = browser;
      this.page = page;

      this.endStep('browser_init');
      logger.info("Browser initialized successfully");
      return this.page;
    } catch (error) {
      this.endStep('browser_init');
      logger.error(`Failed to initialize browser: ${getErrorMessage(error)}`);
      recordCrawlerError('BROWSER_INIT_FAILED', 'unknown');
      
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
   * Execute promise with timeout
   * @private
   */
  async _withTimeout(promise, timeoutMs, errorMessage) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new CrawlerError(errorMessage, ErrorCodes.TIMEOUT_ERROR, 504));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
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
   * Forces browser termination if graceful close fails
   * Thread-safe: prevents concurrent close operations
   */
  async closeBrowser() {
    // Prevent concurrent close operations
    if (this.isClosing) {
      logger.debug('Browser close already in progress, skipping');
      return;
    }
    
    // Atomically check and clear references to prevent double-close
    const browser = this.browser;
    const page = this.page;
    
    if (!browser) {
      return; // Already closed
    }

    this.isClosing = true;
    
    // Clear references immediately to prevent race conditions
    this.browser = null;
    this.page = null;

    const closeTimeout = 10000; // 10 seconds

    try {
      // Remove event listeners to prevent memory leaks
      if (page) {
        try {
          page.off("console", this._handleConsoleLog);
          page.off("pageerror", this._handlePageError);
          page.removeAllListeners("dialog");
        } catch (e) {
          // Ignore errors removing listeners
        }
      }
      
      // Close all pages first to prevent orphaned pages
      try {
        const pages = await browser.pages();
        await Promise.all(pages.map(p => p.close().catch(e => {
          logger.warn(`Failed to close page: ${e.message}`);
        })));
      } catch (e) {
        logger.warn(`Failed to get/close pages: ${e.message}`);
      }
      
      // Close browser with timeout
      await this._withTimeout(
        browser.close(),
        closeTimeout,
        'Browser close timeout'
      );
      
      logger.info("Browser closed successfully");
    } catch (error) {
      logger.error(`Error closing browser: ${getErrorMessage(error)}`);
      
      // Force kill browser process if close failed
      this._forceKillBrowser(browser);
    } finally {
      this.isClosing = false;
    }
  }

  /**
   * Force kill browser process
   * @private
   */
  _forceKillBrowser(browser) {
    try {
      const browserProcess = browser.process();
      if (browserProcess && !browserProcess.killed) {
        logger.warn('Force killing browser process');
        browserProcess.kill('SIGKILL');
        logger.info('Browser process killed');
      }
    } catch (killError) {
      logger.error(`Failed to kill browser process: ${getErrorMessage(killError)}`);
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
        await this._performClick(selector, options);
        logger.debug(`Element clicked: ${selector}`);
        return;
      } catch (error) {
        lastError = error;
        logger.warn(
          `Click attempt ${attempt} failed for ${selector}: ${getErrorMessage(error)}`
        );
        if (attempt < maxRetries) {
          await this.sleep(constants.DELAYS.BETWEEN_RETRIES);
        }
      }
    }

    // Fallback to JS click
    if (await this._tryJsClick(selector)) {
      return;
    }

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

  /**
   * Perform click on element
   * @private
   */
  async _performClick(selector, options) {
    const element = await this.waitForElement(selector, options);
    await this._scrollIntoView(element);
    await this.sleep(constants.DELAYS.AFTER_SCROLL);
    await element.click();
  }

  /**
   * Scroll element into view
   * @private
   */
  async _scrollIntoView(element) {
    await this.page.evaluate(
      (el) => el.scrollIntoView({ behavior: "smooth", block: "center" }),
      element
    );
  }

  /**
   * Try JavaScript click as fallback
   * @private
   */
  async _tryJsClick(selector) {
    try {
      await this.page.evaluate(
        (sel) => document.querySelector(sel)?.click(),
        selector
      );
      logger.info(`JS click successful: ${selector}`);
      return true;
    } catch {
      return false;
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
        await this._fillAndVerify(selector, value, options);
        logger.debug(`Input filled: ${selector} = ${value}`);
        return;
      } catch (error) {
        lastError = error;
        logger.warn(`Fill attempt ${attempt} failed: ${getErrorMessage(error)}`);
        if (attempt < maxRetries) {
          await this.sleep(constants.DELAYS.BETWEEN_RETRIES);
        }
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
   * Fill input and verify value
   * @private
   */
  async _fillAndVerify(selector, value, options) {
    const element = await this.waitForElement(selector, options);
    await this._scrollIntoView(element);
    await this.sleep(constants.DELAYS.BEFORE_CLICK);
    await element.click();
    await this.sleep(constants.DELAYS.BEFORE_TYPE);

    // Clear and type
    await this._clearInput(selector);
    await element.type(value, { delay: constants.DELAYS.TYPING_DELAY });

    // Verify
    const actualValue = await this._getInputValue(selector);
    if (actualValue !== value) {
      throw new Error(`Value mismatch: expected ${value}, got ${actualValue}`);
    }
  }

  /**
   * Clear input field
   * @private
   */
  async _clearInput(selector) {
    await this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.value = "";
    }, selector);
  }

  /**
   * Get input field value
   * @private
   */
  async _getInputValue(selector) {
    return await this.page.evaluate(
      (sel) => document.querySelector(sel)?.value,
      selector
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
   * Take screenshot with metrics tracking
   */
  async takeScreenshot(filename = null, type = 'debug') {
    if (!this.page) {
      logger.warn("Cannot take screenshot: page is null");
      return null;
    }
    try {
      const result = await saveScreenshot(this.page, filename);
      recordScreenshot(type);
      return result;
    } catch (error) {
      logger.error("Failed to take screenshot:", error);
      return null;
    }
  }

  /**
   * Handle error with logging, screenshot, and metrics
   */
  async handleError(error, context = "") {
    const errorCode = error?.code || 'UNKNOWN_ERROR';
    
    logger.error(
      `Error in ${context}: ${getErrorMessage(error)}\nStack: ${error?.stack || ''}`
    );
    
    // Record error metric
    recordCrawlerError(errorCode, this._getShopIdentifier());
    
    // Take error screenshot
    if (this.page && config.crawler.screenshotsEnabled) {
      await saveErrorScreenshot(this.page, error, context);
      recordScreenshot('error');
    }
  }

  /**
   * Get shop identifier for metrics (override in subclass)
   * @protected
   */
  _getShopIdentifier() {
    return 'unknown';
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
   * Retry function with configurable attempts and exponential backoff
   */
  async withRetry(
    fn,
    maxAttempts = constants.RETRIES.DEFAULT_MAX,
    initialDelayMs = constants.DELAYS.BETWEEN_RETRIES * 2,
    options = {}
  ) {
    const { stepName = 'operation', backoffMultiplier = 2 } = options;
    let lastError;
    let currentDelay = initialDelayMs;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        const isLastAttempt = attempt >= maxAttempts;
        const logLevel = isLastAttempt ? 'error' : 'warn';
        
        logger[logLevel](
          `${stepName} attempt ${attempt}/${maxAttempts} failed: ${getErrorMessage(error)}`
        );
        
        if (!isLastAttempt) {
          logger.info(`Retrying ${stepName} in ${currentDelay}ms...`);
          await this.sleep(currentDelay);
          currentDelay = Math.min(currentDelay * backoffMultiplier, 30000); // Max 30s
        }
      }
    }
    
    // Ensure we always throw a proper error
    if (!lastError) {
      lastError = new Error(`${stepName} failed with unknown error`);
    }
    throw lastError;
  }

  /**
   * Execute operation with total timeout
   * Useful for operations that may hang indefinitely
   */
  async withTotalTimeout(fn, timeoutMs, operationName = 'operation') {
    return this._withTimeout(
      fn(),
      timeoutMs,
      `${operationName} exceeded timeout of ${timeoutMs}ms`
    );
  }

  /**
   * Check if browser is still connected
   */
  isBrowserConnected() {
    return this.browser && this.browser.isConnected();
  }

  /**
   * Ensure browser is still connected, throw if not
   */
  ensureBrowserConnected() {
    if (!this.isBrowserConnected()) {
      throw new CrawlerError(
        'Browser disconnected unexpectedly',
        ErrorCodes.BROWSER_INIT_FAILED,
        500
      );
    }
  }
}

module.exports = BaseCrawler;
