const Joi = require('joi');

/**
 * Schema for order creation request
 */
const createOrderSchema = Joi.object({
  shop_url: Joi.string()
    .uri()
    .required()
    .description('EC-Force shop admin URL'),

  credentials: Joi.object({
    admin_email: Joi.string()
      .email()
      .required()
      .description('Admin email'),
    admin_password: Joi.string()
      .min(6)
      .required()
      .description('Admin password'),
  }).required(),

  form_data: Joi.object({
    customer_id: Joi.string()
      .required()
      .description('Customer ID'),

    product: Joi.object({
      name: Joi.string()
        .required()
        .description('Product name'),
    }).required(),

    shipping_address_id: Joi.string()
      .required()
      .description('Shipping address ID'),

    billing_address: Joi.object({
      name: Joi.string().optional(),
      name01: Joi.string().required(),
      name02: Joi.string().required(),
      kana01: Joi.string().required(),
      kana02: Joi.string().required(),
      zip01: Joi.string().required(),
      zip02: Joi.string().required(),
      addr02: Joi.string().required(),
      tel01: Joi.string().required(),
      tel02: Joi.string().required(),
      tel03: Joi.string().required(),
    }).optional(),

    payment_method_id: Joi.string()
      .optional()
      .description('Payment method ID'),
  }).required(),

  options: Joi.object({
    headless: Joi.boolean()
      .default(true)
      .description('Run browser in headless mode'),
    screenshot_on_error: Joi.boolean()
      .default(true)
      .description('Take screenshot on error'),
    timeout: Joi.number()
      .min(10000)
      .max(300000)
      .default(60000)
      .description('Operation timeout in milliseconds'),
  }).optional(),
});

/**
 * Validation middleware factory
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      error.isJoi = true;
      return next(error);
    }

    // Replace req.body with validated value
    req.body = value;
    next();
  };
};

module.exports = {
  createOrderSchema,
  validateRequest,
};
