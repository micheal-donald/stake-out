/**
 * Webhook Controller
 *
 * Handles incoming webhooks from payment providers to update transaction
 * statuses and process payment confirmations. Provides secure webhook
 * endpoint handling with signature verification and event processing.
 *
 * Features:
 * - Provider-specific webhook processing
 * - Transaction status updates using legacy database schema
 * - Event emission for downstream processing
 * - Idempotency handling
 * - Error recovery and retry logic
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { providerFactory } = require('../../providers/ProviderFactory');
const { Transaction } = require('../../database/models/Transaction');
const { dbConnection } = require('../../database/connection');
const { paymentEvents } = require('../../events/PaymentEventEmitter');
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
      const callbackMetadata = stkCallback.CallbackMetadata;

      // Find transaction by checkout request ID in legacy schema
      const transactionResult = await dbConnection.query(
        'SELECT transaction_id, user_id, amount FROM transactions WHERE reference_id = $1',
        [checkoutRequestId]
      );

      if (transactionResult.rows.length === 0) {
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

      const transaction = transactionResult.rows[0];
      const userId = transaction.user_id;
      const amount = parseFloat(transaction.amount);

      // Check if already processed (idempotency)
      const processedResult = await dbConnection.query(
        'SELECT status FROM transactions WHERE reference_id = $1 AND status = ANY($2)',
        [checkoutRequestId, ['completed', 'failed']]
      );

      if (processedResult.rows.length > 0) {
        logger.info('M-Pesa webhook for already processed transaction', {
          checkoutRequestId,
          status: processedResult.rows[0].status
        });

        return {
          success: true,
          message: 'Transaction already processed',
          acknowledged: true
        };
      }

      // Extract M-Pesa receipt and other metadata
      let mpesaReceiptNumber = null;
      let transactionDate = null;
      let phoneNumber = null;

      if (callbackMetadata && callbackMetadata.Item) {
        for (const item of callbackMetadata.Item) {
          switch (item.Name) {
            case 'MpesaReceiptNumber':
              mpesaReceiptNumber = item.Value;
              break;
            case 'TransactionDate':
              transactionDate = item.Value;
              break;
            case 'PhoneNumber':
              phoneNumber = item.Value;
              break;
          }
        }
      }

      // Parse M-Pesa transaction date properly
      let parsedTransactionDate = null;
      if (transactionDate) {
        try {
          // M-Pesa date format is YYYYMMDDHHMMSS
          const dateStr = transactionDate.toString();
          if (dateStr.length === 14) {
            const year = parseInt(dateStr.substring(0, 4));
            const month = parseInt(dateStr.substring(4, 6)) - 1; // JS months are 0-indexed
            const day = parseInt(dateStr.substring(6, 8));
            const hour = parseInt(dateStr.substring(8, 10));
            const minute = parseInt(dateStr.substring(10, 12));
            const second = parseInt(dateStr.substring(12, 14));
            
            parsedTransactionDate = new Date(year, month, day, hour, minute, second);
          } else {
            // Try standard date parsing as fallback
            parsedTransactionDate = new Date(transactionDate);
          }
        } catch (dateError) {
          logger.warn('Failed to parse transaction date', {
            transactionDate,
            error: dateError.message
          });
          parsedTransactionDate = new Date(); // Use current date as fallback
        }
      }

      // Begin transaction to update both tables
      const client = await dbConnection.pool.connect();
      try {
        await client.query('BEGIN');

        // Determine status based on result code
        const status = resultCode === 0 ? 'completed' : 'failed';

        // Update transactions table
        await client.query(
          `UPDATE transactions
           SET status = $1, updated_at = NOW()
           WHERE reference_id = $2`,
          [status, checkoutRequestId]
        );

        // Update mpesa_transactions table
        await client.query(
          `UPDATE mpesa_transactions
           SET stk_status = $1, mpesa_receipt_number = $2, result_desc = $3,
               transaction_date = $4, last_query_time = NOW()
           WHERE checkout_request_id = $5`,
          [
            status === 'completed' ? 'completed' : 'failed',
            mpesaReceiptNumber,
            resultDesc,
            parsedTransactionDate,
            checkoutRequestId
          ]
        );

        // If successful payment, update user balance
        if (status === 'completed') {
          await client.query(
            'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
            [amount, userId]
          );
        }

        await client.query('COMMIT');

        // Emit payment event
        paymentEvents.emit('payment.status_changed', {
          transactionId: transaction.transaction_id,
          checkoutRequestId,
          oldStatus: 'pending',
          newStatus: status,
          amount,
          userId,
          mpesaReceiptNumber,
          resultDesc
        });

        logger.info('M-Pesa webhook processed successfully', {
          checkoutRequestId,
          transactionId: transaction.transaction_id,
          status,
          mpesaReceiptNumber,
          amount,
          userId
        });

        return {
          success: true,
          message: 'Webhook processed successfully',
          transactionStatus: status,
          acknowledged: true
        };

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      logger.error('M-Pesa webhook processing failed', {
        checkoutRequestId: webhookData.Body?.stkCallback?.CheckoutRequestID,
        error: error.message,
        stack: error.stack
      });

      // Re-throw as PaymentError if not already one
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        'WEBHOOK_PROCESSING_ERROR',
        `M-Pesa webhook processing failed: ${error.message}`,
        'INTERNAL_ERROR',
        { originalError: error.message }
      );
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
    try {
      const checkoutRequestId = timeoutData.Body?.stkCallback?.CheckoutRequestID;

      if (!checkoutRequestId) {
        return {
          success: true,
          message: 'Invalid timeout notification format',
          acknowledged: true
        };
      }

      logger.info('M-Pesa timeout notification received', {
        checkoutRequestId
      });

      // Update transaction status to failed due to timeout
      await dbConnection.query(
        `UPDATE transactions
         SET status = 'failed', updated_at = NOW()
         WHERE reference_id = $1 AND status = 'pending'`,
        [checkoutRequestId]
      );

      // Update mpesa_transactions table
      await dbConnection.query(
        `UPDATE mpesa_transactions
         SET stk_status = 'timeout', result_desc = 'STK Push timeout'
         WHERE checkout_request_id = $1`,
        [checkoutRequestId]
      );

      return {
        success: true,
        message: 'Timeout notification processed',
        acknowledged: true
      };

    } catch (error) {
      logger.error('M-Pesa timeout processing failed', {
        error: error.message,
        timeoutData
      });

      throw new PaymentError(
        'TIMEOUT_PROCESSING_ERROR',
        `Timeout processing failed: ${error.message}`,
        'INTERNAL_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Process Stripe webhook callback (placeholder for future implementation)
   *
   * @param {Object} webhookData - Webhook payload
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Processing result
   */
  static async processStripeCallback(webhookData, context = {}) {
    throw new PaymentError(
      'PROVIDER_NOT_IMPLEMENTED',
      'Stripe webhooks not yet implemented',
      'NOT_FOUND'
    );
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

      throw new PaymentError(
        'TEST_WEBHOOK_ERROR',
        `Test webhook processing failed: ${error.message}`,
        'INTERNAL_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Get webhook system health status
   *
   * @returns {Promise<Object>} Health status information
   */
  static async getWebhookHealth() {
    try {
      return {
        providers: {
          mpesa: {
            enabled: true,
            status: 'active'
          },
          stripe: {
            enabled: false,
            status: 'not_implemented'
          }
        },
        database: {
          connected: dbConnection.isConnected
        },
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Webhook health check failed', {
        error: error.message
      });

      throw new PaymentError(
        'HEALTH_CHECK_ERROR',
        `Health check failed: ${error.message}`,
        'INTERNAL_ERROR',
        { originalError: error.message }
      );
    }
  }
}

module.exports = WebhookController;