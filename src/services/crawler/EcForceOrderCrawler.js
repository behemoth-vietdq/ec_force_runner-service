const BaseCrawler = require("./BaseCrawler");
const logger = require("../../utils/logger");
const { CrawlerError, ErrorCodes } = require("../../middleware/errorHandler");
const { sanitizeUrl, sanitizeCustomerId } = require("../../utils/sanitizer");
const { getCircuitBreaker } = require("../../utils/circuitBreaker");
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

    this.credentials = {
      admin_email: ecForceInfo.email,
      admin_password: ecForceInfo.password,
    };
    this.shopUrl = ecForceInfo.shop_url;
    this.orderResult = null;

    const maskedUrl = this.shopUrl?.replace(/:\/\/[^@]+@/, "://**:**@");
    logger.info(`EcForceOrderCrawler initialized - shopUrl: ${maskedUrl}`);
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
   * Main execution method with circuit breaker protection.
   * @returns {Object} Success result or throws error.
   */
  async execute() {
    const startTime = Date.now();

    logger.info(
      `Starting EC-Force order creation - formCustomerId: ${this.formData.customer_id}`
    );

    const circuitBreaker = getCircuitBreaker("ecforce");

    try {
      // Execute with circuit breaker protection
      await circuitBreaker.execute(async () => {
        await this.initBrowser();
        await this.page.setViewport({ width: 1920, height: 1080 });
        await this.run();
      });

      const executionTime = Date.now() - startTime;
      logger.info(
        `Order creation completed successfully - executionTime: ${executionTime}ms, orderId: ${this.orderResult?.order_id}, orderNumber: ${this.orderResult?.order_number}`
      );

      return {
        success: true,
        data: this.orderResult,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Handle circuit breaker specific errors
      if (error.code === "CIRCUIT_OPEN") {
        logger.error(
          `Circuit breaker open - service unavailable - executionTime: ${executionTime}ms`
        );
        throw new CrawlerError(
          "EC-Force service temporarily unavailable due to repeated failures",
          ErrorCodes.CRAWLER_CIRCUIT_OPEN,
          503,
          { lastError: error.lastError }
        );
      }

      if (error.code === "CIRCUIT_TIMEOUT") {
        logger.error(
          `Circuit breaker timeout - executionTime: ${executionTime}ms`
        );
        throw new CrawlerError(
          "EC-Force operation timeout",
          ErrorCodes.CRAWLER_TIMEOUT,
          504,
          { timeout: error.message }
        );
      }

      logger.error(
        `Order creation failed - executionTime: ${executionTime}ms, error: ${error.message}`
      );
      logger.error(error.stack);

      await this.handleError(
        error,
        `ec_order_failed_${this.customer.ext_id}_${Date.now()}`
      );
      throw error;
    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * Main order creation flow.
   * Critical steps use withRetry for resilience.
   */
  async run() {
    // Step 1: Login (with retry)
    await this.withRetry(() => this.login());

    // Step 2: Navigate to order form
    await this.navigateToOrderForm();

    // Step 3: Fill order form (with retry for flaky interactions)
    await this.withRetry(() => this.fillOrderForm());

    // Step 4: Submit order and confirm in one step
    await this.submitAndConfirmOrder(); // Step 6: Extract order details
    await this.extractOrderDetails();
  }

  /**
   * Submit order form and confirm in one flow.
   */
  async submitAndConfirmOrder() {
    logger.info("Step 4: Submitting order for review");

    await this.takeScreenshot("before_submit.png");
    await this.page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    );

    // Submit order form
    await this.clickElement(EC_FORCE_SELECTORS.orderForm.submit);
    await this.page.waitForNavigation({
      waitUntil: "load",
      timeout: this.options.timeout,
    });

    // Check for errors
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

    // Verify confirmation page loaded
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

    // Confirm order on confirmation page
    await this.takeScreenshot("before_confirm.png");
    await this.page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    );

    // Try to find and click confirm button using resilient puppeteer APIs
    const confirmSelectors = [
      `button:contains("${EC_FORCE_TEXTS.confirmButton}")`,
      `input[type="submit"][value*="${EC_FORCE_TEXTS.confirmButton}"]`,
      'button[type="submit"]',
      'input[type="submit"]',
    ];

    let clicked = false;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts && !clicked; attempt++) {
      try {
        // Prefer explicit text-matching selector first via evaluate to get exact node path
        const found = await this.page.evaluate((confirmText) => {
          const all = Array.from(
            document.querySelectorAll('button, input[type="submit"]')
          );
          const node = all.find((n) =>
            (n.textContent || n.value || "").includes(confirmText)
          );
          if (!node) return null;
          // build a selector fallback using data attributes if available
          if (node.id) return `#${node.id}`;
          if (node.name) return `button[name="${node.name}"]`;
          return null;
        }, EC_FORCE_TEXTS.confirmButton);

        // Try to click using found selector path first
        if (found) {
          try {
            await this.page.waitForSelector(found, {
              visible: true,
              timeout: 3000,
            });
            const el = await this.page.$(found);
            if (el) {
              await el.click({ delay: 50 });
              clicked = true;
              break;
            }
          } catch (err) {
            // ignore and fall through to other selectors
          }
        }

        // Otherwise try the prioritized selectors list via waitForSelector
        for (const sel of confirmSelectors) {
          try {
            await this.page.waitForSelector(sel, {
              visible: true,
              timeout: 2000,
            });
            const el = await this.page.$(sel);
            if (el) {
              await el.click({ delay: 50 });
              clicked = true;
              break;
            }
          } catch (err) {
            // continue to next selector
          }
        }

        // If still not clicked, attempt to click by evaluating (last resort)
        if (!clicked) {
          const evalClicked = await this.page.evaluate((text) => {
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

          if (evalClicked) clicked = true;
        }

        // After a click attempt, wait briefly for navigation or stable network
        if (clicked) {
          try {
            await Promise.race([
              this.page.waitForNavigation({
                waitUntil: "networkidle0",
                timeout: 5000,
              }),
              this.sleep(1500),
            ]);
          } catch (err) {
            // navigation may not happen immediately; ignore here
          }
        }
      } catch (err) {
        // If frame was detached or session closed, log and retry
        logger.warn(
          `Click attempt ${attempt} failed for confirm button: ${err.message}`
        );
        if (attempt === maxAttempts) {
          await this.takeScreenshot("confirm_failed.png").catch(() => {});
          throw new CrawlerError(
            "Could not confirm order - confirm button interaction failed",
            ErrorCodes.ORDER_SUBMISSION_FAILED,
            500
          );
        }
        // small backoff before retry
        await this.sleep(500);
      }
    }

    await this.page.waitForNavigation({
      waitUntil: "networkidle0",
      timeout: this.options.timeout,
    });

    logger.info("Order confirmed successfully");
  }
  async login() {
    const maskedEmail = this.credentials.admin_email.replace(
      /(.{2}).+(@.+)/,
      "$1***$2"
    );
    logger.info(`Step 1: Logging in to EC-Force - email: ${maskedEmail}`);

    await this.navigateToUrl(`${this.shopUrl}/admin`);

    // Check if already authenticated
    if (!(await this.elementExists(EC_FORCE_SELECTORS.login.email, 2000))) {
      logger.info("Already authenticated, skipping login");
      return;
    }

    // Fill login form and submit
    await this.page.evaluate(
      (selectors, email, password) => {
        document.querySelector(selectors.email).value = email;
        document.querySelector(selectors.password).value = password;
        document.querySelector(selectors.submit).click();
      },
      EC_FORCE_SELECTORS.login,
      this.credentials.admin_email,
      this.credentials.admin_password
    );

    // Wait for navigation
    await this.page
      .waitForNavigation({ waitUntil: "networkidle2", timeout: 5000 })
      .catch(() => {
        logger.debug("Navigation wait timeout (expected if already on page)");
      });

    // Verify login success
    const hasSuccess = await this.page.evaluate(
      (text) => document.body.textContent.includes(text),
      EC_FORCE_TEXTS.loginSuccess
    );

    if (!hasSuccess) {
      await this.takeScreenshot("login_failed.png");
      throw new CrawlerError(
        "Login failed - invalid credentials or page structure changed",
        ErrorCodes.LOGIN_FAILED,
        401
      );
    }

    logger.info("Login successful");
  }

  /**
   * Navigate to order form.
   */
  async navigateToOrderForm() {
    const customerId = this.formData.customer_id;
    logger.info(`Step 2: Navigating to order form - customerId: ${customerId}`);

    const orderFormUrl = `${this.shopUrl}/admin/oi/order/new?customer_id=${customerId}`;
    await this.page.goto(orderFormUrl, {
      waitUntil: "load",
      timeout: this.options.timeout,
    });

    // Verify order form loaded
    if (
      !(await this.elementExists(EC_FORCE_SELECTORS.orderForm.addItem, 5000))
    ) {
      await this.takeScreenshot("order_form_not_found.png");
      throw new CrawlerError(
        `Order form not found - customer_id ${customerId} may be invalid`,
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
    logger.info(
      `Step 3: Filling order form - product: ${
        this.formData.product.name
      }, shippingAddressId: ${
        this.formData.shipping_address_id
      }, hasPaymentMethod: ${!!this.formData
        .payment_method_id}, hasBillingAddress: ${!!this.formData
        .billing_address}`
    );

    // Add product to cart
    await this.addProductToOrder();

    // Select shipping address
    await this.selectShippingAddress();

    // Fill billing address if provided
    // if (this.formData.billing_address) {
    //   await this.fillBillingAddress();
    // }

    // Select payment method if provided
    if (this.formData.payment_method_id) {
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

    // Find and validate add item button
    const btn = await this.page.$(EC_FORCE_SELECTORS.orderForm.addItem);
    if (!btn) {
      throw new CrawlerError(
        "Add item button not found",
        ErrorCodes.ELEMENT_NOT_FOUND,
        500
      );
    }

    // Check button is clickable
    const isVisible = await btn.isIntersectingViewport();
    const isEnabled = await this.page.evaluate((el) => !el.disabled, btn);
    if (!isVisible || !isEnabled) {
      await this.takeScreenshot("add_button_not_clickable.png");
      throw new CrawlerError(
        "Add item button not clickable",
        ErrorCodes.ELEMENT_INTERACTION_FAILED,
        500
      );
    }

    // Click to open modal
    await btn.click();
    logger.debug("Add item button clicked");

    // Wait for modal to appear
    await this.page.waitForSelector(EC_FORCE_SELECTORS.orderForm.modal, {
      visible: true,
      timeout: 5000,
    });

    // Find and fill product input
    const productInput = await this.page.waitForSelector(
      EC_FORCE_SELECTORS.orderForm.productInput,
      { visible: true, timeout: 5000 }
    );

    await productInput.click();
    await productInput.type(productName, { delay: 100 });
    await productInput.press("Tab");
    logger.debug("Product name entered");

    // Wait for variant table to load
    await this.page.waitForFunction(
      (selector) => {
        const table = document.querySelector(selector);
        return table && table.innerHTML.trim() !== "";
      },
      { timeout: 5000 },
      EC_FORCE_SELECTORS.orderForm.variantTable
    );
    logger.debug("Variant table loaded");

    // Click add button in modal
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

    // Wait for modal to close
    await this.sleep(1000);
    logger.info("Product added successfully");
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
    const paymentMethodId = this.formData.payment_method_id;
    logger.info(
      `Selecting payment method - paymentMethodId: ${paymentMethodId}`
    );

    // Select payment method
    await this.selectOption(
      EC_FORCE_SELECTORS.orderForm.paymentMethod,
      paymentMethodId
    );

    // If credit card and credit_card_id provided, select the card
    if (this.formData.credit_card_id) {
      await this.sleep(500); // Wait for credit card dropdown to appear

      if (
        await this.elementExists(EC_FORCE_SELECTORS.orderForm.creditCard, 2000)
      ) {
        await this.selectOption(
          EC_FORCE_SELECTORS.orderForm.creditCard,
          this.formData.credit_card_id
        );
        logger.debug("Credit card selected");
      }
    }

    logger.debug("Payment method selected");
  }

  /**
   * Submit order form for review.
   */
  /**
   * Extract order details from success page.
   */
  async extractOrderDetails() {
    logger.info(`Step 6: Extracting order details - url: ${this.page.url()}`);

    await this.takeScreenshot("order_success.png");

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
