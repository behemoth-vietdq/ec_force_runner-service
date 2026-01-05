const { CrawlerError, ErrorCodes } = require("./errorHandler");

/**
 * Validation middleware for order creation requests
 */
class OrderValidation {
  /**
   * Validate create order request body
   */
  static validateCreateOrder(req, res, next) {
    const { account, customer, form_data } = req.body;
    const errors = [];

    OrderValidation._validateAccount(account, errors);
    OrderValidation._validateCustomer(customer, errors);
    OrderValidation._validateFormData(form_data, errors);

    if (errors.length > 0) {
      return next(
        new CrawlerError(
          "Validation failed",
          ErrorCodes.VALIDATION_ERROR,
          400,
          { errors }
        )
      );
    }

    next();
  }

  /**
   * Validate account field
   * @private
   */
  static _validateAccount(account, errors) {
    if (!account) {
      errors.push("account is required");
    } else if (typeof account !== "string" && typeof account !== "object") {
      errors.push("account must be a string or object");
    }
  }

  /**
   * Validate customer field
   * @private
   */
  static _validateCustomer(customer, errors) {
    if (!customer) {
      errors.push("customer is required");
    } else if (typeof customer !== "string" && typeof customer !== "object") {
      errors.push("customer must be a string or object");
    }
  }

  /**
   * Validate form_data field
   * @private
   */
  static _validateFormData(form_data, errors) {
    if (!form_data) {
      errors.push("form_data is required");
      return;
    }

    if (typeof form_data !== "object") {
      errors.push("form_data must be an object");
      return;
    }

    if (!form_data.customer_id) {
      errors.push("form_data.customer_id is required");
    }

    OrderValidation._validateProduct(form_data.product, errors);

    if (!form_data.shipping_address_id) {
      errors.push("form_data.shipping_address_id is required");
    }

    if (form_data.billing_address) {
      OrderValidation._validateBillingAddress(form_data.billing_address, errors);
    }
  }

  /**
   * Validate product field
   * @private
   */
  static _validateProduct(product, errors) {
    if (!product) {
      errors.push("form_data.product is required");
    } else if (!product.name) {
      errors.push("form_data.product.name is required");
    }
  }

  /**
   * Validate billing address
   * @private
   */
  static _validateBillingAddress(billingAddress, errors) {
    const requiredFields = [
      "name01",
      "name02",
      "kana01",
      "kana02",
      "zip01",
      "zip02",
      "addr02",
      "tel01",
      "tel02",
      "tel03",
    ];

    for (const field of requiredFields) {
      if (!billingAddress[field]) {
        errors.push(
          `form_data.billing_address.${field} is required when billing_address is provided`
        );
      }
    }
  }

  /**
   * Sanitize request body
   */
  static sanitizeBody(req, res, next) {
    if (req.body.form_data) {
      OrderValidation._sanitizeFormData(req.body.form_data);
    }
    next();
  }

  /**
   * Sanitize form data fields
   * @private
   */
  static _sanitizeFormData(formData) {
    const trimFields = [
      'customer_id',
      'shipping_address_id',
      'payment_method_id',
      'credit_card_id'
    ];

    for (const field of trimFields) {
      if (formData[field]) {
        formData[field] = String(formData[field]).trim();
      }
    }

    if (formData.product?.name) {
      formData.product.name = String(formData.product.name).trim();
    }

    if (formData.billing_address) {
      OrderValidation._sanitizeBillingAddress(formData.billing_address);
    }
  }

  /**
   * Sanitize billing address fields
   * @private
   */
  static _sanitizeBillingAddress(billingAddress) {
    for (const key of Object.keys(billingAddress)) {
      if (typeof billingAddress[key] === "string") {
        billingAddress[key] = billingAddress[key].trim();
      }
    }
  }
}

module.exports = OrderValidation;
