/**
 * Webhook Controller
 *
 * Handles incoming webhooks from payment providers to update transaction
 * statuses and process payment confirmations. Provides secure webhook
 * endpoint handling with signature verification and event processing.
 *
 * Features:
 * - Provider-specific webhook processing
 * - Signature verification for security
 * - Transaction status updates
 * - Event emission for downstream processing
 * - Idempotency handling
 * - Error recovery and retry logic
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { providerFactory } = require('../../providers/ProviderFactory');
const Transaction = require('../../database/models/Transaction');
const PaymentDetail = require('../../database/models/PaymentDetail');
const { paymentEventEmitter } = require('../../events/PaymentEventEmitter');
const PaymentError = require('../../errors/PaymentError');
const logger = require('../../utils/logger');
const crypto = require('crypto');

/**
 * Webhook Controller Class
 *
 * Centralizes webhook handling for all payment providers with proper
 * security, validation, and processing workflows.
 */
class WebhookController {
  /**
   * Handle M-Pesa webhook callback
   *
   * @param {Object} webhookData - Webhook payload data
   * @param {Object} headers - Request headers for verification
   * @returns {Promise<Object>} Webhook processing result
   */
  static async handleMpesaWebhook(webhookData, headers) {
    try {
      logger.info('M-Pesa webhook received', {
        checkoutRequestId: webhookData.Body?.stkCallback?.CheckoutRequestID,
        resultCode: webhookData.Body?.stkCallback?.ResultCode,
        resultDesc: webhookData.Body?.stkCallback?.ResultDesc
      });

      // Verify webhook signature if configured
      if (process.env.MPESA_WEBHOOK_SECRET) {
        const isValid = WebhookController.verifyMpesaSignature(webhookData, headers);
        if (!isValid) {
          throw new PaymentError(
            'INVALID_WEBHOOK_SIGNATURE',
            'Invalid webhook signature',
            'AUTHENTICATION_ERROR'
          );
        }
      }

      const stkCallback = webhookData.Body?.stkCallback;
      if (!stkCallback) {
        throw new PaymentError(
          'INVALID_WEBHOOK_FORMAT',
          'Invalid M-Pesa webhook format',
          'VALIDATION_ERROR'
        );
      }

      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = stkCallback.ResultCode;
      const resultDesc = stkCallback.ResultDesc;

      // Find transaction by provider transaction ID
      const paymentDetail = await PaymentDetail.findByProviderTransactionId(checkoutRequestId);
      if (!paymentDetail) {
        logger.warn('Transaction not found for M-Pesa webhook', {
          checkoutRequestId,
          resultCode
        });

        return {
          success: true,
          message: 'Transaction not found - webhook ignored',
          acknowledged: true
        };
      }

      const transaction = await Transaction.findById(paymentDetail.transactionId);
      if (!transaction) {
        throw new PaymentError(
          'TRANSACTION_NOT_FOUND',
          'Transaction record not found',
          'NOT_FOUND',
          { transactionId: paymentDetail.transactionId }
        );
      }

      // Determine new status based on result code
      let newStatus;
      let paymentData = {};

      if (resultCode === 0) {
        // Success
        newStatus = 'completed';

        // Extract payment metadata from callback metadata
        if (stkCallback.CallbackMetadata?.Item) {
          const metadata = {};
          stkCallback.CallbackMetadata.Item.forEach(item => {
            metadata[item.Name] = item.Value;
          });

          paymentData = {
            mpesaReceiptNumber: metadata.MpesaReceiptNumber,
            transactionDate: metadata.TransactionDate,
            phoneNumber: metadata.PhoneNumber,
            amount: metadata.Amount
          };
        }
      } else {
        // Failed or cancelled
        newStatus = resultCode === 1032 ? 'cancelled' : 'failed';
      }

      // Check for idempotency - avoid processing same webhook twice
      if (transaction.status === newStatus) {
        logger.info('Webhook already processed', {
          transactionId: transaction.id,
          currentStatus: transaction.status,
          webhookStatus: newStatus
        });

        return {
          success: true,
          message: 'Webhook already processed',
          acknowledged: true
        };
      }

      // Update transaction status
      await Transaction.update(transaction.id, {
        status: newStatus,
        metadata: {
          ...transaction.metadata,
          mpesaCallback: {
            resultCode,
            resultDesc,
            processedAt: new Date(),
            ...paymentData
          }
        },
        updatedAt: new Date()
      });

      // Update payment detail
      await PaymentDetail.update(paymentDetail.id, {
        status: newStatus,
        providerData: {
          ...paymentDetail.providerData,
          callback: stkCallback,
          processedAt: new Date()
        }
      });

      // Emit webhook processed event
      paymentEventEmitter.emit('webhook.processed', {
        provider: 'mpesa',
        transactionId: transaction.id,
        oldStatus: transaction.status,
        newStatus,
        webhookData: stkCallback,
        paymentData
      });

      // Emit transaction status change event
      paymentEventEmitter.emit('payment.status_changed', {
        transactionId: transaction.id,
        oldStatus: transaction.status,
        newStatus,
        provider: 'mpesa',
        metadata: paymentData
      });

      logger.info('M-Pesa webhook processed successfully', {
        transactionId: transaction.id,
        checkoutRequestId,
        oldStatus: transaction.status,
        newStatus,
        resultCode,
        resultDesc
      });

      return {
        success: true,
        message: 'Webhook processed successfully',
        transactionId: transaction.id,
        status: newStatus,
        acknowledged: true
      };

    } catch (error) {
      logger.error('M-Pesa webhook processing failed', {
        error: error.message,
        stack: error.stack,
        webhookData
      });

      throw error;
    }
  }

