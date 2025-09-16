/**
 * Payment Provider Abstract Base Class
 *
 * This abstract class defines the common interface that all payment providers
 * must implement. It ensures consistent behavior across different payment
 * systems (M-Pesa, Stripe, PayPal, etc.) and provides a foundation for
 * the Strategy pattern implementation.
 *
 * Design Pattern: Strategy Pattern
 * - Allows runtime selection of payment providers
 * - Enables adding new providers without modifying existing code
 * - Provides consistent interface for all payment operations
 *
 * @abstract
 * @class PaymentProvider
 * @author StakeOut Development Team
 * @since 1.0.0
 */

class PaymentProvider {
  /**
   * Initialize payment provider with configuration
   *
   * @param {Object} config - Provider-specific configuration
   * @param {string} config.name - Provider name (e.g., 'mpesa', 'stripe')
   * @param {Object} config.credentials - Authentication credentials
   * @param {Object} config.settings - Provider-specific settings
   * @param {boolean} config.sandbox - Whether to use sandbox environment
   */
  constructor(config) {
    if (new.target === PaymentProvider) {
      throw new Error('PaymentProvider is an abstract class and cannot be instantiated directly');
    }

    this.config = config;
    this.name = config.name;
    this.sandbox = config.sandbox || false;
    this.initialized = false;
  }

  /**
   * Initialize the payment provider
   *
   * This method should be called after instantiation to set up
   * the provider with its configuration and establish any necessary
   * connections or authentication tokens.
   *
   * @async
   * @returns {Promise<boolean>} True if initialization successful
   * @throws {Error} If initialization fails
   * @abstract
   */
  async initialize() {
    throw new Error('initialize() method must be implemented by payment provider');
  }

  /**
   * Initiate a payment transaction
   *
   * This method starts a payment process with the external provider.
   * The exact implementation varies by provider (STK Push for M-Pesa,
   * payment intent for Stripe, etc.).
   *
   * @async
   * @param {Object} paymentData - Payment information
   * @param {number} paymentData.amount - Payment amount in smallest currency unit
   * @param {string} paymentData.currency - Currency code (e.g., 'KES', 'USD')
   * @param {string} paymentData.phoneNumber - Customer phone number (for mobile payments)
   * @param {string} paymentData.email - Customer email address
   * @param {string} paymentData.reference - Unique transaction reference
   * @param {string} [paymentData.description] - Payment description
   * @param {Object} [paymentData.metadata] - Additional metadata
   * @returns {Promise<PaymentInitiationResult>} Payment initiation result
   * @throws {PaymentError} If payment initiation fails
   * @abstract
   */
  async initiatePayment(paymentData) {
    throw new Error('initiatePayment() method must be implemented by payment provider');
  }

  /**
   * Check the status of a payment transaction
   *
   * Queries the payment provider's API to get the current status
   * of a transaction. This is used for polling payment status
   * and handling delayed confirmations.
   *
   * @async
   * @param {string} transactionId - Internal transaction identifier
   * @param {string} [externalReference] - Provider's transaction reference
   * @returns {Promise<PaymentStatusResult>} Payment status information
   * @throws {PaymentError} If status check fails
   * @abstract
   */
  async checkPaymentStatus(transactionId, externalReference) {
    throw new Error('checkPaymentStatus() method must be implemented by payment provider');
  }

  /**
   * Process payment callback/webhook from provider
   *
   * Handles incoming webhooks from the payment provider to update
   * transaction status. This method should validate the webhook
   * signature and process the callback data.
   *
   * @async
   * @param {Object} callbackData - Raw callback data from provider
   * @param {Object} [headers] - HTTP headers from callback request
   * @returns {Promise<CallbackProcessingResult>} Processing result
   * @throws {PaymentError} If callback processing fails
   * @abstract
   */
  async processCallback(callbackData, headers = {}) {
    throw new Error('processCallback() method must be implemented by payment provider');
  }

  /**
   * Validate webhook signature
   *
   * Verifies that the webhook request came from the legitimate
   * payment provider by validating the signature in the headers.
   *
   * @param {Object} payload - Webhook payload
   * @param {string} signature - Signature from headers
   * @param {string} secret - Webhook secret key
   * @returns {boolean} True if signature is valid
   * @abstract
   */
  validateWebhookSignature(payload, signature, secret) {
    throw new Error('validateWebhookSignature() method must be implemented by payment provider');
  }

  /**
   * Get supported payment methods for this provider
   *
   * Returns an array of payment methods that this provider supports
   * (e.g., ['mobile_money', 'card', 'bank_transfer']).
   *
   * @returns {string[]} Array of supported payment method codes
   * @abstract
   */
  getSupportedPaymentMethods() {
    throw new Error('getSupportedPaymentMethods() method must be implemented by payment provider');
  }

  /**
   * Get supported currencies for this provider
   *
   * Returns an array of currency codes that this provider supports
   * (e.g., ['KES', 'USD', 'EUR']).
   *
   * @returns {string[]} Array of supported currency codes
   * @abstract
   */
  getSupportedCurrencies() {
    throw new Error('getSupportedCurrencies() method must be implemented by payment provider');
  }

  /**
   * Get provider name
   *
   * Returns the unique identifier for this payment provider.
   * This is used in configuration, logging, and provider selection.
   *
   * @returns {string} Provider name (e.g., 'mpesa', 'stripe')
   */
  getProviderName() {
    return this.name;
  }

