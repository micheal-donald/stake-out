/**
 * M-Pesa Payment Provider Implementation
 *
 * This class implements the PaymentProvider interface for Safaricom's M-Pesa
 * mobile money service. It handles STK Push payments, status queries, and
 * callback processing.
 *
 * Migrated from: backend/services/mpesa.js
 * Enhanced with: Comprehensive error handling, logging, and documentation
 *
 * Key Features:
 * - STK Push payment initiation
 * - Payment status queries
 * - Webhook callback processing
 * - Automatic token management
 * - Transaction timeout handling
 * - Comprehensive error handling
 *
 * @class MpesaProvider
 * @extends PaymentProvider
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment');
const PaymentProvider = require('../PaymentProvider');
const PaymentError = require('../../errors/PaymentError');
const logger = require('../../utils/logger');

class MpesaProvider extends PaymentProvider {
  /**
   * Initialize M-Pesa provider with configuration
   *
   * @param {Object} config - M-Pesa configuration
   * @param {string} config.consumerKey - M-Pesa consumer key
   * @param {string} config.consumerSecret - M-Pesa consumer secret
   * @param {string} config.shortcode - Business shortcode (Paybill or Till)
   * @param {string} config.passkey - M-Pesa passkey for password generation
   * @param {string} config.callbackUrl - Webhook URL for payment notifications
   * @param {string} [config.timeoutUrl] - URL for timeout notifications
   * @param {string} [config.baseUrl] - M-Pesa API base URL (auto-detected from environment)
   * @param {string} [config.environment='sandbox'] - 'sandbox' or 'production'
   * @param {string} [config.accountReference='STAKEOUT'] - Account reference prefix
   * @param {string} [config.transactionDesc='Payment'] - Default transaction description
   */
  constructor(config) {
    super({
      name: 'mpesa',
      ...config
    });

    // M-Pesa specific configuration
    this.consumerKey = config.consumerKey;
    this.consumerSecret = config.consumerSecret;
    this.shortcode = config.shortcode;
    this.passkey = config.passkey;
    this.callbackUrl = config.callbackUrl;
    this.timeoutUrl = config.timeoutUrl || config.callbackUrl;
    this.environment = config.environment || 'sandbox';
    this.accountReference = config.accountReference || 'STAKEOUT';
    this.transactionDesc = config.transactionDesc || 'Payment';

    // Set API base URL based on environment
    this.baseUrl = config.baseUrl || this.getApiBaseUrl();

    // Token management
    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenRefreshPromise = null;

    // Request configuration
    this.httpTimeout = config.httpTimeout || 15000; // 15 seconds
    this.maxRetries = config.maxRetries || 3;

    // Validate configuration on construction
    this.validateConfiguration();

    logger.info('M-Pesa provider initialized', {
      provider: 'mpesa',
      environment: this.environment,
      shortcode: this.shortcode,
      baseUrl: this.baseUrl
    });
  }

  /**
   * Validate M-Pesa configuration
   *
   * Ensures all required configuration parameters are present
   * and properly formatted before allowing provider use.
   *
   * @private
   * @throws {PaymentError} If configuration is invalid
   */
  validateConfiguration() {
    const required = [
      'consumerKey',
      'consumerSecret',
      'shortcode',
      'passkey',
      'callbackUrl'
    ];

    const missing = required.filter(key => !this[key]);

    if (missing.length > 0) {
      throw PaymentError.validationError(
        `Missing required M-Pesa configuration: ${missing.join(', ')}`,
        'config',
        missing
      );
    }

    // Validate shortcode format (should be numeric)
    if (!/^\d+$/.test(this.shortcode)) {
      throw PaymentError.validationError(
        'M-Pesa shortcode must be numeric',
        'shortcode',
        this.shortcode
      );
    }

    // Validate callback URL format
    try {
      new URL(this.callbackUrl);
    } catch (error) {
      throw PaymentError.validationError(
        'M-Pesa callback URL must be a valid URL',
        'callbackUrl',
        this.callbackUrl
      );
    }

    // Validate environment
    if (!['sandbox', 'production'].includes(this.environment)) {
      throw PaymentError.validationError(
        'M-Pesa environment must be "sandbox" or "production"',
        'environment',
        this.environment
      );
    }
  }

  /**
   * Get M-Pesa API base URL based on environment
   *
   * @private
   * @returns {string} API base URL
   */
  getApiBaseUrl() {
    return this.environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  }

  /**
   * Initialize the M-Pesa provider
   *
   * Performs initial setup and validates connectivity with M-Pesa API.
   * This method should be called before using any payment operations.
   *
   * @async
   * @returns {Promise<boolean>} True if initialization successful
   * @throws {PaymentError} If initialization fails
   */
  async initialize() {
    try {
      logger.info('Initializing M-Pesa provider', {
        provider: 'mpesa',
        environment: this.environment
      });

      // Test token generation to validate credentials
      await this.getAccessToken();

      this.initialized = true;

      logger.info('M-Pesa provider initialized successfully', {
        provider: 'mpesa',
        environment: this.environment,
        tokenExpiry: this.tokenExpiry?.toISOString()
      });

      return true;

    } catch (error) {
      logger.error('M-Pesa provider initialization failed', {
        provider: 'mpesa',
        error: error.message
      });

      throw PaymentError.providerError(
        'mpesa',
        'Failed to initialize M-Pesa provider',
        'INITIALIZATION_FAILED',
        { originalError: error.message }
      );
    }
  }

  /**
   * Get or refresh M-Pesa API access token
   *
   * Manages OAuth token lifecycle including automatic renewal.
   * Uses a promise-based approach to prevent multiple concurrent
   * token refresh requests.
   *
   * @private
   * @async
   * @returns {Promise<string>} Valid access token
   * @throws {PaymentError} If token generation fails
   */
  async getAccessToken() {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && moment().isBefore(this.tokenExpiry)) {
      return this.accessToken;
    }

    // Check if token refresh is already in progress
    if (this.tokenRefreshPromise) {
      logger.debug('Token refresh in progress, waiting for completion');
      return await this.tokenRefreshPromise;
    }

    // Start token refresh
    this.tokenRefreshPromise = this.refreshAccessToken();

    try {
      const token = await this.tokenRefreshPromise;
      this.tokenRefreshPromise = null;
      return token;
    } catch (error) {
      this.tokenRefreshPromise = null;
      throw error;
    }
  }

  /**
   * Refresh M-Pesa access token
   *
   * @private
   * @async
   * @returns {Promise<string>} New access token
   * @throws {PaymentError} If token refresh fails
   */
  async refreshAccessToken() {
    try {
      logger.debug('Refreshing M-Pesa access token');

      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

      const response = await axios.get(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
            'User-Agent': 'StakeOut-Payment-Module/1.0.0'
          },
          timeout: this.httpTimeout
        }
      );

      if (!response.data || !response.data.access_token) {
        throw new Error('Invalid token response from M-Pesa API');
      }

      this.accessToken = response.data.access_token;
      // M-Pesa tokens expire in 1 hour, set expiry with 5-minute buffer
      this.tokenExpiry = moment().add(55, 'minutes');

      logger.info('M-Pesa access token refreshed successfully', {
        provider: 'mpesa',
        expiresAt: this.tokenExpiry.toISOString()
      });

      return this.accessToken;

    } catch (error) {
      logger.error('Failed to refresh M-Pesa access token', {
        provider: 'mpesa',
        error: error.message,
        responseData: error.response?.data
      });

      if (error.response?.status === 401) {
        throw PaymentError.authenticationError(
          'Invalid M-Pesa credentials',
          { consumerKey: this.consumerKey }
        );
      }

      throw PaymentError.providerError(
        'mpesa',
        'Failed to get M-Pesa access token',
        'TOKEN_REFRESH_FAILED',
        { originalError: error.message }
      );
    }
  }

  /**
   * Generate M-Pesa password for STK Push
   *
   * Creates the password required for M-Pesa STK Push requests
   * by combining shortcode, passkey, and timestamp, then encoding
   * with Base64.
   *
   * @private
   * @param {string} timestamp - Timestamp in format YYYYMMDDHHmmss
   * @returns {string} Base64 encoded password
   */
  generatePassword(timestamp) {
    const password = Buffer.from(
      `${this.shortcode}${this.passkey}${timestamp}`
    ).toString('base64');

    return password;
  }

  /**
   * Format phone number for M-Pesa API
   *
   * Converts various phone number formats to the format expected
   * by M-Pesa API (254XXXXXXXXX).
   *
   * @private
   * @param {string} phoneNumber - Phone number in various formats
   * @returns {string} Formatted phone number (254XXXXXXXXX)
   * @throws {PaymentError} If phone number format is invalid
   */
  formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) {
      throw PaymentError.validationError(
        'Phone number is required',
        'phoneNumber',
        phoneNumber
      );
    }

    let formatted = phoneNumber.toString().replace(/[\s\-\(\)]/g, '');

    // Convert different formats to 254XXXXXXXXX
    if (formatted.startsWith('0')) {
      formatted = '254' + formatted.substring(1);
    } else if (formatted.startsWith('+254')) {
      formatted = formatted.substring(1);
    } else if (formatted.startsWith('254')) {
      // Already in correct format
    } else {
      throw PaymentError.validationError(
        'Phone number must start with 0, +254, or 254',
        'phoneNumber',
        phoneNumber
      );
    }

    // Validate final format
    if (!/^254\d{9}$/.test(formatted)) {
      throw PaymentError.validationError(
        'Phone number must be in format 254XXXXXXXXX (Kenyan mobile number)',
        'phoneNumber',
        phoneNumber
      );
    }

    return formatted;
  }

  /**
   * Create transaction reference for M-Pesa
   *
   * Generates a unique transaction reference following M-Pesa
   * guidelines and business requirements.
   *
   * @private
   * @param {string} baseReference - Base reference string
   * @returns {string} M-Pesa compatible transaction reference
   */
  createTransactionReference(baseReference) {
    // M-Pesa account reference should be alphanumeric and max 12 characters
    const timestamp = Date.now().toString().slice(-6);
    const reference = `${this.accountReference}${timestamp}`;

    return reference.substring(0, 12).toUpperCase();
  }

  /**
   * Initiate M-Pesa STK Push payment
   *
   * Starts a payment process by sending an STK Push prompt to the
   * customer's phone. The customer will receive a prompt to enter
   * their M-Pesa PIN to complete the payment.
   *
   * @async
   * @param {Object} paymentData - Payment information
   * @param {number} paymentData.amount - Payment amount (in KES)
   * @param {string} paymentData.phoneNumber - Customer phone number
   * @param {string} paymentData.reference - Transaction reference
   * @param {string} [paymentData.description] - Payment description
   * @returns {Promise<PaymentInitiationResult>} Payment initiation result
   * @throws {PaymentError} If payment initiation fails
   */
  async initiatePayment(paymentData) {
    try {
      // Validate payment data
      this.validatePaymentData(paymentData);

      // Format and validate phone number
      const formattedPhone = this.formatPhoneNumber(paymentData.phoneNumber);

      // Format amount (M-Pesa expects integer amount)
      const amount = Math.round(parseFloat(paymentData.amount));

      if (amount < 1) {
        throw PaymentError.validationError(
          'Minimum payment amount is 1 KES',
          'amount',
          paymentData.amount
        );
      }

      // Create account reference
      const accountReference = this.createTransactionReference(paymentData.reference);

      logger.info('Initiating M-Pesa STK Push', {
        provider: 'mpesa',
        amount,
        phoneNumber: formattedPhone.replace(/\d(?=\d{4})/g, '*'), // Mask phone number in logs
        reference: paymentData.reference,
        accountReference
      });

      // Get access token
      const token = await this.getAccessToken();

      // Generate timestamp and password
      const timestamp = moment().format('YYYYMMDDHHmmss');
      const password = this.generatePassword(timestamp);

      // Prepare STK Push request payload
      const payload = {
        BusinessShortCode: this.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: this.shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: this.callbackUrl,
        AccountReference: accountReference,
        TransactionDesc: paymentData.description || this.transactionDesc
      };

      logger.debug('M-Pesa STK Push payload prepared', {
        provider: 'mpesa',
        shortcode: this.shortcode,
        amount,
        phoneNumber: formattedPhone.replace(/\d(?=\d{4})/g, '*'),
        accountReference,
        callbackUrl: this.callbackUrl
      });

      // Make STK Push API request
      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'StakeOut-Payment-Module/1.0.0'
          },
          timeout: this.httpTimeout
        }
      );

      // Validate response
      if (!response.data) {
        throw new Error('Empty response from M-Pesa API');
      }

      const responseData = response.data;

      logger.debug('M-Pesa STK Push response received', {
        provider: 'mpesa',
        responseCode: responseData.ResponseCode,
        responseDescription: responseData.ResponseDescription,
        checkoutRequestId: responseData.CheckoutRequestID
      });

      // Check if STK push was successful
      if (responseData.ResponseCode !== '0') {
        throw PaymentError.providerError(
          'mpesa',
          responseData.ResponseDescription || 'Failed to initiate STK Push',
          'STK_PUSH_FAILED',
          {
            responseCode: responseData.ResponseCode,
            merchantRequestId: responseData.MerchantRequestID
          }
        );
      }

      // Calculate expiry time (M-Pesa STK prompts expire after 5 minutes)
      const expiresAt = moment().add(5, 'minutes').toDate();

      const result = {
        success: true,
        transactionId: null, // Will be set by calling code
        externalReference: responseData.CheckoutRequestID,
        status: 'initiated',
        message: 'STK Push sent successfully. Please check your phone.',
        providerData: {
          merchantRequestId: responseData.MerchantRequestID,
          checkoutRequestId: responseData.CheckoutRequestID,
          responseCode: responseData.ResponseCode,
          responseDescription: responseData.ResponseDescription,
          customerMessage: responseData.CustomerMessage
        },
        expiresAt
      };

      logger.info('M-Pesa STK Push initiated successfully', {
        provider: 'mpesa',
        checkoutRequestId: responseData.CheckoutRequestID,
        merchantRequestId: responseData.MerchantRequestID,
        expiresAt: expiresAt.toISOString()
      });

      return result;

    } catch (error) {
      logger.error('M-Pesa STK Push initiation failed', {
        provider: 'mpesa',
        error: error.message,
        phoneNumber: paymentData.phoneNumber?.replace(/\d(?=\d{4})/g, '*'),
        amount: paymentData.amount,
        responseData: error.response?.data
      });

      // If already a PaymentError, re-throw as-is
      if (error instanceof PaymentError) {
        throw error;
      }

      // Handle specific M-Pesa API errors
      if (error.response?.data) {
        const mpesaError = error.response.data;
        throw PaymentError.providerError(
          'mpesa',
          mpesaError.errorMessage || 'M-Pesa API error',
          mpesaError.errorCode || 'API_ERROR',
          {
            httpStatus: error.response.status,
            mpesaResponse: mpesaError
          }
        );
      }

      // Handle network/timeout errors
      if (error.code === 'ECONNABORTED') {
        throw PaymentError.timeoutError('M-Pesa STK Push', this.httpTimeout);
      }

      // Generic provider error
      throw PaymentError.providerError(
        'mpesa',
        'Failed to initiate M-Pesa payment',
        'INITIATION_FAILED',
        { originalError: error.message }
      );
    }
  }

  /**
   * Check M-Pesa payment status
   *
   * Queries the M-Pesa API to get the current status of a payment
   * transaction. This is used for polling payment status when
   * callbacks are delayed or missed.
   *
   * @async
   * @param {string} transactionId - Internal transaction ID (not used for M-Pesa queries)
   * @param {string} checkoutRequestId - M-Pesa CheckoutRequestID
   * @returns {Promise<PaymentStatusResult>} Payment status information
   * @throws {PaymentError} If status check fails
   */
  async checkPaymentStatus(transactionId, checkoutRequestId) {
    try {
      if (!checkoutRequestId) {
        throw PaymentError.validationError(
          'CheckoutRequestID is required for M-Pesa status check',
          'checkoutRequestId',
          checkoutRequestId
        );
      }

      logger.info('Checking M-Pesa payment status', {
        provider: 'mpesa',
        transactionId,
        checkoutRequestId
      });

      // Get access token
      const token = await this.getAccessToken();

      // Generate timestamp and password
      const timestamp = moment().format('YYYYMMDDHHmmss');
      const password = this.generatePassword(timestamp);

      // Prepare status query payload
      const payload = {
        BusinessShortCode: this.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      };

      // Make status query API request
      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'StakeOut-Payment-Module/1.0.0'
          },
          timeout: this.httpTimeout
        }
      );

      const responseData = response.data;

      logger.debug('M-Pesa status query response', {
        provider: 'mpesa',
        checkoutRequestId,
        resultCode: responseData.ResultCode,
        resultDesc: responseData.ResultDesc
      });

      // Map M-Pesa result codes to standard status
      const status = this.mapMpesaStatusToStandard(responseData.ResultCode);

      const result = {
        success: true,
        transactionId,
        externalReference: checkoutRequestId,
        status,
        message: responseData.ResultDesc,
        providerData: responseData,
        updatedAt: new Date()
      };

      logger.info('M-Pesa status check completed', {
        provider: 'mpesa',
        checkoutRequestId,
        status,
        resultCode: responseData.ResultCode
      });

      return result;

    } catch (error) {
      logger.error('M-Pesa status check failed', {
        provider: 'mpesa',
        transactionId,
        checkoutRequestId,
        error: error.message
      });

      if (error instanceof PaymentError) {
        throw error;
      }

      throw PaymentError.providerError(
        'mpesa',
        'Failed to check M-Pesa payment status',
        'STATUS_CHECK_FAILED',
        {
          transactionId,
          checkoutRequestId,
          originalError: error.message
        }
      );
    }
  }

  /**
   * Process M-Pesa callback/webhook
   *
   * Handles incoming payment notifications from M-Pesa. This method
   * processes the callback data and returns the updated payment status.
   *
   * @async
   * @param {Object} callbackData - M-Pesa callback payload
   * @param {Object} [headers={}] - HTTP headers from callback request
   * @returns {Promise<CallbackProcessingResult>} Processing result
   * @throws {PaymentError} If callback processing fails
   */
  async processCallback(callbackData, headers = {}) {
    try {
      logger.info('Processing M-Pesa callback', {
        provider: 'mpesa',
        callbackReceived: new Date().toISOString()
      });

      // Validate callback data structure
      if (!callbackData || !callbackData.Body || !callbackData.Body.stkCallback) {
        throw PaymentError.validationError(
          'Invalid M-Pesa callback data structure',
          'callbackData',
          'Missing Body.stkCallback'
        );
      }

      const stkCallback = callbackData.Body.stkCallback;
      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = stkCallback.ResultCode;

      if (!checkoutRequestId) {
        throw PaymentError.validationError(
          'Missing CheckoutRequestID in callback',
          'checkoutRequestId',
          null
        );
      }

      logger.debug('M-Pesa callback data parsed', {
        provider: 'mpesa',
        checkoutRequestId,
        resultCode,
        resultDesc: stkCallback.ResultDesc
      });

      // Map result code to status
      const newStatus = this.mapMpesaStatusToStandard(resultCode);

      // Extract callback metadata for successful payments
      let callbackMetadata = {};
      if (resultCode === 0 && stkCallback.CallbackMetadata?.Item) {
        callbackMetadata = this.extractCallbackMetadata(stkCallback.CallbackMetadata.Item);
      }

      const result = {
        success: true,
        transactionId: null, // Will be filled by calling code after database lookup
        externalReference: checkoutRequestId,
        oldStatus: 'initiated', // Will be updated by calling code
        newStatus,
        message: this.getResultMessage(resultCode, stkCallback.ResultDesc),
        data: {
          resultCode,
          resultDesc: stkCallback.ResultDesc,
          callbackMetadata,
          rawCallback: callbackData
        }
      };

      logger.info('M-Pesa callback processed successfully', {
        provider: 'mpesa',
        checkoutRequestId,
        resultCode,
        newStatus,
        hasMetadata: Object.keys(callbackMetadata).length > 0
      });

      return result;

    } catch (error) {
      logger.error('M-Pesa callback processing failed', {
        provider: 'mpesa',
        error: error.message,
        callbackData: JSON.stringify(callbackData, null, 2)
      });

      if (error instanceof PaymentError) {
        throw error;
      }

      throw PaymentError.providerError(
        'mpesa',
        'Failed to process M-Pesa callback',
        'CALLBACK_PROCESSING_FAILED',
        { originalError: error.message }
      );
    }
  }

  /**
   * Extract metadata from M-Pesa callback
   *
   * Parses the CallbackMetadata array from M-Pesa into a structured object.
   *
   * @private
   * @param {Array} metadataItems - CallbackMetadata Item array from M-Pesa
   * @returns {Object} Structured metadata object
   */
  extractCallbackMetadata(metadataItems) {
    const metadata = {};

    if (Array.isArray(metadataItems)) {
      metadataItems.forEach(item => {
        if (item.Name && item.hasOwnProperty('Value')) {
          // Map M-Pesa field names to our standard names
          const fieldMap = {
            'Amount': 'amount',
            'MpesaReceiptNumber': 'receiptNumber',
            'TransactionDate': 'transactionDate',
            'PhoneNumber': 'phoneNumber'
          };

          const fieldName = fieldMap[item.Name] || item.Name;
          metadata[fieldName] = item.Value;
        }
      });
    }

    return metadata;
  }

  /**
   * Map M-Pesa result codes to standard payment status
   *
   * Converts M-Pesa-specific result codes to standardized status values
   * used throughout the payment module.
   *
   * @private
   * @param {string|number} resultCode - M-Pesa result code
   * @returns {string} Standard payment status
   */
  mapMpesaStatusToStandard(resultCode) {
    const code = parseInt(resultCode);

    const statusMap = {
      0: 'completed',         // Success
      1032: 'cancelled',      // Request cancelled by user
      1037: 'timeout',        // User failed to complete transaction
      2001: 'initiated',      // The initiator information is invalid
      1: 'failed',           // Insufficient funds
      26: 'failed',          // System busy
      1025: 'failed',        // Unable to lock subscriber
      1019: 'failed',        // Transaction expired
      9999: 'failed',        // Request failed
      1001: 'failed',        // Unable to lock subscriber
      1036: 'failed'         // Transaction failed
    };

    return statusMap[code] || 'failed';
  }

  /**
   * Get user-friendly message for M-Pesa result code
   *
   * @private
   * @param {string|number} resultCode - M-Pesa result code
   * @param {string} defaultMessage - Default message from M-Pesa
   * @returns {string} User-friendly message
   */
  getResultMessage(resultCode, defaultMessage) {
    const code = parseInt(resultCode);

    const messageMap = {
      0: 'Payment completed successfully',
      1032: 'Payment was cancelled',
      1037: 'Payment timeout - you did not complete the transaction in time',
      1: 'Insufficient funds in your M-Pesa account',
      26: 'System is busy, please try again',
      1025: 'Unable to process payment, please try again',
      1019: 'Payment request expired',
      1001: 'Invalid phone number or account',
      1036: 'Payment failed, please try again'
    };

    return messageMap[code] || defaultMessage || 'Payment processing failed';
  }

  /**
   * Validate M-Pesa webhook signature (not implemented by M-Pesa)
   *
   * M-Pesa does not provide webhook signature validation.
   * This method exists to satisfy the interface but always returns true.
   *
   * @param {Object} payload - Webhook payload
   * @param {string} signature - Signature (not used for M-Pesa)
   * @param {string} secret - Secret (not used for M-Pesa)
   * @returns {boolean} Always true for M-Pesa
   */
  validateWebhookSignature(payload, signature, secret) {
    // M-Pesa does not provide webhook signature validation
    // Security is achieved through IP whitelisting and HTTPS
    logger.debug('M-Pesa webhook signature validation (not implemented by M-Pesa)', {
      provider: 'mpesa'
    });

    return true;
  }

  /**
   * Get supported payment methods
   *
   * @returns {string[]} Supported payment methods
   */
  getSupportedPaymentMethods() {
    return ['mobile_money'];
  }

  /**
   * Get supported currencies
   *
   * @returns {string[]} Supported currency codes
   */
  getSupportedCurrencies() {
    return ['KES']; // M-Pesa only supports Kenyan Shilling
  }

  /**
   * Get provider configuration summary (safe for logging)
   *
   * @returns {Object} Configuration summary without sensitive data
   */
  getConfigSummary() {
    return {
      ...super.getConfigSummary(),
      shortcode: this.shortcode,
      environment: this.environment,
      baseUrl: this.baseUrl,
      callbackUrl: this.callbackUrl,
      accountReference: this.accountReference,
      hasToken: !!this.accessToken,
      tokenExpiry: this.tokenExpiry?.toISOString()
    };
  }
}

module.exports = MpesaProvider;