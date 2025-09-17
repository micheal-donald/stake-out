/**
 * Payment Event Emitter
 *
 * Centralized event system for payment processing events.
 * Provides type-safe event emission and handling with comprehensive
 * logging and error handling capabilities.
 *
 * Key Features:
 * - Type-safe event definitions
 * - Async event handler support
 * - Event history and analytics
 * - Error handling for event listeners
 * - Performance monitoring
 * - Event replay capabilities
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { EventEmitter } = require('events');
const logger = require('../utils/logger');
const PaymentError = require('../errors/PaymentError');

/**
 * Payment event types with their data schemas
 */
const PAYMENT_EVENTS = {
  // Transaction events
  TRANSACTION_CREATED: 'transaction.created',
  TRANSACTION_UPDATED: 'transaction.updated',
  TRANSACTION_STATUS_CHANGED: 'transaction.status_changed',
  TRANSACTION_COMPLETED: 'transaction.completed',
  TRANSACTION_FAILED: 'transaction.failed',
  TRANSACTION_CANCELLED: 'transaction.cancelled',
  TRANSACTION_TIMEOUT: 'transaction.timeout',

  // Payment events
  PAYMENT_INITIATED: 'payment.initiated',
  PAYMENT_PROCESSING: 'payment.processing',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',

  // Webhook events
  WEBHOOK_RECEIVED: 'webhook.received',
  WEBHOOK_PROCESSED: 'webhook.processed',
  WEBHOOK_FAILED: 'webhook.failed',

  // Provider events
  PROVIDER_INITIALIZED: 'provider.initialized',
  PROVIDER_ERROR: 'provider.error',
  PROVIDER_UNAVAILABLE: 'provider.unavailable',

  // System events
  SYSTEM_STARTUP: 'system.startup',
  SYSTEM_SHUTDOWN: 'system.shutdown',
  SYSTEM_ERROR: 'system.error',
  SYSTEM_HEALTH_CHECK: 'system.health_check'
};

/**
 * Enhanced EventEmitter for payment system
 */
class PaymentEventEmitter extends EventEmitter {
  constructor() {
    super();

    // Increase max listeners for high-throughput scenarios
    this.setMaxListeners(50);

    // Event statistics
    this.stats = {
      totalEvents: 0,
      eventCounts: {},
      errors: 0,
      startTime: Date.now()
    };

    // Event history (keep last 1000 events)
    this.eventHistory = [];
    this.maxHistorySize = 1000;

    // Error tracking
    this.errorHandlers = new Map();

    // Setup internal event tracking
    this.setupInternalTracking();
  }

  /**
   * Setup internal event tracking and error handling
   *
   * @private
   */
  setupInternalTracking() {
    // Track all events
    this.on('newListener', (eventName, listener) => {
      logger.debug('New event listener registered', {
        event: eventName,
        listenerCount: this.listenerCount(eventName) + 1
      });
    });

    // Track listener removal
    this.on('removeListener', (eventName, listener) => {
      logger.debug('Event listener removed', {
        event: eventName,
        listenerCount: this.listenerCount(eventName) - 1
      });
    });

    // Handle errors in event listeners
    this.on('error', (error) => {
      this.stats.errors++;

      logger.error('Event system error', {
        error: error.message,
        stack: error.stack,
        totalErrors: this.stats.errors
      });
    });
  }

  /**
   * Emit a payment event with enhanced error handling and logging
   *
   * @param {string} eventName - Event name (use PAYMENT_EVENTS constants)
   * @param {Object} eventData - Event payload
   * @param {Object} [metadata] - Additional metadata
   * @returns {boolean} True if event was emitted successfully
   */
  emitPaymentEvent(eventName, eventData, metadata = {}) {
    try {
      // Validate event name
      if (!this.isValidEventName(eventName)) {
        logger.warn('Unknown payment event type', {
          eventName,
          validEvents: Object.values(PAYMENT_EVENTS)
        });
      }

      // Create enhanced event payload
      const enhancedPayload = {
        ...eventData,
        eventId: require('crypto').randomUUID(),
        timestamp: new Date().toISOString(),
        eventName,
        metadata: {
          source: 'payment-module',
          version: '1.0.0',
          ...metadata
        }
      };

      // Update statistics
      this.updateEventStats(eventName);

      // Add to event history
      this.addToHistory(eventName, enhancedPayload);

      // Log event emission
      logger.debug('Payment event emitted', {
        eventName,
        eventId: enhancedPayload.eventId,
        hasData: !!eventData,
        listenerCount: this.listenerCount(eventName)
      });

      // Emit the event
      const emitted = this.emit(eventName, enhancedPayload);

      // Log if no listeners
      if (!emitted) {
        logger.debug('Payment event emitted with no listeners', {
          eventName,
          eventId: enhancedPayload.eventId
        });
      }

      return emitted;

    } catch (error) {
      logger.error('Failed to emit payment event', {
        eventName,
        error: error.message,
        stack: error.stack
      });

      // Emit error event
      this.emit('error', new PaymentError(
        `Failed to emit event: ${eventName}`,
        'EVENT_ERROR',
        'EVENT_EMISSION_FAILED',
        { eventName, originalError: error.message }
      ));

      return false;
    }
  }

