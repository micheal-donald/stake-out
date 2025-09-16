/**
 * Custom Payment Error Class
 *
 * Standardized error handling for payment operations. This error class
 * provides consistent error structure across all payment providers and
 * operations, making it easier to handle and debug payment issues.
 *
 * @class PaymentError
 * @extends Error
 * @author StakeOut Development Team
 * @since 1.0.0
 */

class PaymentError extends Error {
  /**
   * Create a payment error
   *
   * @param {string} message - Human-readable error message
   * @param {string} type - Error type/category
   * @param {string} code - Specific error code
   * @param {Object} [details={}] - Additional error details
   * @param {Error} [originalError] - Original error that caused this error
   */
  constructor(message, type, code, details = {}, originalError = null) {
    super(message);

    this.name = 'PaymentError';
    this.type = type;
    this.code = code;
    this.details = details;
    this.originalError = originalError;
    this.timestamp = new Date();

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, PaymentError.prototype);

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PaymentError);
    }
  }

  /**
   * Convert error to JSON for logging and API responses
   *
   * @param {boolean} [includeStack=false] - Whether to include stack trace
   * @returns {Object} JSON representation of the error
   */
  toJSON(includeStack = false) {
    const errorObj = {
      name: this.name,
      message: this.message,
      type: this.type,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp.toISOString()
    };

    if (includeStack && this.stack) {
      errorObj.stack = this.stack;
    }

    if (this.originalError) {
      errorObj.originalError = {
        name: this.originalError.name,
        message: this.originalError.message
      };
    }

    return errorObj;
  }

  /**
   * Get HTTP status code appropriate for this error type
   *
   * @returns {number} HTTP status code
   */
  getHttpStatus() {
    const statusMap = {
      VALIDATION_ERROR: 400,
      AUTHENTICATION_ERROR: 401,
      AUTHORIZATION_ERROR: 403,
      NOT_FOUND_ERROR: 404,
      RATE_LIMIT_ERROR: 429,
      PROVIDER_ERROR: 502,
      TIMEOUT_ERROR: 504,
      INTERNAL_ERROR: 500
    };

    return statusMap[this.type] || 500;
  }

  /**
   * Check if error is retryable
   *
   * Some errors are temporary and can be retried, while others
   * are permanent and should not be retried.
   *
   * @returns {boolean} True if error is retryable
   */
  isRetryable() {
    const retryableTypes = [
      'TIMEOUT_ERROR',
      'RATE_LIMIT_ERROR',
      'NETWORK_ERROR',
      'TEMPORARY_ERROR'
    ];

    const retryableCodes = [
      'NETWORK_TIMEOUT',
      'SERVICE_UNAVAILABLE',
      'RATE_LIMITED',
      'TEMPORARY_FAILURE'
    ];

    return retryableTypes.includes(this.type) || retryableCodes.includes(this.code);
  }

  /**
   * Get user-friendly error message
   *
   * Returns a message appropriate for displaying to end users,
   * hiding technical details when necessary.
   *
   * @returns {string} User-friendly error message
   */
  getUserMessage() {
    const userMessages = {
      VALIDATION_ERROR: 'Please check your payment information and try again.',
      AUTHENTICATION_ERROR: 'Authentication failed. Please contact support.',
      AUTHORIZATION_ERROR: 'You are not authorized to perform this action.',
      NOT_FOUND_ERROR: 'The requested transaction was not found.',
      RATE_LIMIT_ERROR: 'Too many requests. Please wait a moment and try again.',
      PROVIDER_ERROR: 'Payment service is temporarily unavailable. Please try again.',
      TIMEOUT_ERROR: 'The request timed out. Please try again.',
      INSUFFICIENT_FUNDS: 'Insufficient funds. Please check your balance and try again.',
      INVALID_PHONE_NUMBER: 'Please enter a valid phone number.',
      TRANSACTION_FAILED: 'Transaction failed. Please try again or contact support.',
      DUPLICATE_TRANSACTION: 'This transaction has already been processed.'
    };

    // Try to get message by code first, then by type
    return userMessages[this.code] || userMessages[this.type] || 'An error occurred. Please try again.';
  }

  /**
   * Create a validation error
   *
   * @param {string} message - Error message
   * @param {string} field - Field that failed validation
   * @param {*} value - Invalid value
   * @returns {PaymentError} Validation error instance
   * @static
   */
  static validationError(message, field, value) {
    return new PaymentError(
      message,
      'VALIDATION_ERROR',
      'INVALID_INPUT',
      { field, value }
    );
  }

  /**
   * Create an authentication error
   *
   * @param {string} message - Error message
   * @param {Object} [details={}] - Additional details
   * @returns {PaymentError} Authentication error instance
   * @static
   */
  static authenticationError(message, details = {}) {
    return new PaymentError(
      message,
      'AUTHENTICATION_ERROR',
      'AUTH_FAILED',
      details
    );
  }

  /**
   * Create a provider error
   *
   * @param {string} provider - Provider name
   * @param {string} message - Error message
   * @param {string} code - Provider error code
   * @param {Object} [details={}] - Provider error details
   * @returns {PaymentError} Provider error instance
   * @static
   */
  static providerError(provider, message, code, details = {}) {
    return new PaymentError(
      message,
      'PROVIDER_ERROR',
      code,
      { provider, ...details }
    );
  }

  /**
   * Create a timeout error
   *
   * @param {string} operation - Operation that timed out
   * @param {number} timeout - Timeout value in milliseconds
   * @returns {PaymentError} Timeout error instance
   * @static
   */
  static timeoutError(operation, timeout) {
    return new PaymentError(
      `${operation} timed out after ${timeout}ms`,
      'TIMEOUT_ERROR',
      'OPERATION_TIMEOUT',
      { operation, timeout }
    );
  }

  /**
   * Create a rate limit error
   *
   * @param {string} message - Error message
   * @param {number} [retryAfter] - Seconds until retry is allowed
   * @returns {PaymentError} Rate limit error instance
   * @static
   */
  static rateLimitError(message, retryAfter) {
    return new PaymentError(
      message,
      'RATE_LIMIT_ERROR',
      'RATE_LIMITED',
      { retryAfter }
    );
  }

  /**
   * Create an insufficient funds error
   *
   * @param {number} available - Available balance
   * @param {number} required - Required amount
   * @param {string} currency - Currency code
   * @returns {PaymentError} Insufficient funds error instance
   * @static
   */
  static insufficientFundsError(available, required, currency = 'KES') {
    return new PaymentError(
      `Insufficient funds: ${available} ${currency} available, ${required} ${currency} required`,
      'VALIDATION_ERROR',
      'INSUFFICIENT_FUNDS',
      { available, required, currency }
    );
  }

  /**
   * Create a transaction not found error
   *
   * @param {string} transactionId - Transaction ID that was not found
   * @returns {PaymentError} Not found error instance
   * @static
   */
  static transactionNotFoundError(transactionId) {
    return new PaymentError(
      `Transaction not found: ${transactionId}`,
      'NOT_FOUND_ERROR',
      'TRANSACTION_NOT_FOUND',
      { transactionId }
    );
  }

  /**
   * Create a duplicate transaction error
   *
   * @param {string} reference - Duplicate reference
   * @returns {PaymentError} Duplicate transaction error instance
   * @static
   */
  static duplicateTransactionError(reference) {
    return new PaymentError(
      `Duplicate transaction reference: ${reference}`,
      'VALIDATION_ERROR',
      'DUPLICATE_TRANSACTION',
      { reference }
    );
  }

  /**
   * Wrap an existing error as a PaymentError
   *
   * @param {Error} error - Original error to wrap
   * @param {string} [type='INTERNAL_ERROR'] - Error type
   * @param {string} [code='WRAPPED_ERROR'] - Error code
   * @returns {PaymentError} Wrapped payment error
   * @static
   */
  static wrap(error, type = 'INTERNAL_ERROR', code = 'WRAPPED_ERROR') {
    if (error instanceof PaymentError) {
      return error;
    }

    return new PaymentError(
      error.message || 'An error occurred',
      type,
      code,
      { originalName: error.name },
      error
    );
  }
}

module.exports = PaymentError;