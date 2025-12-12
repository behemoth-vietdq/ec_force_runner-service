const BaseCrawler = require("./BaseCrawler");
const logger = require("../../utils/logger");
const { CrawlerError, ErrorCodes } = require("../../middleware/errorHandler");

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
    this.shopUrl = options.shopUrl;
    this.credentials = options.credentials;
    this.formData = options.formData;
    this.orderResult = null;
  }

  /**
   * Main execution method.
   * @returns {Object} Success result or throws error.
   */
  async execute() {
    const startTime = Date.now();
    logger.info("Starting EC-Force order creation process");

    try {
      await this.initBrowser();
      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.run();
      const executionTime = Date.now() - startTime;
      logger.info(
        `Order creation completed - time: ${executionTime}ms, result: ${JSON.stringify(
          this.orderResult
        )}`
      );
      return { success: true, data: this.orderResult };
    } catch (error) {
      logger.error(`Order creation failed: ${error.message}`);
      await this.handleError(error, `ec_create_order_failed_${Date.now()}`);
      throw error;
    } finally {
      await this.closeBrowser(); // Always close to prevent leaks
    }
  }

  /**
   * Main order creation flow with retries.
   */
  async run() {
    await this.withRetry(() => this.login());
    await this.withRetry(() => this.navigateToOrderForm());
    await this.withRetry(() => this.fillOrderForm());
    await this.withRetry(() => this.submitOrder());
    await this.confirmOrder();
    await this.extractOrderDetails();
  }

  /**
   * Login to EC-Force admin.
   */
  async login() {
    const maskedEmail = this.credentials.admin_email.replace(
      /(.{2}).+(@.+)/,
      "$1***$2"
    );
    logger.info(`Step 1: Logging in - email: ${maskedEmail}`);

    await this.navigateToUrl(this.shopUrl);

    if (!(await this.elementExists(EC_FORCE_SELECTORS.login.email))) {
      logger.info("Already authenticated, skipping login");
      return;
    }

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

    await this.page
      .waitForNavigation({ waitUntil: "networkidle2", timeout: 2000 })
      .catch(() => {});

    const hasSuccess = await this.page.evaluate(
      (text) => document.body.textContent.includes(text),
      EC_FORCE_TEXTS.loginSuccess
    );
    if (!hasSuccess) {
      throw new CrawlerError("Login failed", ErrorCodes.LOGIN_FAILED, 401);
    }

    logger.info("Login successful");
  }

  /**
   * Navigate to order form.
   */
  async navigateToOrderForm() {
    const customerId = this.formData.customer_id;
    logger.info(`Step 2: Navigating to order form - customerId: ${customerId}`);
    const orderFormUrl = `${this.shopUrl}/oi/order/new?customer_id=${customerId}`;
    await this.page.goto(orderFormUrl, { waitUntil: "load" });

    if (!(await this.elementExists(EC_FORCE_SELECTORS.orderForm.addItem))) {
      throw new CrawlerError(
        "Order form not found",
        ErrorCodes.BROWSER_NAVIGATION_FAILED,
        500
      );
    }

    logger.info("Navigated to order form");
  }

  /**
   * Fill order form.
   */
  async fillOrderForm() {
    logger.info(
      `Step 3: Filling order form - product: ${this.formData.product.name}`
    );
    await this.addProductToOrder();
    await this.selectShippingAddress();
    if (this.formData.credit_card_id) {
      await this.selectPaymentMethod();
    }
    logger.info("Order form filled");
  }

  /**
   * Add product to order.
   */
  async addProductToOrder() {
    logger.info(`Adding product: ${this.formData.product.name}`);

    const btn = await this.page.$(EC_FORCE_SELECTORS.orderForm.addItem);
    if (!btn) throw new Error("Add item button not found");

    const isVisible = await btn.isIntersectingViewport();
    const isEnabled = await this.page.evaluate((el) => !el.disabled, btn);
    if (!isVisible || !isEnabled)
      throw new Error("Add item button not clickable");

    await btn.click();

    await this.page.waitForSelector(EC_FORCE_SELECTORS.orderForm.modal, {
      visible: true,
      timeout: 3000,
    });

    const productInput = await this.page.waitForSelector(
      EC_FORCE_SELECTORS.orderForm.productInput,
      { visible: true, timeout: 3000 }
    );
    await productInput.click();
    await productInput.type(this.formData.product.name, { delay: 100 });
    await productInput.press("Tab");

    await this.page.waitForFunction(
      (selector) => document.querySelector(selector)?.innerHTML.trim() !== "",
      { timeout: 3000 },
      EC_FORCE_SELECTORS.orderForm.variantTable
    );

    await this.page.evaluate((texts) => {
      const buttons = Array.from(
        document.querySelectorAll('button, input[type="submit"]')
      );
      const addBtn = buttons.find(
        (btn) =>
          btn.textContent.includes(texts.addButton) ||
          btn.value?.includes(texts.addButton)
      );
      addBtn?.click();
    }, EC_FORCE_TEXTS);
  }

  /**
   * Select shipping address.
   */
  async selectShippingAddress() {
    logger.info(`Selecting shipping: ${this.formData.shipping_address_id}`);
    await this.selectOption(
      EC_FORCE_SELECTORS.orderForm.shippingAddress,
      this.formData.shipping_address_id
    );
    logger.info("Shipping selected");
  }

  /**
   * Fill billing address (if needed).
   */
  async fillBillingAddress() {
    logger.info("Filling billing address");
    const addr = this.formData.billing_address;
    const prefix = EC_FORCE_SELECTORS.billingPrefix;

    if (addr.name)
      await this.fillInput(`input[name="${prefix}[name]"]`, addr.name);
    await this.fillInput(`input[name="${prefix}[name01]"]`, addr.name01);
    await this.fillInput(`input[name="${prefix}[name02]"]`, addr.name02);
    await this.fillInput(`input[name="${prefix}[kana01]"]`, addr.kana01);
    await this.fillInput(`input[name="${prefix}[kana02]"]`, addr.kana02);
    await this.fillInput(`input[name="${prefix}[zip01]"]`, addr.zip01);
    await this.fillInput(`input[name="${prefix}[zip02]"]`, addr.zip02);
    await this.fillInput(`input[name="${prefix}[addr02]"]`, addr.addr02);
    await this.fillInput(`input[name="${prefix}[tel01]"]`, addr.tel01);
    await this.fillInput(`input[name="${prefix}[tel02]"]`, addr.tel02);
    await this.fillInput(`input[name="${prefix}[tel03]"]`, addr.tel03);

    logger.info("Billing filled");
  }

  /**
   * Select payment method.
   */
  async selectPaymentMethod() {
    logger.info("Step 4: Selecting payment - Credit Card");

    await this.page.evaluate(
      (selectors, texts) => {
        const paymentSelect = document.querySelector(
          selectors.orderForm.paymentMethod
        );
        if (paymentSelect) {
          const option = Array.from(paymentSelect.options).find(
            (opt) =>
              opt.text.includes(texts.paymentCredit) ||
              opt.text.includes("credit")
          );
          if (option) paymentSelect.value = option.value;
        }
      },
      EC_FORCE_SELECTORS,
      EC_FORCE_TEXTS
    );

    await this.selectOption(
      EC_FORCE_SELECTORS.orderForm.creditCard,
      this.formData.credit_card_id
    );
    logger.info("Payment selected");
  }

  /**
   * Submit order form.
   */
  async submitOrder() {
    logger.info("Step 5: Submitting order");
    await this.takeScreenshot("before_submit.png");
    await this.page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    );
    await this.clickElement(EC_FORCE_SELECTORS.orderForm.submit);
    await this.page.waitForNavigation({ waitUntil: "load" });

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
        `Submit failed: ${errorMsg || "Unknown"}`,
        ErrorCodes.ORDER_SUBMISSION_FAILED,
        400
      );
    }

    const hasConfirm = await this.page.evaluate(
      (text) => document.body.textContent.includes(text),
      EC_FORCE_TEXTS.confirmButton
    );
    if (!hasConfirm) {
      await this.takeScreenshot("no_confirmation.png");
      throw new CrawlerError(
        "Confirmation not found",
        ErrorCodes.ORDER_SUBMISSION_FAILED,
        500
      );
    }

    logger.info("Order submitted");
  }

  /**
   * Confirm order.
   */
  async confirmOrder() {
    logger.info("Step 5.5: Confirming order");
    await this.takeScreenshot("confirm.png");
    await this.page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    );
    await this.clickElement('button[type="submit"]');
    await this.page.waitForNavigation({ waitUntil: "networkidle0" });
    logger.info("Order confirmed");
  }

  /**
   * Extract order details.
   */
  async extractOrderDetails() {
    logger.info(`Step 6: Extracting details - URL: ${this.page.url()}`);
    await this.takeScreenshot("before_extract.png");

    if (
      !(await this.elementExists(EC_FORCE_SELECTORS.orderForm.performViewTd))
    ) {
      const errorMsg = await this.page.evaluate(
        (sel) => document.querySelector(sel)?.textContent.trim(),
        EC_FORCE_SELECTORS.orderForm.errorAlert
      );
      throw new CrawlerError(
        `Extract failed: ${errorMsg || "Unknown"}`,
        ErrorCodes.ORDER_VALIDATION_FAILED,
        400
      );
    }

    const tdTexts = await this.page.$$eval(
      EC_FORCE_SELECTORS.orderForm.performViewTd,
      (tds) => tds.map((td) => td.textContent.trim())
    );
    if (tdTexts.length < 3) {
      throw new CrawlerError(
        "Order table incomplete",
        ErrorCodes.ORDER_VALIDATION_FAILED,
        500
      );
    }

    const [orderNumber, customerNumber, total] = tdTexts;

    const hasOrder = await this.page.evaluate(
      (num) => document.body.textContent.includes(num),
      orderNumber
    );
    if (!hasOrder) {
      throw new CrawlerError(
        "Order number not found",
        ErrorCodes.ORDER_VALIDATION_FAILED,
        500
      );
    }

    await this.clickElement(EC_FORCE_SELECTORS.orderForm.orderLink);
    await this.page.waitForNavigation({ waitUntil: "networkidle0" });

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

    this.orderResult = {
      order_number: orderNumber,
      customer_number: customerNumber,
      total,
      order_id: orderId,
      created_at: new Date().toISOString(),
    };

    logger.info(
      `Details extracted - orderNumber: ${orderNumber}, orderId: ${orderId}`
    );
  }
}

module.exports = EcForceOrderCrawler;