  /**
   * Register an async event handler with error handling
   *
   * @param {string} eventName - Event name
   * @param {Function} handler - Async event handler
   * @param {Object} [options] - Handler options
   * @param {string} [options.name] - Handler name for debugging
   * @param {number} [options.timeout] - Handler timeout in milliseconds
   * @param {boolean} [options.once] - Register as one-time handler
   * @returns {PaymentEventEmitter} This instance for chaining
   */
  onPaymentEvent(eventName, handler, options = {}) {
    const { name, timeout = 30000, once = false } = options;

    // Wrap handler with error handling and timeout
    const wrappedHandler = async (eventData) => {
      const handlerContext = {
        eventName,
        eventId: eventData.eventId,
        handlerName: name || handler.name || 'anonymous',
        timestamp: new Date().toISOString()
      };

      logger.debug('Processing payment event', handlerContext);

      try {
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Event handler timeout after ${timeout}ms`));
          }, timeout);
        });

        // Race between handler execution and timeout
        const result = await Promise.race([
          Promise.resolve(handler(eventData)),
          timeoutPromise
        ]);

        logger.debug('Payment event processed successfully', {
          ...handlerContext,
          result: result ? 'returned_value' : 'no_return_value'
        });

        return result;

      } catch (error) {
        logger.error('Payment event handler failed', {
          ...handlerContext,
          error: error.message,
          stack: error.stack
        });

        // Call registered error handler if available
        const errorHandler = this.errorHandlers.get(eventName);
        if (errorHandler) {
          try {
            await errorHandler(error, eventData, handlerContext);
          } catch (errorHandlerError) {
            logger.error('Event error handler failed', {
              ...handlerContext,
              errorHandlerError: errorHandlerError.message
            });
          }
        }

        // Don't re-throw to prevent breaking other event handlers
        // but emit error event for system monitoring
        this.emit('error', new PaymentError(
          `Event handler failed: ${error.message}`,
          'EVENT_HANDLER_ERROR',
          'HANDLER_EXECUTION_FAILED',
          { ...handlerContext, originalError: error.message }
        ));
      }
    };

    // Register the wrapped handler
    if (once) {
      this.once(eventName, wrappedHandler);
    } else {
      this.on(eventName, wrappedHandler);
    }

    logger.debug('Payment event handler registered', {
      eventName,
      handlerName: name || 'anonymous',
      once,
      timeout,
      listenerCount: this.listenerCount(eventName)
    });

    return this;
  }

  /**
   * Register error handler for specific event type
   *
   * @param {string} eventName - Event name
   * @param {Function} errorHandler - Error handler function
   * @returns {PaymentEventEmitter} This instance for chaining
   */
  onEventError(eventName, errorHandler) {
    this.errorHandlers.set(eventName, errorHandler);

    logger.debug('Event error handler registered', {
      eventName,
      handlerName: errorHandler.name || 'anonymous'
    });

    return this;
  }

  /**
   * Remove all listeners for a specific event
   *
   * @param {string} eventName - Event name
   * @returns {PaymentEventEmitter} This instance for chaining
   */
  removeAllPaymentEventListeners(eventName) {
    const listenerCount = this.listenerCount(eventName);
    this.removeAllListeners(eventName);

    logger.info('All payment event listeners removed', {
      eventName,
      removedCount: listenerCount
    });

    return this;
  }

  /**
   * Get event statistics
   *
   * @returns {Object} Event statistics
   */
  getEventStats() {
    const uptime = Date.now() - this.stats.startTime;

    return {
      ...this.stats,
      uptime,
      eventsPerSecond: this.stats.totalEvents / (uptime / 1000),
      listenerStats: this.getListenerStats(),
      recentEvents: this.getRecentEvents(10)
    };
  }

  /**
   * Get listener statistics for all events
   *
   * @private
   * @returns {Object} Listener statistics
   */
  getListenerStats() {
    const stats = {};
    const eventNames = this.eventNames();

    for (const eventName of eventNames) {
      stats[eventName] = this.listenerCount(eventName);
    }

    return stats;
  }

  /**
   * Get recent events from history
   *
   * @param {number} count - Number of recent events to return
   * @returns {Array} Recent events
   */
  getRecentEvents(count = 100) {
    return this.eventHistory.slice(-count);
  }

  /**
   * Clear event history
   *
   * @returns {PaymentEventEmitter} This instance for chaining
   */
  clearEventHistory() {
    const clearedCount = this.eventHistory.length;
    this.eventHistory = [];

    logger.info('Event history cleared', { clearedCount });
    return this;
  }

  /**
   * Replay events from history
   *
   * @param {Object} [filters] - Event filters
   * @param {string} [filters.eventName] - Filter by event name
   * @param {Date} [filters.since] - Filter events since timestamp
   * @param {number} [filters.limit] - Limit number of events
   * @returns {Promise<number>} Number of events replayed
   */
  async replayEvents(filters = {}) {
    let events = this.eventHistory;

    // Apply filters
    if (filters.eventName) {
      events = events.filter(event => event.eventName === filters.eventName);
    }

    if (filters.since) {
      events = events.filter(event =>
        new Date(event.timestamp) >= filters.since
      );
    }

    if (filters.limit) {
      events = events.slice(-filters.limit);
    }

    logger.info('Starting event replay', {
      totalEvents: events.length,
      filters
    });

    let replayedCount = 0;

    for (const event of events) {
      try {
        // Create replay event with special metadata
        const replayEvent = {
          ...event.payload,
          metadata: {
            ...event.payload.metadata,
            isReplay: true,
            originalTimestamp: event.timestamp,
            replayTimestamp: new Date().toISOString()
          }
        };

        this.emit(event.eventName, replayEvent);
        replayedCount++;

      } catch (error) {
        logger.error('Failed to replay event', {
          eventName: event.eventName,
          eventId: event.payload.eventId,
          error: error.message
        });
      }
    }

    logger.info('Event replay completed', {
      replayedCount,
      totalEvents: events.length
    });

    return replayedCount;
  }

  /**
   * Validate event name against known event types
   *
   * @private
   * @param {string} eventName - Event name to validate
   * @returns {boolean} True if valid event name
   */
  isValidEventName(eventName) {
    return Object.values(PAYMENT_EVENTS).includes(eventName);
  }

  /**
   * Update event statistics
   *
   * @private
   * @param {string} eventName - Event name
   */
  updateEventStats(eventName) {
    this.stats.totalEvents++;
    this.stats.eventCounts[eventName] = (this.stats.eventCounts[eventName] || 0) + 1;
  }

  /**
   * Add event to history
   *
   * @private
   * @param {string} eventName - Event name
   * @param {Object} payload - Event payload
   */
  addToHistory(eventName, payload) {
    const historyEntry = {
      eventName,
      timestamp: payload.timestamp,
      payload: { ...payload }
    };

    this.eventHistory.push(historyEntry);

    // Maintain history size limit
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Shutdown event system gracefully
   *
   * @async
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info('Shutting down payment event system', {
      totalEvents: this.stats.totalEvents,
      listenerCount: this.getListenerStats()
    });

    // Emit shutdown event
    this.emitPaymentEvent(PAYMENT_EVENTS.SYSTEM_SHUTDOWN, {
      uptime: Date.now() - this.stats.startTime,
      totalEvents: this.stats.totalEvents
    });

    // Wait a moment for final events to process
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Remove all listeners
    this.removeAllListeners();

    logger.info('Payment event system shutdown complete');
  }
}

// Create singleton instance
const paymentEvents = new PaymentEventEmitter();

// Export both the class and singleton instance
module.exports = {
  PaymentEventEmitter,
  paymentEvents,
  PAYMENT_EVENTS
};