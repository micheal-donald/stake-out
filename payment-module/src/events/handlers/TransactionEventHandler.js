/**
 * Transaction Event Handler
 *
 * Handles transaction-related events for business logic processing,
 * notifications, analytics, and system integrations.
 *
 * Key Features:
 * - Transaction lifecycle event processing
 * - Status change notifications
 * - Analytics event tracking
 * - External system notifications
 * - Audit trail maintenance
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { paymentEvents, PAYMENT_EVENTS } = require('../PaymentEventEmitter');
const { Transaction } = require('../../database/models/Transaction');
const { PaymentDetail } = require('../../database/models/PaymentDetail');
const logger = require('../../utils/logger');

/**
 * Transaction Event Handler Class
 */
class TransactionEventHandler {
  constructor() {
    this.isInitialized = false;
    this.notificationQueue = [];
    this.analyticsBuffer = [];

    // Initialize event listeners
    this.initializeEventListeners();
  }

  /**
   * Initialize all transaction event listeners
   *
   * @private
   */
  initializeEventListeners() {
    // Transaction created event
    paymentEvents.onPaymentEvent(
      PAYMENT_EVENTS.TRANSACTION_CREATED,
      this.handleTransactionCreated.bind(this),
      { name: 'TransactionCreatedHandler', timeout: 10000 }
    );

    // Transaction status changed event
    paymentEvents.onPaymentEvent(
      PAYMENT_EVENTS.TRANSACTION_STATUS_CHANGED,
      this.handleTransactionStatusChanged.bind(this),
      { name: 'TransactionStatusChangedHandler', timeout: 15000 }
    );

    // Transaction completed event
    paymentEvents.onPaymentEvent(
      PAYMENT_EVENTS.TRANSACTION_COMPLETED,
      this.handleTransactionCompleted.bind(this),
      { name: 'TransactionCompletedHandler', timeout: 20000 }
    );

    // Transaction failed event
    paymentEvents.onPaymentEvent(
      PAYMENT_EVENTS.TRANSACTION_FAILED,
      this.handleTransactionFailed.bind(this),
      { name: 'TransactionFailedHandler', timeout: 15000 }
    );

    // Transaction timeout event
    paymentEvents.onPaymentEvent(
      PAYMENT_EVENTS.TRANSACTION_TIMEOUT,
      this.handleTransactionTimeout.bind(this),
      { name: 'TransactionTimeoutHandler', timeout: 10000 }
    );

    // Register error handlers
    paymentEvents.onEventError(
      PAYMENT_EVENTS.TRANSACTION_STATUS_CHANGED,
      this.handleEventError.bind(this)
    );

    this.isInitialized = true;

    logger.info('Transaction event handler initialized', {
      registeredEvents: [
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        PAYMENT_EVENTS.TRANSACTION_STATUS_CHANGED,
        PAYMENT_EVENTS.TRANSACTION_COMPLETED,
        PAYMENT_EVENTS.TRANSACTION_FAILED,
        PAYMENT_EVENTS.TRANSACTION_TIMEOUT
      ]
    });
  }

