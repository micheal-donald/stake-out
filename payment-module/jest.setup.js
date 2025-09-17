/**
 * Jest Test Setup Configuration
 *
 * Global test configuration and setup for the payment module test suite.
 * This file is executed before all test files and provides common
 * utilities, mocks, and environment setup.
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { dbConnection } = require('./src/database/connection');
const { paymentEvents } = require('./src/events/PaymentEventEmitter');
const logger = require('./src/utils/logger');

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/payment_test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Global test utilities
global.testUtils = {
  /**
   * Create a test transaction data object
   *
   * @param {Object} overrides - Properties to override
   * @returns {Object} Test transaction data
   */
  createTestTransaction: (overrides = {}) => {
    return {
      userId: 'test-user-123',
      providerType: 'mpesa',
      amount: 1000,
      currency: 'KES',
      reference: `test-ref-${Date.now()}`,
      description: 'Test transaction',
      ...overrides
    };
  },

  /**
   * Create a test payment detail data object
   *
   * @param {Object} overrides - Properties to override
   * @returns {Object} Test payment detail data
   */
  createTestPaymentDetail: (overrides = {}) => {
    return {
      transactionId: 'test-transaction-id',
      providerName: 'mpesa',
      providerData: {
        checkoutRequestId: 'ws_CO_test123',
        merchantRequestId: 'test-merchant-123'
      },
      externalReference: 'test-external-ref',
      callbackData: {},
      ...overrides
    };
  },

  /**
   * Create a test M-Pesa callback payload
   *
   * @param {Object} overrides - Properties to override
   * @returns {Object} Test M-Pesa callback
   */
  createTestMpesaCallback: (overrides = {}) => {
    const defaults = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'test-merchant-123',
          CheckoutRequestID: 'ws_CO_test123',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 1000 },
              { Name: 'MpesaReceiptNumber', Value: 'TEST123456' },
              { Name: 'TransactionDate', Value: 20240115143000 },
              { Name: 'PhoneNumber', Value: 254708374149 }
            ]
          }
        }
      }
    };

    return require('lodash').merge(defaults, overrides);
  },

  /**
   * Wait for events to be processed
   *
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  sleep: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Clear all event listeners for clean test state
   */
  clearEventListeners: () => {
    paymentEvents.removeAllListeners();
  },

  /**
   * Mock successful database response
   *
   * @param {Object} data - Data to return
   * @returns {Object} Mock database result
   */
  mockDbResult: (data) => ({
    rows: Array.isArray(data) ? data : [data],
    rowCount: Array.isArray(data) ? data.length : 1
  }),

  /**
   * Generate a random test ID
   *
   * @param {string} prefix - ID prefix
   * @returns {string} Random test ID
   */
  randomId: (prefix = 'test') => `${prefix}-${Math.random().toString(36).substring(7)}`,

  /**
   * Create a mock HTTP request object
   *
   * @param {Object} overrides - Request properties to override
   * @returns {Object} Mock request object
   */
  mockRequest: (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    ip: '127.0.0.1',
    get: jest.fn((header) => overrides.headers?.[header]),
    requestId: 'test-request-id',
    ...overrides
  }),

  /**
   * Create a mock HTTP response object
   *
   * @returns {Object} Mock response object
   */
  mockResponse: () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis()
    };
    return res;
  }
};

// Global setup before all tests
beforeAll(async () => {
  // Silence logger in tests
  logger.transports.forEach(transport => {
    transport.silent = true;
  });

  // Setup test database if needed
  if (process.env.TEST_DATABASE_URL) {
    try {
      await dbConnection.connect();
      console.log('✓ Test database connected');
    } catch (error) {
      console.log('⚠ Test database connection failed - using mocks');
    }
  }
});

// Global cleanup after all tests
afterAll(async () => {
  // Clean up database connections
  if (dbConnection.isConnected) {
    await dbConnection.close();
  }

  // Clean up event listeners
  paymentEvents.removeAllListeners();

  // Wait for any pending operations
  await global.testUtils.sleep(500);
});

// Clean up between test suites
afterEach(async () => {
  // Clear event listeners between tests
  global.testUtils.clearEventListeners();

  // Clear any pending timers
  jest.clearAllTimers();

  // Wait for async operations to complete
  await global.testUtils.sleep(10);
});

// Global error handling for unhandled promises in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in test:', reason);
});

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};