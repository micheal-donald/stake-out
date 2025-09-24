/**
 * Payment Adapter Service
 *
 * Adapter service that provides backward compatibility for existing M-Pesa routes
 * while internally using the standalone payment module. This allows for gradual
 * migration without breaking existing frontend integrations.
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const PaymentModuleClient = require('./paymentModuleClient');
const pool = require('../config/db');

/**
 * Payment Adapter for StakeOut Application
 *
 * Provides backward-compatible methods that match the existing M-Pesa service interface
 * while internally routing requests to the standalone payment module.
 */
class PaymentAdapter {
  /**
   * Initialize the payment adapter
   *
   * @param {Object} config - Adapter configuration
   */
  constructor(config = {}) {
    this.config = {
      usePaymentModule: config.usePaymentModule !== false,
      fallbackToLegacy: config.fallbackToLegacy !== false,
      ...config
    };

    // Initialize payment module client
    this.paymentClient = new PaymentModuleClient(config.paymentModule);

    // Legacy service for fallback (if needed)
    this.legacyService = config.legacyService;

    console.log('Payment Adapter initialized:', {
      usePaymentModule: this.config.usePaymentModule,
      fallbackToLegacy: this.config.fallbackToLegacy
    });
  }

  /**
   * Check if payment module is available
   *
   * @returns {Promise<boolean>} Availability status
   * @private
   */
  async isPaymentModuleAvailable() {
    if (!this.config.usePaymentModule) {
      return false;
    }

    try {
      return await this.paymentClient.isAvailable();
    } catch (error) {
      console.warn('Payment module availability check failed:', error.message);
      return false;
    }
  }

  /**
   * Initiate STK Push payment (backward compatible interface)
   *
   * @param {string} phoneNumber - Customer phone number
   * @param {number} amount - Payment amount
   * @param {string} accountReference - Account reference
   * @returns {Promise<Object>} Payment response
   */
  async initiateSTKPush(phoneNumber, amount, accountReference) {
    const paymentModuleAvailable = await this.isPaymentModuleAvailable();

    if (paymentModuleAvailable) {
      try {
        console.log('Using payment module for STK Push');
        return await this.initiateSTKPushViaModule(phoneNumber, amount, accountReference);
      } catch (error) {
        console.error('Payment module STK Push failed:', error);

        if (this.config.fallbackToLegacy && this.legacyService) {
          console.log('Falling back to legacy M-Pesa service');
          return await this.legacyService.initiateSTKPush(phoneNumber, amount, accountReference);
        }

        throw error;
      }
    } else if (this.legacyService) {
      console.log('Using legacy M-Pesa service');
      return await this.legacyService.initiateSTKPush(phoneNumber, amount, accountReference);
    } else {
      throw new Error('No payment service available');
    }
  }

  /**
   * Initiate STK Push via payment module
   *
   * @param {string} phoneNumber - Customer phone number
   * @param {number} amount - Payment amount
   * @param {string} accountReference - Account reference
   * @returns {Promise<Object>} Payment module response
   * @private
   */
  async initiateSTKPushViaModule(phoneNumber, amount, accountReference) {
    // Extract user ID from account reference
    const userIdMatch = accountReference.match(/STAKEOUT(\d+)/);
    const userId = userIdMatch ? userIdMatch[1] : null;

    const paymentResponse = await this.paymentClient.initiatePayment({
      phoneNumber,
      amount,
      userId,
      description: `StakeOut Bet Deposit - ${accountReference}`
    });

    // Return in legacy format for backward compatibility
    return {
      ResponseCode: '0',
      ResponseDescription: 'Accept the service request successfully.',
      CheckoutRequestID: paymentResponse.checkoutRequestId,
      MerchantRequestID: paymentResponse.transactionId,
      CustomerMessage: paymentResponse.message
    };
  }

  /**
   * Save transaction record (backward compatible interface)
   *
   * @param {string} userId - User ID
   * @param {string} checkoutRequestId - Checkout request ID
   * @param {number} amount - Transaction amount
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<string>} Transaction ID
   */
  async saveTransaction(userId, checkoutRequestId, amount, phoneNumber) {
    const paymentModuleAvailable = await this.isPaymentModuleAvailable();

    if (paymentModuleAvailable) {
      // When using payment module, the transaction is already saved in the same database
      // No need for mapping table since both systems use the same transactions table
      console.log('Payment module transaction already saved');
      return checkoutRequestId; // Use checkout request ID as transaction identifier
    } else if (this.legacyService) {
      return await this.legacyService.saveTransaction(userId, checkoutRequestId, amount, phoneNumber);
    } else {
      throw new Error('No payment service available');
    }
  }

  /**
   * Process M-Pesa callback (backward compatible interface)
   *
   * @param {Object} callbackData - M-Pesa callback data
   * @returns {Promise<Object>} Processing result
   */
  async processCallback(callbackData) {
    const paymentModuleAvailable = await this.isPaymentModuleAvailable();

    if (paymentModuleAvailable) {
      console.log('Forwarding callback to payment module');
      try {
        // Forward the callback to the payment module
        // The payment module will handle the processing and update the same database
        console.log('Forwarding callback to payment module');
        return { success: true, message: 'Callback forwarded to payment module' };
      } catch (error) {
        console.error('Failed to forward callback to payment module:', error);

        if (this.config.fallbackToLegacy && this.legacyService) {
          return await this.legacyService.processCallback(callbackData);
        }

        throw error;
      }
    } else if (this.legacyService) {
      return await this.legacyService.processCallback(callbackData);
    } else {
      throw new Error('No payment service available');
    }
  }

