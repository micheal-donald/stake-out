/**
 * Payment Module Client
 *
 * Client adapter for integrating the standalone payment module with the main StakeOut application.
 * Provides a seamless interface for payment operations while maintaining backwards compatibility.
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const axios = require('axios');
const EventEmitter = require('events');

/**
 * Payment Module Client for StakeOut Application Integration
 *
 * Provides a client interface to communicate with the standalone payment module.
 * Handles authentication, request routing, and event forwarding.
 */
class PaymentModuleClient extends EventEmitter {
  /**
   * Initialize the payment module client
   *
   * @param {Object} config - Client configuration
   * @param {string} config.baseUrl - Payment module base URL
   * @param {string} config.apiKey - API key for authentication
   * @param {number} config.timeout - Request timeout in milliseconds
   * @param {boolean} config.enableEvents - Enable event forwarding
   */
  constructor(config = {}) {
    super();

    this.config = {
      baseUrl: config.baseUrl || process.env.PAYMENT_MODULE_URL || 'http://localhost:3737',
      apiKey: config.apiKey || process.env.PAYMENT_MODULE_API_KEY,
      timeout: config.timeout || 30000,
      enableEvents: config.enableEvents !== false,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000
    };

    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
        'User-Agent': 'StakeOut-Backend/1.0.0'
      }
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`Payment Module Request: ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('Payment Module Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        console.log(`Payment Module Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('Payment Module Response Error:', error.response?.data || error.message);
        return Promise.reject(this.handleApiError(error));
      }
    );

    // Setup event forwarding if enabled
    if (this.config.enableEvents) {
      this.setupEventForwarding();
    }
  }

  /**
   * Handle API errors and convert to standardized format
   *
   * @param {Error} error - Original axios error
   * @returns {Error} Standardized error
   * @private
   */
  handleApiError(error) {
    if (error.response) {
      // Server responded with error status
      const apiError = new Error(error.response.data?.message || 'Payment module API error');
      apiError.status = error.response.status;
      apiError.code = error.response.data?.code;
      apiError.details = error.response.data?.details;
      return apiError;
    } else if (error.request) {
      // Request was made but no response received
      const networkError = new Error('Payment module is unavailable');
      networkError.status = 503;
      networkError.code = 'SERVICE_UNAVAILABLE';
      return networkError;
    } else {
      // Something else happened
      return error;
    }
  }

  /**
   * Setup event forwarding from payment module webhooks
   *
   * @private
   */
  setupEventForwarding() {
    // This would typically involve setting up a webhook endpoint
    // For now, we'll implement polling for demonstration
    console.log('Event forwarding enabled for payment module');
  }

  /**
   * Check if payment module is available
   *
   * @returns {Promise<boolean>} Payment module availability status
   */
  async isAvailable() {
    try {
      const response = await this.client.get('/health');
      return response.data.status === 'healthy';
    } catch (error) {
      console.warn('Payment module health check failed:', error.message);
      return false;
    }
  }

  /**
   * Initiate M-Pesa STK Push payment
   *
   * @param {Object} paymentData - Payment request data
   * @param {string} paymentData.phoneNumber - Customer phone number
   * @param {number} paymentData.amount - Payment amount
   * @param {string} paymentData.userId - User ID from main application
   * @param {string} paymentData.description - Payment description
   * @returns {Promise<Object>} Payment initiation response
   */
  async initiatePayment(paymentData) {
    try {
      const response = await this.client.post('/api/payments/initiate', {
        provider: 'mpesa',
        phoneNumber: paymentData.phoneNumber,
        amount: paymentData.amount,
        currency: 'KES',
        description: paymentData.description || 'StakeOut Bet Deposit',
        metadata: {
          userId: paymentData.userId,
          source: 'stakeout-backend',
          type: 'deposit'
        }
      });

      return {
        success: true,
        transactionId: response.data.transaction.id,
        checkoutRequestId: response.data.transaction.providerTransactionId,
        message: response.data.message,
        amount: response.data.transaction.amount,
        phoneNumber: response.data.transaction.phoneNumber,
        expiresAt: response.data.transaction.expiresAt
      };
    } catch (error) {
      console.error('Payment initiation failed:', error);
      throw error;
    }
  }

  /**
   * Check payment status
   *
   * @param {string} transactionId - Transaction ID from payment module
   * @returns {Promise<Object>} Payment status response
   */
  async checkPaymentStatus(transactionId) {
    try {
      const response = await this.client.get(`/api/payments/${transactionId}/status`);

      return {
        success: true,
        status: response.data.transaction.status,
        amount: response.data.transaction.amount,
        phoneNumber: response.data.transaction.phoneNumber,
        createdAt: response.data.transaction.createdAt,
        updatedAt: response.data.transaction.updatedAt,
        providerData: response.data.transaction.providerData
      };
    } catch (error) {
      console.error('Payment status check failed:', error);
      throw error;
    }
  }

  /**
   * Get payment transaction details
   *
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} Transaction details
   */
  async getTransaction(transactionId) {
    try {
      const response = await this.client.get(`/api/payments/${transactionId}`);
      return {
        success: true,
        transaction: response.data.transaction
      };
    } catch (error) {
      console.error('Get transaction failed:', error);
      throw error;
    }
  }

  /**
   * Get user's payment history
   *
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {number} options.page - Page number
   * @param {number} options.limit - Records per page
   * @param {string} options.status - Filter by status
   * @returns {Promise<Object>} Payment history response
   */
  async getUserPayments(userId, options = {}) {
    try {
      const params = new URLSearchParams({
        userId,
        page: options.page || 1,
        limit: options.limit || 10,
        ...(options.status && { status: options.status })
      });

      const response = await this.client.get(`/api/payments?${params}`);

      return {
        success: true,
        transactions: response.data.transactions,
        pagination: response.data.pagination
      };
    } catch (error) {
      console.error('Get user payments failed:', error);
      throw error;
    }
  }

  /**
   * Cancel a pending payment
   *
   * @param {string} transactionId - Transaction ID to cancel
   * @param {string} userId - User ID for authorization
   * @returns {Promise<Object>} Cancellation response
   */
  async cancelPayment(transactionId, userId) {
    try {
      const response = await this.client.post(`/api/payments/${transactionId}/cancel`, {
        userId,
        reason: 'User requested cancellation'
      });

      return {
        success: true,
        message: response.data.message
      };
    } catch (error) {
      console.error('Payment cancellation failed:', error);
      throw error;
    }
  }

  /**
   * Get available payment providers
   *
   * @returns {Promise<Object>} Available providers
   */
  async getProviders() {
    try {
      const response = await this.client.get('/api/providers');

      return {
        success: true,
        providers: response.data.providers
      };
    } catch (error) {
      console.error('Get providers failed:', error);
      throw error;
    }
  }

  /**
   * Retry a failed request with exponential backoff
   *
   * @param {Function} operation - Operation to retry
   * @param {number} attempts - Current attempt number
   * @returns {Promise<*>} Operation result
   * @private
   */
  async retryOperation(operation, attempts = 0) {
    try {
      return await operation();
    } catch (error) {
      if (attempts < this.config.retries && this.isRetryableError(error)) {
        const delay = this.config.retryDelay * Math.pow(2, attempts);
        console.log(`Retrying payment operation in ${delay}ms (attempt ${attempts + 1}/${this.config.retries})`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryOperation(operation, attempts + 1);
      }
      throw error;
    }
  }

  /**
   * Check if error is retryable
   *
   * @param {Error} error - Error to check
   * @returns {boolean} Whether error is retryable
   * @private
   */
  isRetryableError(error) {
    // Retry on network errors or 5xx server errors
    return !error.status || error.status >= 500;
  }

  /**
   * Gracefully close the client
   */
  async close() {
    // Clear any pending intervals or timeouts
    console.log('Payment module client closed');
  }
}

module.exports = PaymentModuleClient;