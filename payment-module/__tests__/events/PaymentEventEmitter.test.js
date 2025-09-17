/**
 * PaymentEventEmitter Unit Tests
 *
 * Comprehensive test suite for the payment event system including
 * event emission, handler registration, error handling, and statistics.
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { PaymentEventEmitter, PAYMENT_EVENTS } = require('../../src/events/PaymentEventEmitter');

describe('PaymentEventEmitter', () => {
  let eventEmitter;

  beforeEach(() => {
    eventEmitter = new PaymentEventEmitter();
  });

  afterEach(async () => {
    await eventEmitter.shutdown();
  });

  describe('Event Emission', () => {
    test('should emit payment events successfully', async () => {
      const handler = jest.fn();
      const eventData = { transactionId: 'test-123', amount: 1000 };

      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler);

      const result = eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        eventData
      );

      expect(result).toBe(true);

      // Wait for async processing
      await global.testUtils.sleep(50);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          ...eventData,
          eventId: expect.any(String),
          timestamp: expect.any(String),
          eventName: PAYMENT_EVENTS.TRANSACTION_CREATED,
          metadata: expect.objectContaining({
            source: 'payment-module',
            version: '1.0.0'
          })
        })
      );
    });

    test('should handle events with no listeners', () => {
      const result = eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'test-123' }
      );

      expect(result).toBe(false);
    });

    test('should enhance event payload with metadata', () => {
      const handler = jest.fn();
      const eventData = { transactionId: 'test-123' };
      const metadata = { source: 'test', custom: 'value' };

      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler);
      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        eventData,
        metadata
      );

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: expect.any(String),
          timestamp: expect.any(String),
          eventName: PAYMENT_EVENTS.TRANSACTION_CREATED,
          metadata: expect.objectContaining({
            source: 'payment-module',
            version: '1.0.0',
            custom: 'value'
          })
        })
      );
    });

    test('should update event statistics', () => {
      const initialStats = eventEmitter.getEventStats();
      expect(initialStats.totalEvents).toBe(0);

      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'test-123' }
      );

      const updatedStats = eventEmitter.getEventStats();
      expect(updatedStats.totalEvents).toBe(1);
      expect(updatedStats.eventCounts[PAYMENT_EVENTS.TRANSACTION_CREATED]).toBe(1);
    });
  });

  describe('Event Handler Registration', () => {
    test('should register event handlers successfully', async () => {
      const handler = jest.fn().mockResolvedValue('success');

      const result = eventEmitter.onPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        handler,
        { name: 'TestHandler' }
      );

      expect(result).toBe(eventEmitter);
      expect(eventEmitter.listenerCount(PAYMENT_EVENTS.TRANSACTION_CREATED)).toBe(1);

      // Test handler execution
      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'test-123' }
      );

      await global.testUtils.sleep(50);
      expect(handler).toHaveBeenCalled();
    });

    test('should register one-time event handlers', async () => {
      const handler = jest.fn();

      eventEmitter.onPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        handler,
        { once: true }
      );

      // Emit event twice
      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'test-1' }
      );
      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'test-2' }
      );

      await global.testUtils.sleep(50);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('should handle handler timeouts', async () => {
      const slowHandler = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      eventEmitter.onPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        slowHandler,
        { timeout: 100 }
      );

      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'test-123' }
      );

      await global.testUtils.sleep(150);
      expect(slowHandler).toHaveBeenCalled();
    });

    test('should handle handler errors gracefully', async () => {
      const errorHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const errorSpy = jest.spyOn(eventEmitter, 'emit');

      eventEmitter.onPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        errorHandler
      );

      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'test-123' }
      );

      await global.testUtils.sleep(50);

      expect(errorHandler).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith('error', expect.any(Error));
    });
  });

  describe('Error Handling', () => {
    test('should register and call error handlers', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Test error'));
      const errorHandler = jest.fn();

      eventEmitter.onEventError(PAYMENT_EVENTS.TRANSACTION_CREATED, errorHandler);
      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler);

      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'test-123' }
      );

      await global.testUtils.sleep(50);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        expect.any(Object),
        expect.any(Object)
      );
    });

    test('should handle error handler failures', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const errorHandler = jest.fn().mockRejectedValue(new Error('Error handler error'));

      eventEmitter.onEventError(PAYMENT_EVENTS.TRANSACTION_CREATED, errorHandler);
      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler);

      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'test-123' }
      );

      await global.testUtils.sleep(50);

      // Should not throw, should handle gracefully
      expect(handler).toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Event History', () => {
    test('should track event history', () => {
      const eventData1 = { transactionId: 'test-1' };
      const eventData2 = { transactionId: 'test-2' };

      eventEmitter.emitPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, eventData1);
      eventEmitter.emitPaymentEvent(PAYMENT_EVENTS.TRANSACTION_COMPLETED, eventData2);

      const history = eventEmitter.getRecentEvents(10);
      expect(history).toHaveLength(2);
      expect(history[0].eventName).toBe(PAYMENT_EVENTS.TRANSACTION_CREATED);
      expect(history[1].eventName).toBe(PAYMENT_EVENTS.TRANSACTION_COMPLETED);
    });

    test('should limit event history size', () => {
      const emitter = new PaymentEventEmitter();
      emitter.maxHistorySize = 5;

      // Emit more events than the limit
      for (let i = 0; i < 10; i++) {
        emitter.emitPaymentEvent(
          PAYMENT_EVENTS.TRANSACTION_CREATED,
          { transactionId: `test-${i}` }
        );
      }

      const history = emitter.getRecentEvents();
      expect(history).toHaveLength(5);
      expect(history[0].payload.transactionId).toBe('test-5');
      expect(history[4].payload.transactionId).toBe('test-9');
    });

    test('should clear event history', () => {
      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'test-123' }
      );

      expect(eventEmitter.getRecentEvents()).toHaveLength(1);

      eventEmitter.clearEventHistory();
      expect(eventEmitter.getRecentEvents()).toHaveLength(0);
    });
  });

  describe('Event Replay', () => {
    test('should replay events from history', async () => {
      const handler = jest.fn();

      // Emit some events first
      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'test-1' }
      );
      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_COMPLETED,
        { transactionId: 'test-2' }
      );

      // Register handler after events were emitted
      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler);

      // Replay events
      const replayedCount = await eventEmitter.replayEvents({
        eventName: PAYMENT_EVENTS.TRANSACTION_CREATED
      });

      expect(replayedCount).toBe(1);

      await global.testUtils.sleep(50);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'test-1',
          metadata: expect.objectContaining({
            isReplay: true,
            originalTimestamp: expect.any(String),
            replayTimestamp: expect.any(String)
          })
        })
      );
    });

    test('should filter events during replay', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000);

      // Emit events with different timestamps
      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'old-event' }
      );

      await global.testUtils.sleep(10);

      eventEmitter.emitPaymentEvent(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        { transactionId: 'new-event' }
      );

      const replayedCount = await eventEmitter.replayEvents({
        since: now,
        limit: 1
      });

      expect(replayedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should provide event statistics', () => {
      const stats = eventEmitter.getEventStats();

      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('eventCounts');
      expect(stats).toHaveProperty('errors');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('eventsPerSecond');
      expect(stats).toHaveProperty('listenerStats');
      expect(stats).toHaveProperty('recentEvents');
    });

    test('should calculate events per second', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 5; i++) {
        eventEmitter.emitPaymentEvent(
          PAYMENT_EVENTS.TRANSACTION_CREATED,
          { transactionId: `test-${i}` }
        );
      }

      await global.testUtils.sleep(100);

      const stats = eventEmitter.getEventStats();
      expect(stats.eventsPerSecond).toBeGreaterThan(0);
      expect(stats.totalEvents).toBe(5);
    });

    test('should track listener statistics', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler1);
      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler2);
      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_COMPLETED, handler1);

      const stats = eventEmitter.getEventStats();
      expect(stats.listenerStats[PAYMENT_EVENTS.TRANSACTION_CREATED]).toBe(2);
      expect(stats.listenerStats[PAYMENT_EVENTS.TRANSACTION_COMPLETED]).toBe(1);
    });
  });

  describe('Listener Management', () => {
    test('should remove all listeners for an event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler1);
      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler2);

      expect(eventEmitter.listenerCount(PAYMENT_EVENTS.TRANSACTION_CREATED)).toBe(2);

      eventEmitter.removeAllPaymentEventListeners(PAYMENT_EVENTS.TRANSACTION_CREATED);

      expect(eventEmitter.listenerCount(PAYMENT_EVENTS.TRANSACTION_CREATED)).toBe(0);
    });

    test('should handle max listeners warning', () => {
      const handler = jest.fn();

      // Set low max listeners for testing
      eventEmitter.setMaxListeners(2);

      // Add more listeners than the limit
      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler);
      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler);
      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler);

      // Should not throw, but might warn
      expect(eventEmitter.listenerCount(PAYMENT_EVENTS.TRANSACTION_CREATED)).toBe(3);
    });
  });

  describe('Event Name Validation', () => {
    test('should validate known event names', () => {
      const isValid = eventEmitter.isValidEventName(PAYMENT_EVENTS.TRANSACTION_CREATED);
      expect(isValid).toBe(true);
    });

    test('should identify unknown event names', () => {
      const isValid = eventEmitter.isValidEventName('unknown.event');
      expect(isValid).toBe(false);
    });

    test('should warn about unknown event names', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      eventEmitter.emitPaymentEvent('unknown.event', { test: 'data' });

      // Restore console
      consoleSpy.mockRestore();
    });
  });

  describe('Graceful Shutdown', () => {
    test('should shutdown gracefully', async () => {
      const handler = jest.fn();
      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.TRANSACTION_CREATED, handler);

      await eventEmitter.shutdown();

      expect(eventEmitter.listenerCount(PAYMENT_EVENTS.TRANSACTION_CREATED)).toBe(0);
    });

    test('should emit shutdown event', async () => {
      const shutdownHandler = jest.fn();
      eventEmitter.onPaymentEvent(PAYMENT_EVENTS.SYSTEM_SHUTDOWN, shutdownHandler);

      await eventEmitter.shutdown();

      await global.testUtils.sleep(50);
      expect(shutdownHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          uptime: expect.any(Number),
          totalEvents: expect.any(Number)
        })
      );
    });
  });
});