const { CrawlerError, ErrorCodes } = require("./errorHandler");
const logger = require("../utils/logger");

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

    // Validate account
    if (!account) {
      errors.push("account is required");
    } else if (typeof account !== "string" && typeof account !== "object") {
      errors.push("account must be a string or object");
    }

    // Validate customer
    if (!customer) {
      errors.push("customer is required");
    } else if (typeof customer !== "string" && typeof customer !== "object") {
      errors.push("customer must be a string or object");
    }

    // Validate form_data
    if (!form_data) {
      errors.push("form_data is required");
    } else if (typeof form_data !== "object") {
      errors.push("form_data must be an object");
    } else {
      // Validate form_data fields
      if (!form_data.customer_id) {
        errors.push("form_data.customer_id is required");
      }

      if (!form_data.product) {
        errors.push("form_data.product is required");
      } else if (!form_data.product.name) {
        errors.push("form_data.product.name is required");
      }

      if (!form_data.shipping_address_id) {
        errors.push("form_data.shipping_address_id is required");
      }

      // Validate billing_address if provided
      if (form_data.billing_address) {
        const addr = form_data.billing_address;
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
          if (!addr[field]) {
            errors.push(
              `form_data.billing_address.${field} is required when billing_address is provided`
            );
          }
        }
      }
    }

    // If validation errors, return 400
    if (errors.length > 0) {
      logger.warn("Order validation failed", errors);

      return next(
        new CrawlerError(
          "Validation failed",
          ErrorCodes.VALIDATION_ERROR,
          400,
          { errors }
        )
      );
    }

    // Validation passed
    next();
  }

  /**
   * Sanitize request body
   */
  static sanitizeBody(req, res, next) {
    if (req.body.form_data) {
      const formData = req.body.form_data;

      // Trim string values
      if (formData.customer_id) {
        formData.customer_id = String(formData.customer_id).trim();
      }

      if (formData.product?.name) {
        formData.product.name = String(formData.product.name).trim();
      }

      if (formData.shipping_address_id) {
        formData.shipping_address_id = String(
          formData.shipping_address_id
        ).trim();
      }

      if (formData.payment_method_id) {
        formData.payment_method_id = String(formData.payment_method_id).trim();
      }

      if (formData.credit_card_id) {
        formData.credit_card_id = String(formData.credit_card_id).trim();
      }

      // Sanitize billing address
      if (formData.billing_address) {
        const addr = formData.billing_address;
        for (const key of Object.keys(addr)) {
          if (typeof addr[key] === "string") {
            addr[key] = addr[key].trim();
          }
        }
      }
    }

    next();
  }
}

module.exports = OrderValidation;
