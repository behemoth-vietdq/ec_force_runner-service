const BaseCrawler = require("./BaseCrawler");
const logger = require("../../utils/logger");
const { getErrorMessage } = require("../../utils/logger");
const { CrawlerError, ErrorCodes } = require("../../middleware/errorHandler");
const { sanitizeUrl, sanitizeCustomerId } = require("../../utils/sanitizer");
const {
  recordCrawlerExecution,
  recordCrawlerError,
  recordOrderCreated,
  recordOrderFailed,
} = require("../../utils/metrics");

// Order notifications are handled at controller level to centralize failure handling

// Centralize selectors and texts for easy maintenance
const EC_FORCE_SELECTORS = {
  login: {
    email: "#admin_email",
    password: "#admin_password",
    submit: 'input[type="submit"]',
  },
  orderForm: {
    addItem: "#add_order_item",
    productInput:
      '#add_item_product, input[name="add_item_product"], .modal input[type="text"]',
    modal: '.modal, .modal-dialog, [role="dialog"]',
    variantTable: "#variant-detail",
    addButton: 'button, input[type="submit"]', // Filter by text later
    shippingAddress: 'select[name="order[shipping_address_id]"]',
    paymentMethod:
      'select[name="order[payment_attributes][payment_method_id]"]',
    creditCard: 'select[name="order[payment_attributes][source_id]"]',
    submit: "#submit",
    errorAlert: ".alert-danger",
    performViewTd: "#perform-view td",
    orderLink: "#perform-view td a:first-child",
  },
  billingPrefix: "order[billing_address_attributes]",
};

const EC_FORCE_TEXTS = {
  loginSuccess: "ログインしました。",
  addButton: "追加する",
  paymentCredit: "クレジットカード",
  confirmButton: "ご注文完了へ",
};

