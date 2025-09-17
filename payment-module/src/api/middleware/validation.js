/**
 * Validation Middleware
 *
 * Handles request validation using express-validator and provides
 * standardized error responses for validation failures.
 *
 * Features:
 * - Comprehensive input validation
 * - Sanitization of user inputs
 * - Standardized error responses
 * - Security-focused validation
 * - Custom validation rules
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { validationResult } = require('express-validator');
const PaymentError = require('../../errors/PaymentError');
const logger = require('../../utils/logger');

/**
 * Handle validation errors from express-validator
 *
 * Processes validation results and returns standardized error responses.
 * This middleware should be used after validation rules in route definitions.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
      location: error.location
    }));

    logger.warn('Request validation failed', {
      userId: req.user?.userId,
      path: req.path,
      method: req.method,
      errors: validationErrors,
      ip: req.ip
    });

    const error = PaymentError.validationError(
      'Request validation failed',
      'multiple_fields',
      validationErrors
    );

    return res.status(400).json({
      success: false,
      error: {
        type: error.type,
        code: error.code,
        message: error.message,
        details: {
          validationErrors
        }
      },
      correlationId: req.correlationId
    });
  }

  next();
};

/**
 * Custom validation for phone numbers
 *
 * Validates Kenyan phone number formats and normalizes them.
 *
 * @param {string} value - Phone number to validate
 * @returns {boolean} True if valid
 */
const isValidKenyanPhoneNumber = (value) => {
  if (!value) return false;

  // Remove spaces, dashes, and parentheses
  const cleaned = value.replace(/[\s\-\(\)]/g, '');

  // Check various Kenyan formats
  const patterns = [
    /^254\d{9}$/,      // 254712345678
    /^0\d{9}$/,        // 0712345678
    /^\+254\d{9}$/     // +254712345678
  ];

  return patterns.some(pattern => pattern.test(cleaned));
};

/**
 * Custom validation for transaction references
 *
 * Ensures transaction references meet business requirements.
 *
 * @param {string} value - Reference to validate
 * @returns {boolean} True if valid
 */
const isValidTransactionReference = (value) => {
  if (!value) return false;

  // Reference should be alphanumeric with hyphens and underscores
  // Length between 1 and 50 characters
  const pattern = /^[a-zA-Z0-9\-_]{1,50}$/;
  return pattern.test(value);
};

/**
 * Custom validation for payment amounts
 *
 * Validates payment amounts based on provider constraints.
 *
 * @param {number} value - Amount to validate
 * @param {Object} options - Validation options
 * @param {string} options.provider - Payment provider
 * @param {string} options.currency - Currency code
 * @returns {boolean} True if valid
 */
const isValidPaymentAmount = (value, { provider, currency = 'KES' } = {}) => {
  if (!value || typeof value !== 'number' || value <= 0) {
    return false;
  }

  // Provider-specific amount limits
  const limits = {
    mpesa: {
      KES: { min: 1, max: 300000 }
    },
    stripe: {
      USD: { min: 0.50, max: 999999 },
      KES: { min: 50, max: 99999900 }
    },
    paypal: {
      USD: { min: 0.01, max: 10000 },
      KES: { min: 1, max: 1000000 }
    }
  };

  const providerLimits = limits[provider];
  if (!providerLimits) {
    // Default limits if provider not found
    return value >= 1 && value <= 1000000;
  }

  const currencyLimits = providerLimits[currency];
  if (!currencyLimits) {
    // Default limits if currency not found for provider
    return value >= 1 && value <= 100000;
  }

  return value >= currencyLimits.min && value <= currencyLimits.max;
};

/**
 * Custom validation for currency codes
 *
 * @param {string} value - Currency code to validate
 * @returns {boolean} True if valid
 */
const isValidCurrencyCode = (value) => {
  if (!value) return false;

  // ISO 4217 currency codes (3 letters)
  const supportedCurrencies = [
    'KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS'
  ];

  return supportedCurrencies.includes(value.toUpperCase());
};

/**
 * Custom validation for metadata objects
 *
 * Ensures metadata doesn't contain sensitive information or exceed limits.
 *
 * @param {Object} value - Metadata object to validate
 * @returns {boolean} True if valid
 */