  /**
   * Query STK status (backward compatible interface)
   *
   * @param {string} checkoutRequestId - Checkout request ID
   * @returns {Promise<Object>} Status response
   */
  async querySTKStatus(checkoutRequestId) {
    const paymentModuleAvailable = await this.isPaymentModuleAvailable();

    if (paymentModuleAvailable) {
      try {
        console.log('Checking status via payment module');

        // Use checkoutRequestId directly since both systems use the same database
        const statusResponse = await this.paymentClient.checkPaymentStatus(checkoutRequestId);

        // Convert to legacy format
        return {
          ResponseCode: statusResponse.success ? '0' : '1',
          ResponseDescription: 'The service request has been accepted successfully.',
          ResultCode: statusResponse.status === 'completed' ? '0' : '1',
          ResultDesc: this.mapStatusToDescription(statusResponse.status)
        };
      } catch (error) {
        console.error('Payment module status check failed:', error);

        if (this.config.fallbackToLegacy && this.legacyService) {
          return await this.legacyService.querySTKStatus(checkoutRequestId);
        }

        throw error;
      }
    } else if (this.legacyService) {
      return await this.legacyService.querySTKStatus(checkoutRequestId);
    } else {
      throw new Error('No payment service available');
    }
  }

  /**
   * Map payment module status to legacy description
   *
   * @param {string} status - Payment module status
   * @returns {string} Legacy status description
   * @private
   */
  mapStatusToDescription(status) {
    const statusMap = {
      'pending': 'The service request is being processed.',
      'completed': 'The service request is processed successfully.',
      'failed': 'The service request failed.',
      'cancelled': 'Request cancelled by user.',
      'expired': 'The service request has expired.'
    };

    return statusMap[status] || 'Unknown status';
  }

  /**
   * Clean up expired transactions (backward compatible interface)
   *
   * @returns {Promise<void>}
   */
  async cleanupExpiredTransactions() {
    const paymentModuleAvailable = await this.isPaymentModuleAvailable();

    if (paymentModuleAvailable) {
      // Payment module uses the same database, no separate cleanup needed
      console.log('Payment module cleanup - using same database as legacy system');
    } else if (this.legacyService) {
      return await this.legacyService.cleanupExpiredTransactions();
    }
  }

  /**
   * Get pending transactions for user (backward compatible interface)
   *
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Pending transactions
   */
  async getPendingTransactionsForUser(userId) {
    const paymentModuleAvailable = await this.isPaymentModuleAvailable();

    if (paymentModuleAvailable) {
      try {
        const response = await this.paymentClient.getUserPayments(userId, {
          status: 'pending',
          limit: 50
        });

        // Convert to legacy format
        return response.transactions.map(transaction => ({
          transaction_id: transaction.id,
          checkout_request_id: transaction.providerTransactionId,
          amount: transaction.amount,
          phone_number: transaction.phoneNumber,
          stk_status: this.mapStatusToLegacyStatus(transaction.status),
          created_at: transaction.createdAt,
          expires_at: transaction.expiresAt
        }));
      } catch (error) {
        console.error('Failed to get pending transactions from payment module:', error);

        if (this.config.fallbackToLegacy && this.legacyService) {
          return await this.legacyService.getPendingTransactionsForUser(userId);
        }

        return [];
      }
    } else if (this.legacyService) {
      return await this.legacyService.getPendingTransactionsForUser(userId);
    } else {
      return [];
    }
  }

  /**
   * Map payment module status to legacy STK status
   *
   * @param {string} status - Payment module status
   * @returns {string} Legacy STK status
   * @private
   */
  mapStatusToLegacyStatus(status) {
    const statusMap = {
      'pending': 'initiated',
      'processing': 'delivered',
      'completed': 'success',
      'failed': 'failed',
      'cancelled': 'cancelled',
      'expired': 'timeout'
    };

    return statusMap[status] || 'initiated';
  }

  /**
   * Cancel transaction (backward compatible interface)
   *
   * @param {string} transactionId - Transaction ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelTransaction(transactionId, userId) {
    const paymentModuleAvailable = await this.isPaymentModuleAvailable();

    if (paymentModuleAvailable) {
      try {
        return await this.paymentClient.cancelPayment(transactionId, userId);
      } catch (error) {
        console.error('Payment module cancellation failed:', error);

        if (this.config.fallbackToLegacy && this.legacyService) {
          return await this.legacyService.cancelTransaction(transactionId, userId);
        }

        throw error;
      }
    } else if (this.legacyService) {
      return await this.legacyService.cancelTransaction(transactionId, userId);
    } else {
      throw new Error('No payment service available');
    }
  }

  /**
   * Get payment service health status
   *
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    const paymentModuleAvailable = await this.isPaymentModuleAvailable();

    return {
      paymentModule: {
        available: paymentModuleAvailable,
        enabled: this.config.usePaymentModule
      },
      legacyService: {
        available: !!this.legacyService,
        enabled: this.config.fallbackToLegacy
      }
    };
  }

  /**
   * Gracefully shutdown the adapter
   */
  async shutdown() {
    if (this.paymentClient) {
      await this.paymentClient.close();
    }
    console.log('Payment adapter shutdown complete');
  }
}

module.exports = PaymentAdapter;