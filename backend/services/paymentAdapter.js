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

const pool = require('../config/db');
const fetch = require('node-fetch');

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
      paymentModuleUrl: config.paymentModule?.baseUrl || config.paymentModuleUrl || process.env.PAYMENT_MODULE_URL,
      paymentModuleApiKey: config.paymentModule?.apiKey || config.paymentModuleApiKey,
      paymentModuleTimeout: config.paymentModule?.timeout || config.paymentModuleTimeout || 30000,
      ...config
    };

    // Since payment module now uses same database as legacy, no separate client needed
    this.paymentClient = null;

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
      // Check if payment module is running by making a health check
      const response = await fetch(`${this.config.paymentModuleUrl}/health`, {
        method: 'GET',
        timeout: 3000
      });
      return response.ok;
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
    // Since payment module uses same database, delegate to legacy service
    // The payment module will create records in the same tables
    console.log('Payment module available - delegating to legacy service since same database');

    if (this.legacyService) {
      return await this.legacyService.initiateSTKPush(phoneNumber, amount, accountReference);
    }

    throw new Error('No payment service configured');
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
        
        const response = await fetch(`${this.config.paymentModuleUrl}/api/webhooks/mpesa/callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.config.paymentModuleApiKey
          },
          body: JSON.stringify(callbackData),
          timeout: this.config.paymentModuleTimeout
        });
        
        if (!response.ok) {
          throw new Error(`Payment module returned ${response.status}: ${response.statusText}`);
        }
        
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

        // Since both systems use same database, delegate to legacy service
        console.log('Payment module available - using legacy service for status check since same database');

        if (this.legacyService) {
          return await this.legacyService.querySTKStatus(checkoutRequestId);
        }

        throw new Error('No payment service configured');
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
        // Since both systems now use same database, query directly with legacy service
        // The payment module stores data in the same transactions/mpesa_transactions tables
        console.log('Payment module available - using legacy service for transaction query since same database');

        if (this.legacyService) {
          return await this.legacyService.getPendingTransactionsForUser(userId);
        }

        return [];
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
        // Since both systems use same database, delegate to legacy service
        if (this.legacyService) {
          return await this.legacyService.cancelTransaction(transactionId, userId);
        }

        throw new Error('No payment service configured');
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
    // Since we're using legacy service, no additional cleanup needed
    console.log('Payment adapter shutdown complete');
  }
}

module.exports = PaymentAdapter;