const isValidMetadata = (value) => {
  if (!value || typeof value !== 'object') {
    return true; // Optional field
  }

  // Check for sensitive keys
  const sensitiveKeys = [
    'password', 'pin', 'secret', 'key', 'token',
    'ssn', 'credit_card', 'bank_account'
  ];

  const keys = Object.keys(value);

  // Limit number of metadata fields
  if (keys.length > 20) {
    return false;
  }

  // Check for sensitive keys
  const hasSensitiveKey = keys.some(key =>
    sensitiveKeys.some(sensitive =>
      key.toLowerCase().includes(sensitive)
    )
  );

  if (hasSensitiveKey) {
    return false;
  }

  // Check metadata size (JSON string length)
  const jsonString = JSON.stringify(value);
  if (jsonString.length > 2048) { // 2KB limit
    return false;
  }

  return true;
};

/**
 * Sanitize phone number to standard format
 *
 * @param {string} phoneNumber - Phone number to sanitize
 * @returns {string} Sanitized phone number
 */
const sanitizePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return phoneNumber;

  // Remove all non-numeric characters except +
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');

  // Convert to 254XXXXXXXXX format
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.substring(1);
  } else if (cleaned.startsWith('+254')) {
    cleaned = cleaned.substring(1);
  }

  return cleaned;
};

/**
 * Sanitize transaction reference
 *
 * @param {string} reference - Reference to sanitize
 * @returns {string} Sanitized reference
 */
const sanitizeTransactionReference = (reference) => {
  if (!reference) return reference;

  // Remove special characters except hyphens and underscores
  // Convert to uppercase for consistency
  return reference
    .replace(/[^a-zA-Z0-9\-_]/g, '')
    .substring(0, 50)
    .toUpperCase();
};

/**
 * Validation middleware for payment initiation
 */
const validatePaymentInitiation = (req, res, next) => {
  const { provider, amount, currency = 'KES' } = req.body;

  // Additional business logic validation
  if (provider && amount && !isValidPaymentAmount(amount, { provider, currency })) {
    const error = PaymentError.validationError(
      `Amount ${amount} ${currency} is not valid for provider ${provider}`,
      'amount',
      amount
    );

    return res.status(400).json({
      success: false,
      error: error.toJSON(),
      correlationId: req.correlationId
    });
  }

  next();
};

/**
 * Validation middleware for webhook payloads
 */
const validateWebhookPayload = (req, res, next) => {
  // Basic webhook payload validation
  if (!req.body || typeof req.body !== 'object') {
    const error = PaymentError.validationError(
      'Webhook payload is required and must be an object',
      'body',
      req.body
    );

    return res.status(400).json({
      success: false,
      error: error.toJSON()
    });
  }

  // Log webhook for debugging
  logger.debug('Webhook payload received', {
    contentType: req.get('content-type'),
    payloadSize: JSON.stringify(req.body).length,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  next();
};

/**
 * Rate limiting validation
 *
 * Checks if user has exceeded rate limits for specific operations.
 *
 * @param {string} operation - Operation type
 * @param {number} limit - Rate limit
 * @param {number} window - Time window in seconds
 * @returns {Function} Middleware function
 */
const validateRateLimit = (operation, limit, window) => {
  // This would integrate with a rate limiting service like Redis
  // For now, it's a placeholder for the structure
  return (req, res, next) => {
    // Rate limiting logic would go here
    // For MVP, we'll rely on express-rate-limit middleware
    next();
  };
};

/**
 * File upload validation middleware
 *
 * Validates file uploads for security (if needed for receipts, etc.)
 */
const validateFileUpload = (req, res, next) => {
  if (!req.file && !req.files) {
    return next(); // No file uploaded, continue
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  const files = req.files || [req.file];

  for (const file of files) {
    if (!allowedTypes.includes(file.mimetype)) {
      const error = PaymentError.validationError(
        'Invalid file type. Only JPEG, PNG, and PDF files are allowed',
        'file',
        file.mimetype
      );

      return res.status(400).json({
        success: false,
        error: error.toJSON(),
        correlationId: req.correlationId
      });
    }

    if (file.size > maxSize) {
      const error = PaymentError.validationError(
        'File size too large. Maximum size is 5MB',
        'file',
        file.size
      );

      return res.status(400).json({
        success: false,
        error: error.toJSON(),
        correlationId: req.correlationId
      });
    }
  }

  next();
};

module.exports = {
  // Main validation handlers
  handleValidationErrors,
  validatePaymentInitiation,
  validateWebhookPayload,
  validateRateLimit,
  validateFileUpload,

  // Custom validators
  isValidKenyanPhoneNumber,
  isValidTransactionReference,
  isValidPaymentAmount,
  isValidCurrencyCode,
  isValidMetadata,

  // Sanitizers
  sanitizePhoneNumber,
  sanitizeTransactionReference
};