  /**
   * Check if provider is initialized and ready
   *
   * @returns {boolean} True if provider is ready for use
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Check if provider is in sandbox mode
   *
   * @returns {boolean} True if provider is using sandbox environment
   */
  isSandbox() {
    return this.sandbox;
  }

  /**
   * Get provider configuration (without sensitive data)
   *
   * Returns configuration information for logging and debugging,
   * with sensitive information (credentials, keys) removed.
   *
   * @returns {Object} Safe configuration object
   */
  getConfigSummary() {
    const safeCconfig = { ...this.config };

    // Remove sensitive fields
    delete safeCconfig.credentials;
    delete safeCconfig.apiKey;
    delete safeCconfig.secret;
    delete safeCconfig.passkey;

    return {
      ...safeCconfig,
      initialized: this.initialized,
      sandbox: this.sandbox
    };
  }

  /**
   * Handle provider-specific errors
   *
   * Converts provider-specific error responses into standardized
   * PaymentError objects for consistent error handling.
   *
   * @param {Error|Object} error - Provider-specific error
   * @returns {PaymentError} Standardized payment error
   * @protected
   */
  handleProviderError(error) {
    // Default implementation - should be overridden by providers
    const PaymentError = require('../errors/PaymentError');

    if (error instanceof PaymentError) {
      return error;
    }

    return new PaymentError(
      error.message || 'Payment provider error',
      'PROVIDER_ERROR',
      error.code || 'UNKNOWN',
      error.details || {}
    );
  }

  /**
   * Validate payment data before processing
   *
   * Performs basic validation of payment data common to all providers.
   * Providers can override this to add provider-specific validation.
   *
   * @param {Object} paymentData - Payment data to validate
   * @throws {PaymentError} If validation fails
   * @protected
   */
  validatePaymentData(paymentData) {
    const PaymentError = require('../errors/PaymentError');

    if (!paymentData) {
      throw new PaymentError('Payment data is required', 'VALIDATION_ERROR', 'MISSING_DATA');
    }

    if (!paymentData.amount || paymentData.amount <= 0) {
      throw new PaymentError('Valid amount is required', 'VALIDATION_ERROR', 'INVALID_AMOUNT');
    }

    if (!paymentData.reference) {
      throw new PaymentError('Transaction reference is required', 'VALIDATION_ERROR', 'MISSING_REFERENCE');
    }

    // Validate currency is supported
    const supportedCurrencies = this.getSupportedCurrencies();
    const currency = paymentData.currency || 'KES';

    if (!supportedCurrencies.includes(currency)) {
      throw new PaymentError(
        `Unsupported currency: ${currency}`,
        'VALIDATION_ERROR',
        'UNSUPPORTED_CURRENCY',
        { supportedCurrencies }
      );
    }
  }

  /**
   * Format amount for provider API
   *
   * Different providers expect amounts in different formats.
   * This method standardizes amount formatting.
   *
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code
   * @returns {number|string} Formatted amount
   * @protected
   */
  formatAmount(amount, currency = 'KES') {
    // Default implementation - round to 2 decimal places
    return Math.round(amount * 100) / 100;
  }

  /**
   * Format phone number for provider API
   *
   * Standardizes phone number format for the provider.
   * Default implementation removes spaces and special characters.
   *
   * @param {string} phoneNumber - Phone number to format
   * @returns {string} Formatted phone number
   * @protected
   */
  formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return phoneNumber;

    // Remove spaces, dashes, and parentheses
    return phoneNumber.replace(/[\s\-\(\)]/g, '');
  }

  /**
   * Create standardized transaction reference
   *
   * Generates a provider-specific transaction reference that follows
   * the provider's formatting requirements.
   *
   * @param {string} baseReference - Base reference string
   * @returns {string} Formatted transaction reference
   * @protected
   */
  createTransactionReference(baseReference) {
    // Default implementation - use base reference as-is
    return baseReference;
  }
}

/**
 * Payment initiation result structure
 * @typedef {Object} PaymentInitiationResult
 * @property {boolean} success - Whether initiation was successful
 * @property {string} transactionId - Internal transaction ID
 * @property {string} externalReference - Provider's transaction reference
 * @property {string} status - Payment status ('initiated', 'pending', etc.)
 * @property {string} [message] - Human-readable status message
 * @property {Object} [providerData] - Provider-specific response data
 * @property {Date} [expiresAt] - When the payment request expires
 */

/**
 * Payment status result structure
 * @typedef {Object} PaymentStatusResult
 * @property {boolean} success - Whether status check was successful
 * @property {string} transactionId - Internal transaction ID
 * @property {string} externalReference - Provider's transaction reference
 * @property {string} status - Current payment status
 * @property {string} [message] - Status description
 * @property {Object} [providerData] - Provider-specific status data
 * @property {Date} [updatedAt] - When status was last updated
 */

/**
 * Callback processing result structure
 * @typedef {Object} CallbackProcessingResult
 * @property {boolean} success - Whether callback was processed successfully
 * @property {string} transactionId - Internal transaction ID
 * @property {string} oldStatus - Previous transaction status
 * @property {string} newStatus - Updated transaction status
 * @property {string} [message] - Processing message
 * @property {Object} [data] - Additional processing data
 */

module.exports = PaymentProvider;