  /**
   * Handle transaction created event
   *
   * @async
   * @param {Object} eventData - Event payload
   */
  async handleTransactionCreated(eventData) {
    const { transactionId, userId, amount, currency, provider } = eventData;

    logger.info('Processing transaction created event', {
      eventId: eventData.eventId,
      transactionId,
      userId,
      amount,
      currency,
      provider
    });

    try {
      // Update analytics
      await this.trackTransactionAnalytics('created', eventData);

      // Send notification to user (if needed)
      await this.queueUserNotification(userId, {
        type: 'transaction_initiated',
        title: 'Payment Initiated',
        message: `Your payment of ${currency} ${amount} has been initiated via ${provider}`,
        transactionId,
        metadata: {
          amount,
          currency,
          provider,
          timestamp: eventData.timestamp
        }
      });

      // Log for audit trail
      logger.info('Transaction creation processed', {
        eventId: eventData.eventId,
        transactionId,
        processed: true
      });

    } catch (error) {
      logger.error('Failed to process transaction created event', {
        eventId: eventData.eventId,
        transactionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle transaction status changed event
   *
   * @async
   * @param {Object} eventData - Event payload
   */
  async handleTransactionStatusChanged(eventData) {
    const {
      transactionId,
      oldStatus,
      newStatus,
      userId,
      amount,
      currency,
      provider
    } = eventData;

    logger.info('Processing transaction status changed event', {
      eventId: eventData.eventId,
      transactionId,
      oldStatus,
      newStatus,
      userId
    });

    try {
      // Update analytics
      await this.trackTransactionAnalytics('status_changed', eventData);

      // Handle specific status transitions
      switch (newStatus) {
        case 'pending':
          await this.handlePendingStatus(eventData);
          break;

        case 'completed':
          // Let the specific completion handler manage this
          paymentEvents.emitPaymentEvent(
            PAYMENT_EVENTS.TRANSACTION_COMPLETED,
            eventData
          );
          break;

        case 'failed':
          // Let the specific failure handler manage this
          paymentEvents.emitPaymentEvent(
            PAYMENT_EVENTS.TRANSACTION_FAILED,
            eventData
          );
          break;

        case 'timeout':
          // Let the specific timeout handler manage this
          paymentEvents.emitPaymentEvent(
            PAYMENT_EVENTS.TRANSACTION_TIMEOUT,
            eventData
          );
          break;

        case 'cancelled':
          await this.handleCancelledStatus(eventData);
          break;
      }

      // Send status update notification
      await this.queueUserNotification(userId, {
        type: 'transaction_status_update',
        title: 'Payment Status Update',
        message: this.getStatusUpdateMessage(newStatus, amount, currency),
        transactionId,
        metadata: {
          oldStatus,
          newStatus,
          amount,
          currency,
          provider,
          timestamp: eventData.timestamp
        }
      });

      logger.info('Transaction status change processed', {
        eventId: eventData.eventId,
        transactionId,
        statusTransition: `${oldStatus} -> ${newStatus}`,
        processed: true
      });

    } catch (error) {
      logger.error('Failed to process transaction status changed event', {
        eventId: eventData.eventId,
        transactionId,
        oldStatus,
        newStatus,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle transaction completed event
   *
   * @async
   * @param {Object} eventData - Event payload
   */
  async handleTransactionCompleted(eventData) {
    const {
      transactionId,
      userId,
      amount,
      currency,
      provider,
      receiptNumber
    } = eventData;

    logger.info('Processing transaction completed event', {
      eventId: eventData.eventId,
      transactionId,
      userId,
      amount,
      currency,
      receiptNumber
    });

    try {
      // Update analytics
      await this.trackTransactionAnalytics('completed', eventData);

      // Send success notification
      await this.queueUserNotification(userId, {
        type: 'transaction_completed',
        title: 'Payment Successful',
        message: `Your payment of ${currency} ${amount} has been completed successfully`,
        transactionId,
        metadata: {
          amount,
          currency,
          provider,
          receiptNumber,
          timestamp: eventData.timestamp
        }
      });

      // Trigger any post-completion processes
      await this.handlePostCompletion(eventData);

      logger.info('Transaction completion processed', {
        eventId: eventData.eventId,
        transactionId,
        processed: true
      });

    } catch (error) {
      logger.error('Failed to process transaction completed event', {
        eventId: eventData.eventId,
        transactionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle transaction failed event
   *
   * @async
   * @param {Object} eventData - Event payload
   */
  async handleTransactionFailed(eventData) {
    const {
      transactionId,
      userId,
      amount,
      currency,
      provider,
      failureReason,
      canRetry
    } = eventData;

    logger.info('Processing transaction failed event', {
      eventId: eventData.eventId,
      transactionId,
      userId,
      failureReason,
      canRetry
    });

    try {
      // Update analytics
      await this.trackTransactionAnalytics('failed', eventData);

      // Send failure notification
      await this.queueUserNotification(userId, {
        type: 'transaction_failed',
        title: 'Payment Failed',
        message: this.getFailureMessage(failureReason, canRetry),
        transactionId,
        metadata: {
          amount,
          currency,
          provider,
          failureReason,
          canRetry,
          timestamp: eventData.timestamp
        }
      });

      // Handle retry logic if applicable
      if (canRetry && eventData.retryCount < 3) {
        await this.scheduleRetry(eventData);
      }

      logger.info('Transaction failure processed', {
        eventId: eventData.eventId,
        transactionId,
        failureReason,
        processed: true
      });

    } catch (error) {
      logger.error('Failed to process transaction failed event', {
        eventId: eventData.eventId,
        transactionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle transaction timeout event
   *
   * @async
   * @param {Object} eventData - Event payload
   */
  async handleTransactionTimeout(eventData) {
    const { transactionId, userId, amount, currency, provider } = eventData;

    logger.info('Processing transaction timeout event', {
      eventId: eventData.eventId,
      transactionId,
      userId
    });

    try {
      // Update analytics
      await this.trackTransactionAnalytics('timeout', eventData);

      // Send timeout notification
      await this.queueUserNotification(userId, {
        type: 'transaction_timeout',
        title: 'Payment Timeout',
        message: `Your payment of ${currency} ${amount} has timed out and was cancelled`,
        transactionId,
        metadata: {
          amount,
          currency,
          provider,
          timestamp: eventData.timestamp
        }
      });

      logger.info('Transaction timeout processed', {
        eventId: eventData.eventId,
        transactionId,
        processed: true
      });

    } catch (error) {
      logger.error('Failed to process transaction timeout event', {
        eventId: eventData.eventId,
        transactionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle pending status
   *
   * @async
   * @param {Object} eventData - Event payload
   * @private
   */
  async handlePendingStatus(eventData) {
    const { transactionId, userId } = eventData;

    // Could trigger additional monitoring or checks here
    logger.debug('Transaction moved to pending status', {
      transactionId,
      userId,
      eventId: eventData.eventId
    });
  }

  /**
   * Handle cancelled status
   *
   * @async
   * @param {Object} eventData - Event payload
   * @private
   */
  async handleCancelledStatus(eventData) {
    const { transactionId, userId, amount, currency } = eventData;

    await this.queueUserNotification(userId, {
      type: 'transaction_cancelled',
      title: 'Payment Cancelled',
      message: `Your payment of ${currency} ${amount} has been cancelled`,
      transactionId,
      metadata: eventData
    });
  }

  /**
   * Handle post-completion processes
   *
   * @async
   * @param {Object} eventData - Event payload
   * @private
   */
  async handlePostCompletion(eventData) {
    // This could trigger:
    // - Balance updates in main application
    // - Receipt generation
    // - Integration with external systems
    // - Reward point calculations
    // etc.

    logger.debug('Post-completion processing triggered', {
      transactionId: eventData.transactionId,
      eventId: eventData.eventId
    });
  }

  /**
   * Schedule transaction retry
   *
   * @async
   * @param {Object} eventData - Event payload
   * @private
   */
  async scheduleRetry(eventData) {
    // This would typically integrate with a job queue system
    // For now, we'll just log the retry intention

    logger.info('Transaction retry scheduled', {
      transactionId: eventData.transactionId,
      retryCount: (eventData.retryCount || 0) + 1,
      eventId: eventData.eventId
    });
  }

  /**
   * Track transaction analytics
   *
   * @async
   * @param {string} eventType - Type of analytics event
   * @param {Object} eventData - Event payload
   * @private
   */
  async trackTransactionAnalytics(eventType, eventData) {
    const analyticsData = {
      eventType,
      transactionId: eventData.transactionId,
      userId: eventData.userId,
      amount: eventData.amount,
      currency: eventData.currency,
      provider: eventData.provider,
      timestamp: eventData.timestamp,
      eventId: eventData.eventId
    };

    this.analyticsBuffer.push(analyticsData);

    // In a real implementation, this would send to an analytics service
    logger.debug('Transaction analytics tracked', {
      eventType,
      transactionId: eventData.transactionId,
      bufferSize: this.analyticsBuffer.length
    });
  }

  /**
   * Queue user notification
   *
   * @async
   * @param {string} userId - User ID
   * @param {Object} notification - Notification data
   * @private
   */
  async queueUserNotification(userId, notification) {
    const notificationData = {
      userId,
      ...notification,
      queuedAt: new Date().toISOString(),
      id: require('crypto').randomUUID()
    };

    this.notificationQueue.push(notificationData);

    // In a real implementation, this would use a proper queue system
    logger.debug('User notification queued', {
      userId,
      type: notification.type,
      transactionId: notification.transactionId,
      queueSize: this.notificationQueue.length
    });
  }

  /**
   * Get status update message
   *
   * @param {string} status - Transaction status
   * @param {number} amount - Transaction amount
   * @param {string} currency - Transaction currency
   * @returns {string} Status message
   * @private
   */
  getStatusUpdateMessage(status, amount, currency) {
    const messages = {
      pending: `Your payment of ${currency} ${amount} is being processed`,
      completed: `Your payment of ${currency} ${amount} has been completed successfully`,
      failed: `Your payment of ${currency} ${amount} has failed`,
      cancelled: `Your payment of ${currency} ${amount} has been cancelled`,
      timeout: `Your payment of ${currency} ${amount} has timed out`
    };

    return messages[status] || `Your payment status has been updated to: ${status}`;
  }

  /**
   * Get failure message
   *
   * @param {string} failureReason - Failure reason
   * @param {boolean} canRetry - Whether retry is possible
   * @returns {string} Failure message
   * @private
   */
  getFailureMessage(failureReason, canRetry) {
    let message = `Payment failed: ${failureReason || 'Unknown error'}`;

    if (canRetry) {
      message += '. You can try again.';
    }

    return message;
  }

  /**
   * Handle event processing errors
   *
   * @async
   * @param {Error} error - The error that occurred
   * @param {Object} eventData - Event data that caused the error
   * @param {Object} handlerContext - Handler context information
   * @private
   */
  async handleEventError(error, eventData, handlerContext) {
    logger.error('Transaction event handler error', {
      error: error.message,
      eventId: eventData.eventId,
      transactionId: eventData.transactionId,
      handlerName: handlerContext.handlerName,
      stack: error.stack
    });

    // Could implement error recovery logic here
    // For example, queuing failed events for retry
  }

  /**
   * Get handler statistics
   *
   * @returns {Object} Handler statistics
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      notificationQueueSize: this.notificationQueue.length,
      analyticsBufferSize: this.analyticsBuffer.length,
      registeredEvents: 5
    };
  }

  /**
   * Process queued notifications (would typically run on a schedule)
   *
   * @async
   * @param {number} [batchSize=10] - Number of notifications to process
   * @returns {Promise<number>} Number of notifications processed
   */
  async processNotificationQueue(batchSize = 10) {
    const batch = this.notificationQueue.splice(0, batchSize);

    for (const notification of batch) {
      try {
        // Process notification (send email, SMS, push notification, etc.)
        logger.debug('Processing notification', {
          id: notification.id,
          userId: notification.userId,
          type: notification.type
        });

        // Simulate notification processing
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        logger.error('Failed to process notification', {
          id: notification.id,
          error: error.message
        });

        // Could re-queue failed notifications
      }
    }

    return batch.length;
  }

  /**
   * Flush analytics buffer (would typically run on a schedule)
   *
   * @async
   * @returns {Promise<number>} Number of analytics events flushed
   */
  async flushAnalyticsBuffer() {
    const events = this.analyticsBuffer.splice(0);

    if (events.length > 0) {
      logger.debug('Flushing analytics buffer', {
        eventCount: events.length
      });

      // Send to analytics service
      // In a real implementation, this would batch send to analytics platform
    }

    return events.length;
  }
}

// Create and export singleton instance
const transactionEventHandler = new TransactionEventHandler();

module.exports = {
  TransactionEventHandler,
  transactionEventHandler
};