  /**
   * Handle generic provider webhook
   *
   * @param {string} provider - Provider name
   * @param {Object} webhookData - Webhook payload
   * @param {Object} headers - Request headers
   * @returns {Promise<Object>} Processing result
   */
  static async handleProviderWebhook(provider, webhookData, headers) {
    try {
      logger.info('Provider webhook received', {
        provider,
        hasPayload: !!webhookData
      });

      // Get provider instance
      const paymentProvider = await providerFactory.getProvider(provider);
      if (!paymentProvider) {
        throw new PaymentError(
          'PROVIDER_NOT_AVAILABLE',
          `Provider '${provider}' not available`,
          'PROVIDER_ERROR',
          { provider }
        );
      }

      // Verify webhook if provider supports it
      if (typeof paymentProvider.verifyWebhook === 'function') {
        const isValid = await paymentProvider.verifyWebhook(webhookData, headers);
        if (!isValid) {
          throw new PaymentError(
            'INVALID_WEBHOOK_SIGNATURE',
            'Webhook signature verification failed',
            'AUTHENTICATION_ERROR'
          );
        }
      }

      // Process webhook if provider supports it
      if (typeof paymentProvider.processWebhook === 'function') {
        const result = await paymentProvider.processWebhook(webhookData);

        // Update transaction if result contains transaction info
        if (result.transactionId && result.status) {
          await WebhookController.updateTransactionFromWebhook(
            result.transactionId,
            result.status,
            result.data || {},
            provider
          );
        }

        return result;
      }

      // Fallback for providers without webhook processing
      logger.warn('Provider does not support webhook processing', { provider });

      return {
        success: true,
        message: 'Webhook received but not processed',
        acknowledged: true
      };

    } catch (error) {
      logger.error('Provider webhook processing failed', {
        provider,
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Update transaction status from webhook data
   *
   * @param {string} transactionId - Transaction ID
   * @param {string} newStatus - New status
   * @param {Object} webhookData - Additional webhook data
   * @param {string} provider - Provider name
   * @returns {Promise<void>}
   * @private
   */
  static async updateTransactionFromWebhook(transactionId, newStatus, webhookData, provider) {
    try {
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        throw new PaymentError(
          'TRANSACTION_NOT_FOUND',
          'Transaction not found',
          'NOT_FOUND',
          { transactionId }
        );
      }

      // Avoid duplicate processing
      if (transaction.status === newStatus) {
        logger.debug('Transaction status unchanged', {
          transactionId,
          currentStatus: transaction.status
        });
        return;
      }

      // Update transaction
      await Transaction.update(transactionId, {
        status: newStatus,
        metadata: {
          ...transaction.metadata,
          webhookUpdate: {
            provider,
            updatedAt: new Date(),
            data: webhookData
          }
        },
        updatedAt: new Date()
      });

      // Update payment detail
      const paymentDetail = await PaymentDetail.findByTransactionId(transactionId);
      if (paymentDetail) {
        await PaymentDetail.update(paymentDetail.id, {
          status: newStatus,
          providerData: {
            ...paymentDetail.providerData,
            webhookUpdate: webhookData
          }
        });
      }

      // Emit status change event
      paymentEventEmitter.emit('payment.status_changed', {
        transactionId,
        oldStatus: transaction.status,
        newStatus,
        provider,
        metadata: webhookData
      });

      logger.info('Transaction updated from webhook', {
        transactionId,
        provider,
        oldStatus: transaction.status,
        newStatus
      });

    } catch (error) {
      logger.error('Failed to update transaction from webhook', {
        transactionId,
        provider,
        newStatus,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Verify M-Pesa webhook signature
   *
   * @param {Object} payload - Webhook payload
   * @param {Object} headers - Request headers
   * @returns {boolean} Verification result
   * @private
   */
  static verifyMpesaSignature(payload, headers) {
    try {
      const signature = headers['x-safaricom-signature'];
      const secret = process.env.MPESA_WEBHOOK_SECRET;

      if (!signature || !secret) {
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

    } catch (error) {
      logger.error('M-Pesa signature verification failed', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Handle webhook timeout/failure notifications
   *
   * @param {Object} timeoutData - Timeout notification data
   * @returns {Promise<Object>} Processing result
   */
  static async handleWebhookTimeout(timeoutData) {
    try {
      logger.warn('Webhook timeout received', timeoutData);

      // Find transaction and mark as timeout if still pending
      const { transactionId, checkoutRequestId } = timeoutData;

      let transaction;
      if (transactionId) {
        transaction = await Transaction.findById(transactionId);
      } else if (checkoutRequestId) {
        const paymentDetail = await PaymentDetail.findByProviderTransactionId(checkoutRequestId);
        if (paymentDetail) {
          transaction = await Transaction.findById(paymentDetail.transactionId);
        }
      }

      if (transaction && ['pending', 'initiated'].includes(transaction.status)) {
        await Transaction.update(transaction.id, {
          status: 'timeout',
          metadata: {
            ...transaction.metadata,
            timeout: {
              occurredAt: new Date(),
              data: timeoutData
            }
          },
          updatedAt: new Date()
        });

        // Emit timeout event
        paymentEventEmitter.emit('payment.timeout', {
          transactionId: transaction.id,
          provider: transaction.provider,
          timeoutData
        });

        logger.info('Transaction marked as timeout', {
          transactionId: transaction.id
        });
      }

      return {
        success: true,
        message: 'Timeout processed',
        acknowledged: true
      };

    } catch (error) {
      logger.error('Webhook timeout processing failed', {
        error: error.message,
        timeoutData
      });

      throw error;
    }
  }

  /**
   * Process M-Pesa callback (alias for handleMpesaWebhook)
   *
   * @param {Object} webhookData - Webhook payload
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Processing result
   */
  static async processMpesaCallback(webhookData, context = {}) {
    return WebhookController.handleMpesaWebhook(webhookData, context.headers || {});
  }

  /**
   * Process M-Pesa timeout notification
   *
   * @param {Object} timeoutData - Timeout notification data
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Processing result
   */
  static async processMpesaTimeout(timeoutData, context = {}) {
    return WebhookController.handleWebhookTimeout(timeoutData);
  }

  /**
   * Process Stripe webhook callback
   *
   * @param {Object} webhookData - Webhook payload
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Processing result
   */
  static async processStripeCallback(webhookData, context = {}) {
    return WebhookController.handleProviderWebhook('stripe', webhookData, context.headers || {});
  }

  /**
   * Process test webhook (development only)
   *
   * @param {Object} webhookData - Test webhook data
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Processing result
   */
  static async processTestWebhook(webhookData, context = {}) {
    try {
      logger.info('Test webhook processed', {
        webhookId: context.webhookId,
        data: webhookData,
        ip: context.ip
      });

      return {
        success: true,
        message: 'Test webhook processed successfully',
        echo: webhookData,
        processedAt: new Date().toISOString(),
        context
      };
    } catch (error) {
      logger.error('Test webhook processing failed', {
        error: error.message,
        webhookData
      });

      throw error;
    }
  }

  /**
   * Get webhook health status
   *
   * @returns {Promise<Object>} Health status
   */
  static async getWebhookHealth() {
    try {
      return {
        success: true,
        status: 'healthy',
        endpoints: {
          'mpesa/callback': 'active',
          'mpesa/timeout': 'active',
          'stripe/callback': 'ready',
          'test': process.env.NODE_ENV === 'development' ? 'active' : 'disabled'
        },
        lastProcessed: null,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get webhook health', {
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get webhook processing statistics
   *
   * @returns {Promise<Object>} Webhook statistics
   */
  static async getWebhookStats() {
    try {
      // This would typically query a webhook processing log table
      // For now, return basic stats
      return {
        success: true,
        stats: {
          totalProcessed: 0,
          successfullyProcessed: 0,
          failed: 0,
          lastProcessedAt: null
        }
      };
    } catch (error) {
      logger.error('Failed to get webhook stats', {
        error: error.message
      });

      throw error;
    }
  }
}

module.exports = WebhookController;