class EcForceOrderCrawler extends BaseCrawler {
  constructor(options = {}) {
    super(options);

    // Validate required inputs
    this._validateInputs(options);

    // Store inputs
    this.account = options.account;
    this.customer = options.customer;
    this.formData = options.formData;

    // Extract EC-Force credentials from account options
    const ecForceInfo = this.account?.options?.ec_force_info;
    if (!ecForceInfo) {
      throw new CrawlerError(
        "Missing ec_force_info in account options",
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    // Validate and sanitize shop URL
    if (!ecForceInfo.shop_url) {
      throw new CrawlerError(
        "Missing shop_url in ec_force_info",
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    try {
      this.shopUrl = sanitizeUrl(ecForceInfo.shop_url);
    } catch (error) {
      throw new CrawlerError(
        `Invalid shop_url: ${error.message}`,
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    // Validate credentials
    if (!ecForceInfo.email || !ecForceInfo.password) {
      throw new CrawlerError(
        "Missing email or password in ec_force_info",
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    this.credentials = {
      admin_email: ecForceInfo.email,
      admin_password: ecForceInfo.password,
    };
    
    this.orderResult = null;
    this._shopHostname = this._extractHostname(this.shopUrl);
  }

  /**
   * Extract hostname from URL for metrics
   * @private
   */
  _extractHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Override to provide shop identifier for metrics
   * @protected
   */
  _getShopIdentifier() {
    return this._shopHostname || 'unknown';
  }

  /**
   * Validate required inputs
   * @private
   */
  _validateInputs(options) {
    const { account, customer, formData } = options;

    if (!account || typeof account !== "object") {
      throw new CrawlerError(
        "Invalid or missing account data",
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    if (!customer || typeof customer !== "object") {
      throw new CrawlerError(
        "Invalid or missing customer data",
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    if (!formData || typeof formData !== "object") {
      throw new CrawlerError(
        "Invalid or missing form_data",
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    // Validate required form fields
    if (!formData.customer_id) {
      throw new CrawlerError(
        "Missing customer_id in form_data",
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    if (!formData.product?.name) {
      throw new CrawlerError(
        "Missing product.name in form_data",
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    if (!formData.shipping_address_id) {
      throw new CrawlerError(
        "Missing shipping_address_id in form_data",
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }
  }

  /**
   * Main execution method with metrics tracking.
   * @returns {Object} Success result or throws error.
   */
  async execute() {
    const startTime = Date.now();
    const shop = this._getShopIdentifier();

    logger.info(
      `Starting EC-Force order creation - shop: ${shop}, formCustomerId: ${this.formData.customer_id}`
    );

    try {
      // Initialize browser
      await this.initBrowser();
      this.ensureBrowserConnected();

      await this.page.setViewport({ width: 1920, height: 1080 });

      // Execute order creation flow
      await this.run();

      const executionTime = Date.now() - startTime;
      const executionTimeSeconds = executionTime / 1000;
      
      // Record success metrics
      recordCrawlerExecution('success', shop, executionTimeSeconds);
      recordOrderCreated(shop);
      
      logger.info(
        `Order creation completed successfully - shop: ${shop}, executionTime: ${executionTime}ms, orderId: ${this.orderResult?.order_id}, orderNumber: ${this.orderResult?.order_number}`
      );

      return {
        success: true,
        data: this.orderResult,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const executionTimeSeconds = executionTime / 1000;

      // Wrap undefined/null errors
      const wrappedError = this._wrapError(error);
      const errorCode = wrappedError.code || 'UNKNOWN_ERROR';

      // Record failure metrics
      recordCrawlerExecution('failed', shop, executionTimeSeconds);
      recordOrderFailed(shop, errorCode);

      logger.error(
        `Order creation failed - shop: ${shop}, executionTime: ${executionTime}ms, errorCode: ${errorCode}, error: ${getErrorMessage(wrappedError)}`
      );
      
      if (wrappedError.stack) {
        logger.error(`Stack trace: ${wrappedError.stack}`);
      }

      await this.handleError(
        wrappedError,
        `ec_order_failed_${this.customer.ext_id}_${Date.now()}`
      );
      
      throw wrappedError;
    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * Wrap undefined/null errors into CrawlerError
   * @private
   */
  _wrapError(error) {
    if (error === undefined || error === null) {
      logger.error("Undefined/null error occurred - creating stack trace");
      return new CrawlerError(
        "Unknown error occurred (error was undefined)",
        ErrorCodes.INTERNAL_ERROR,
        500,
        { stack: new Error().stack }
      );
    }
    
    if (error instanceof CrawlerError) {
      return error;
    }
    
    return CrawlerError.from(error);
  }

  /**
   * Main order creation flow.
   * Critical steps use withRetry for resilience.
   * Each step is timed for metrics.
   */
  async run() {
    // Ensure browser is still connected before starting
    this.ensureBrowserConnected();

    // Step 1: Login (with retry)
    this.startStep('login');
    await this.withRetry(
      () => this.login(),
      3,
      2000,
      { stepName: 'login' }
    );
    this.endStep('login');

    // Step 2: Navigate to order form
    this.startStep('navigate');
    await this.navigateToOrderForm();
    this.endStep('navigate');

    // Step 3: Fill order form (with retry for flaky interactions)
    this.startStep('fill_form');
    await this.withRetry(
      () => this.fillOrderForm(),
      2,
      1000,
      { stepName: 'fill_form' }
    );
    this.endStep('fill_form');

    // Step 4: Submit order and confirm
    this.startStep('submit');
    await this.submitAndConfirmOrder();
    this.endStep('submit');

    // Step 5: Extract order details
    this.startStep('extract');
    await this.extractOrderDetails();
    this.endStep('extract');
  }

  /**
   * Submit order form and confirm in one flow.
   */
  async submitAndConfirmOrder() {
    logger.info("Step 4: Submitting order for review");

    await this.page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    );

    await this._submitOrderForm();
    await this._verifySubmission();
    await this._confirmOrder();
    await this._waitForOrderCompletion();

    logger.info("Order confirmed successfully");
  }

  /**
   * Submit the order form
   * @private
   */
  async _submitOrderForm() {
    await this.clickElement(EC_FORCE_SELECTORS.orderForm.submit);
    await this.page.waitForNavigation({
      waitUntil: "load",
      timeout: this.options.timeout,
    });
  }

  /**
   * Verify order submission was successful
   * @private
   */
  async _verifySubmission() {
    const hasError = await this.elementExists(
      EC_FORCE_SELECTORS.orderForm.errorAlert,
      2000
    );

    if (hasError) {
      const errorMsg = await this.page.evaluate(
        (sel) => document.querySelector(sel)?.textContent.trim(),
        EC_FORCE_SELECTORS.orderForm.errorAlert
      );
      await this.takeScreenshot("submit_error.png");

      throw new CrawlerError(
        `Order submission failed: ${errorMsg || "Unknown error"}`,
        ErrorCodes.ORDER_SUBMISSION_FAILED,
        400,
        { errorMessage: errorMsg }
      );
    }

    const hasConfirm = await this.page.evaluate(
      (text) => document.body.textContent.includes(text),
      EC_FORCE_TEXTS.confirmButton
    );

    if (!hasConfirm) {
      await this.takeScreenshot("no_confirmation.png");
      throw new CrawlerError(
        "Confirmation page not loaded - expected confirmation button not found",
        ErrorCodes.ORDER_SUBMISSION_FAILED,
        500
      );
    }

    logger.info("Order submitted successfully - now confirming");
  }

  /**
   * Confirm order on confirmation page
   * @private
   */
  async _confirmOrder() {
    await this.page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    );

    const clicked = await this._clickConfirmButton();
    if (!clicked) {
      await this.takeScreenshot("confirm_failed.png").catch(() => {});
      throw new CrawlerError(
        "Could not confirm order - confirm button interaction failed",
        ErrorCodes.ORDER_SUBMISSION_FAILED,
        500
      );
    }
  }

  /**
   * Try to click the confirm button using multiple strategies
   * @private
   */
  async _clickConfirmButton() {
    const maxAttempts = 3;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Try to find and click button with text matching
        const clicked = await this._tryConfirmButtonClick();
        if (clicked) {
          await this._waitForClickResponse();
          return true;
        }
      } catch (err) {
        logger.warn(
          `Click attempt ${attempt} failed for confirm button: ${err.message}`
        );
        if (attempt < maxAttempts) {
          await this.sleep(500);
        }
      }
    }
    
    return false;
  }

  /**
   * Try various strategies to click the confirm button
   * @private
   */
  async _tryConfirmButtonClick() {
    // Strategy 1: Find by exact text match
    const selector = await this._findConfirmButtonSelector();
    if (selector && await this._clickBySelector(selector)) {
      return true;
    }

    // Strategy 2: Try predefined selectors
    if (await this._clickByPredefinedSelectors()) {
      return true;
    }

    // Strategy 3: JavaScript click as fallback
    return await this._clickConfirmByEval();
  }

  /**
   * Find confirm button selector by text
   * @private
   */
  async _findConfirmButtonSelector() {
    return await this.page.evaluate((confirmText) => {
      const all = Array.from(
        document.querySelectorAll('button, input[type="submit"]')
      );
      const node = all.find((n) =>
        (n.textContent || n.value || "").includes(confirmText)
      );
      if (!node) return null;
      if (node.id) return `#${node.id}`;
      if (node.name) return `button[name="${node.name}"]`;
      return null;
    }, EC_FORCE_TEXTS.confirmButton);
  }

  /**
   * Click element by selector
   * @private
   */
  async _clickBySelector(selector) {
    try {
      await this.page.waitForSelector(selector, {
        visible: true,
        timeout: 3000,
      });
      const el = await this.page.$(selector);
      if (el) {
        await el.click({ delay: 50 });
        return true;
      }
    } catch (e) {
      // Selector not found or click failed, try next strategy
      return false;
    }
    return false;
  }

  /**
   * Try clicking using predefined selectors
   * @private
   */
  async _clickByPredefinedSelectors() {
    const confirmSelectors = [
      `button:contains("${EC_FORCE_TEXTS.confirmButton}")`,
      `input[type="submit"][value*="${EC_FORCE_TEXTS.confirmButton}"]`,
      'button[type="submit"]',
      'input[type="submit"]',
    ];

    for (const sel of confirmSelectors) {
      if (await this._clickBySelector(sel)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Click confirm button using JavaScript evaluation
   * @private
   */
  async _clickConfirmByEval() {
    return await this.page.evaluate((text) => {
      const buttons = Array.from(
        document.querySelectorAll('button, input[type="submit"]')
      );
      const btn = buttons.find((b) =>
        (b.textContent || b.value || "").includes(text)
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, EC_FORCE_TEXTS.confirmButton);
  }

  /**
   * Wait for response after clicking
   * @private
   */
  async _waitForClickResponse() {
    try {
      await Promise.race([
        this.page.waitForNavigation({
          waitUntil: "networkidle0",
          timeout: 5000,
        }),
        this.sleep(1500),
      ]);
    } catch (e) {
      // Navigation may not happen immediately; ignore and continue
    }
  }

  /**
   * Wait for order completion
   * @private
   */
  async _waitForOrderCompletion() {
    await this.page.waitForNavigation({
      waitUntil: "networkidle0",
      timeout: this.options.timeout,
    });
  }
  async login() {
    // Mask email for logging (show first 2 chars and domain)
    const maskedEmail = this._maskEmail(this.credentials.admin_email);
    logger.info(`Step 1: Logging in to EC-Force - email: ${maskedEmail}`);

    await this.navigateToUrl(`${this.shopUrl}/admin`);

    // Check if already authenticated
    if (!(await this.elementExists(EC_FORCE_SELECTORS.login.email, 2000))) {
      logger.info("Already authenticated, skipping login");
      return;
    }

    // Fill login form and submit using page.evaluate for atomicity
    const loginResult = await this.page.evaluate(
      (selectors, email, password) => {
        const emailEl = document.querySelector(selectors.email);
        const passwordEl = document.querySelector(selectors.password);
        const submitEl = document.querySelector(selectors.submit);
        
        if (!emailEl || !passwordEl || !submitEl) {
          return { success: false, error: 'Login form elements not found' };
        }
        
        emailEl.value = email;
        passwordEl.value = password;
        submitEl.click();
        return { success: true };
      },
      EC_FORCE_SELECTORS.login,
      this.credentials.admin_email,
      this.credentials.admin_password
    );

    if (!loginResult.success) {
      await this.takeScreenshot("login_form_error.png", 'error');
      throw new CrawlerError(
        `Login form error: ${loginResult.error}`,
        ErrorCodes.LOGIN_FAILED,
        500
      );
    }

    // Wait for navigation with timeout
    await this.page
      .waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 })
      .catch(() => {
        // Navigation timeout expected if already on page
      });

    // Verify login success
    const hasSuccess = await this.page.evaluate(
      (text) => document.body.textContent.includes(text),
      EC_FORCE_TEXTS.loginSuccess
    );

    if (!hasSuccess) {
      await this.takeScreenshot("login_failed.png", 'error');
      throw new CrawlerError(
        "Login failed - invalid credentials or page structure changed",
        ErrorCodes.LOGIN_FAILED,
        401
      );
    }

    logger.info("Login successful");
  }

  /**
   * Mask email for logging
   * @private
   */
  _maskEmail(email) {
    if (!email || typeof email !== 'string') return '***';
    const match = email.match(/^(.{2}).*(@.+)$/);
    return match ? `${match[1]}***${match[2]}` : '***@***';
  }

  /**
   * Navigate to order form.
   */
  async navigateToOrderForm() {
    const customerId = this.formData.customer_id;
    
    // Sanitize customer ID to prevent injection
    let sanitizedCustomerId;
    try {
      sanitizedCustomerId = sanitizeCustomerId(customerId);
    } catch (error) {
      throw new CrawlerError(
        `Invalid customer_id: ${error.message}`,
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }
    
    logger.info(`Step 2: Navigating to order form - customerId: ${sanitizedCustomerId}`);

    // Build URL safely using URL constructor
    const orderFormUrl = new URL(`${this.shopUrl}/admin/oi/order/new`);
    orderFormUrl.searchParams.set('customer_id', sanitizedCustomerId);
    
    await this.page.goto(orderFormUrl.toString(), {
      waitUntil: "load",
      timeout: this.options.timeout,
    });

    // Verify order form loaded
    if (
      !(await this.elementExists(EC_FORCE_SELECTORS.orderForm.addItem, 5000))
    ) {
      await this.takeScreenshot("order_form_not_found.png", 'error');
      throw new CrawlerError(
        `Order form not found - customer_id ${sanitizedCustomerId} may be invalid`,
        ErrorCodes.BROWSER_NAVIGATION_FAILED,
        404
      );
    }

    logger.info("Order form loaded successfully");
  }

  /**
   * Fill order form with all required information.
   */
  async fillOrderForm() {
    const { product, shipping_address_id, payment_method_id, billing_address } = this.formData;
    
    logger.info(
      `Step 3: Filling order form - product: ${product.name}, shippingAddressId: ${shipping_address_id}, hasPaymentMethod: ${!!payment_method_id}, hasBillingAddress: ${!!billing_address}`
    );

    await this.addProductToOrder();
    await this.selectShippingAddress();

    if (payment_method_id) {
      await this.selectPaymentMethod();
    }

    logger.info("Order form filled successfully");
  }

  /**
   * Add product to order.
   */
  async addProductToOrder() {
    const productName = this.formData.product.name;
    logger.info(`Adding product to order - productName: ${productName}`);

    await this._openAddItemModal();
    await this._fillProductInput(productName);
    await this._waitForVariantTable();
    await this._clickAddButton();

    await this.sleep(1000);
    logger.info("Product added successfully");
  }

  /**
   * Open add item modal
   * @private
   */
  async _openAddItemModal() {
    const btn = await this.page.$(EC_FORCE_SELECTORS.orderForm.addItem);
    if (!btn) {
      throw new CrawlerError(
        "Add item button not found",
        ErrorCodes.ELEMENT_NOT_FOUND,
        500
      );
    }

    const isClickable = await this._isButtonClickable(btn);
    if (!isClickable) {
      await this.takeScreenshot("add_button_not_clickable.png");
      throw new CrawlerError(
        "Add item button not clickable",
        ErrorCodes.ELEMENT_INTERACTION_FAILED,
        500
      );
    }

    await btn.click();
    logger.debug("Add item button clicked");

    await this.page.waitForSelector(EC_FORCE_SELECTORS.orderForm.modal, {
      visible: true,
      timeout: 5000,
    });
  }

  /**
   * Check if button is clickable
   * @private
   */
  async _isButtonClickable(button) {
    const isVisible = await button.isIntersectingViewport();
    const isEnabled = await this.page.evaluate((el) => !el.disabled, button);
    return isVisible && isEnabled;
  }

  /**
   * Fill product input field
   * @private
   */
  async _fillProductInput(productName) {
    const productInput = await this.page.waitForSelector(
      EC_FORCE_SELECTORS.orderForm.productInput,
      { visible: true, timeout: 5000 }
    );

    await productInput.click();
    await productInput.type(productName, { delay: 100 });
    await productInput.press("Tab");
    logger.debug("Product name entered");
  }

  /**
   * Wait for variant table to load
   * @private
   */
  async _waitForVariantTable() {
    await this.page.waitForFunction(
      (selector) => {
        const table = document.querySelector(selector);
        return table && table.innerHTML.trim() !== "";
      },
      { timeout: 5000 },
      EC_FORCE_SELECTORS.orderForm.variantTable
    );
    logger.debug("Variant table loaded");
  }

  /**
   * Click add button in modal
   * @private
   */
  async _clickAddButton() {
    await this.page.evaluate((texts) => {
      const buttons = Array.from(
        document.querySelectorAll('button, input[type="submit"]')
      );
      const addBtn = buttons.find(
        (btn) =>
          btn.textContent.includes(texts.addButton) ||
          btn.value?.includes(texts.addButton)
      );
      if (!addBtn) {
        throw new Error("Add button not found in modal");
      }
      addBtn.click();
    }, EC_FORCE_TEXTS);
  }

  /**
   * Select shipping address from dropdown.
   */
  async selectShippingAddress() {
    const addressId = this.formData.shipping_address_id;
    logger.info(`Selecting shipping address - addressId: ${addressId}`);

    await this.selectOption(
      EC_FORCE_SELECTORS.orderForm.shippingAddress,
      addressId
    );

    logger.debug("Shipping address selected");
  }

  /**
   * Fill billing address form.
   */
  async fillBillingAddress() {
    logger.info("Filling billing address");
    const addr = this.formData.billing_address;
    const prefix = EC_FORCE_SELECTORS.billingPrefix;

    const fields = [
      { name: "name", value: addr.name },
      { name: "name01", value: addr.name01 },
      { name: "name02", value: addr.name02 },
      { name: "kana01", value: addr.kana01 },
      { name: "kana02", value: addr.kana02 },
      { name: "zip01", value: addr.zip01 },
      { name: "zip02", value: addr.zip02 },
      { name: "addr02", value: addr.addr02 },
      { name: "tel01", value: addr.tel01 },
      { name: "tel02", value: addr.tel02 },
      { name: "tel03", value: addr.tel03 },
    ];

    for (const field of fields) {
      if (field.value) {
        await this.fillInput(
          `input[name="${prefix}[${field.name}]"]`,
          field.value
        );
      }
    }

    logger.debug("Billing address filled");
  }

  /**
   * Select payment method (credit card or other).
   */
  async selectPaymentMethod() {
    const { payment_method_id, credit_card_id } = this.formData;
    logger.info(`Selecting payment method - paymentMethodId: ${payment_method_id}`);

    await this.selectOption(
      EC_FORCE_SELECTORS.orderForm.paymentMethod,
      payment_method_id
    );

    if (credit_card_id) {
      await this._selectCreditCard(credit_card_id);
    }

    logger.debug("Payment method selected");
  }

  /**
   * Select credit card if available
   * @private
   */
  async _selectCreditCard(creditCardId) {
    await this.sleep(500);

    if (await this.elementExists(EC_FORCE_SELECTORS.orderForm.creditCard, 2000)) {
      await this.selectOption(
        EC_FORCE_SELECTORS.orderForm.creditCard,
        creditCardId
      );
      logger.debug("Credit card selected");
    }
  }

  /**
   * Submit order form for review.
   */
  /**
   * Extract order details from success page.
   */
  async extractOrderDetails() {
    logger.info(`Step 6: Extracting order details - url: ${this.page.url()}`);

    // Verify we're on success page
    if (
      !(await this.elementExists(
        EC_FORCE_SELECTORS.orderForm.performViewTd,
        5000
      ))
    ) {
      const errorMsg = await this.page.evaluate(
        (sel) => document.querySelector(sel)?.textContent.trim(),
        EC_FORCE_SELECTORS.orderForm.errorAlert
      );

      await this.takeScreenshot("extract_failed.png");
      throw new CrawlerError(
        `Failed to extract order details: ${
          errorMsg || "Success page not loaded"
        }`,
        ErrorCodes.ORDER_VALIDATION_FAILED,
        500,
        { errorMessage: errorMsg }
      );
    }

    // Extract order summary from table
    const tdTexts = await this.page.$$eval(
      EC_FORCE_SELECTORS.orderForm.performViewTd,
      (tds) => tds.map((td) => td.textContent.trim())
    );

    if (tdTexts.length < 3) {
      throw new CrawlerError(
        "Order table incomplete - expected at least 3 columns",
        ErrorCodes.ORDER_VALIDATION_FAILED,
        500,
        { foundColumns: tdTexts.length }
      );
    }

    const [orderNumber, customerNumber, total] = tdTexts;
    logger.debug(
      `Order summary extracted - orderNumber: ${orderNumber}, customerNumber: ${customerNumber}, total: ${total}`
    );

    // Verify order number appears in page (redundant check)
    const hasOrder = await this.page.evaluate(
      (num) => document.body.textContent.includes(num),
      orderNumber
    );

    if (!hasOrder) {
      throw new CrawlerError(
        "Order number verification failed",
        ErrorCodes.ORDER_VALIDATION_FAILED,
        500
      );
    }

    // Navigate to order detail page
    await this.clickElement(EC_FORCE_SELECTORS.orderForm.orderLink);
    await this.page.waitForNavigation({
      waitUntil: "networkidle0",
      timeout: this.options.timeout,
    });

    // Extract order ID from detail page
    const orderId = await this.page.evaluate(() => {
      const rows = document.querySelectorAll("tr");
      for (const row of rows) {
        const th = row.querySelector("th");
        if (th?.textContent.trim() === "ID") {
          return row.querySelector("td")?.textContent.trim() || null;
        }
      }
      return null;
    });

    if (!orderId) {
      logger.warn("Order ID not found on detail page");
    }

    // Build result object
    this.orderResult = {
      order_id: orderId,
      order_number: orderNumber,
      customer_number: customerNumber,
      total_amount: total,
      customer_ext_id: this.customer.ext_id,
      customer_id: this.customer.id,
      account_id: this.account.id,
      created_at: new Date().toISOString(),
      order_url: this.page.url(),
    };

    logger.info(
      `Order details extracted successfully - orderId: ${orderId}, orderNumber: ${orderNumber}, orderUrl: ${this.page.url()}`
    );
  }
}
module.exports = EcForceOrderCrawler;
