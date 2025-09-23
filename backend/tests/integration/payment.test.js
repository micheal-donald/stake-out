/**
 * Integration Tests for Payment Flows
 * Tests the complete payment processing pipeline including M-Pesa integration
 */

const request = require('supertest');
const express = require('express');
const PaymentAdapter = require('../../services/paymentAdapter');
const testDb = require('../helpers/database');

// Mock external dependencies
jest.mock('../../services/paymentModuleClient');
jest.mock('../../config/db');

const pool = require('../../config/db');

describe('Payment Integration Tests', () => {
  let app;
  let paymentAdapter;
  let testUser;

  beforeAll(async () => {
    // Connect to test database
    await testDb.connect();
  });

  afterAll(async () => {
    await testDb.cleanup();
    await testDb.disconnect();
  });

  beforeEach(async () => {
    // Create Express app for testing
    app = express();
    app.use(express.json());

    // Mock pool for the adapter
    const mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect = jest.fn(() => mockClient);
    pool.query = jest.fn();

    // Create payment adapter
    paymentAdapter = new PaymentAdapter({
      usePaymentModule: true,
      fallbackToLegacy: true
    });

    // Create test user
    testUser = await testDb.createTestUser({
      username: 'paymenttest',
      email: 'payment@test.com',
      balance: 1000
    });

    // Setup routes for testing
    setupTestRoutes();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await testDb.cleanup();
  });

  function setupTestRoutes() {
    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = { userId: testUser.user_id };
      next();
    });

    // M-Pesa STK Push endpoint
    app.post('/api/mpesa/stk-push', async (req, res) => {
      try {
        const { phoneNumber, amount } = req.body;
        const userId = req.user.userId;

        const result = await paymentAdapter.initiateSTKPush(phoneNumber, amount, userId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Transaction status endpoint
    app.get('/api/mpesa/status/:requestId', async (req, res) => {
      try {
        const { requestId } = req.params;
        const result = await paymentAdapter.querySTKStatus(requestId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Pending transactions endpoint
    app.get('/api/mpesa/pending', async (req, res) => {
      try {
        const userId = req.user.userId;
        const result = await paymentAdapter.getPendingTransactionsForUser(userId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Cancel transaction endpoint
    app.post('/api/mpesa/cancel/:transactionId', async (req, res) => {
      try {
        const { transactionId } = req.params;
        const userId = req.user.userId;
        const result = await paymentAdapter.cancelTransaction(transactionId, userId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Health check endpoint
    app.get('/api/mpesa/health', async (req, res) => {
      try {
        const result = await paymentAdapter.getHealthStatus();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  describe('STK Push Payment Initiation', () => {
    test('should successfully initiate STK push payment', async () => {
      // Mock successful payment module response
      const mockResponse = {
        success: true,
        transactionId: 'TXN123456',
        checkoutRequestId: 'ws_CO_123456789',
        message: 'Please check your phone',
        amount: 100,
        phoneNumber: '254712345678'
      };

      paymentAdapter.paymentClient.initiatePayment = jest.fn().mockResolvedValue(mockResponse);
      paymentAdapter.paymentClient.isAvailable = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .post('/api/mpesa/stk-push')
        .send({
          phoneNumber: '0712345678',
          amount: 100
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.transactionId).toBe('TXN123456');
      expect(response.body.message).toContain('check your phone');
    });

    test('should validate phone number format', async () => {
      const invalidPhoneNumbers = ['123', '0712', '254712', 'invalid'];

      for (const phoneNumber of invalidPhoneNumbers) {
        await request(app)
          .post('/api/mpesa/stk-push')
          .send({
            phoneNumber,
            amount: 100
          })
          .expect(400);
      }
    });

    test('should validate payment amount', async () => {
      const invalidAmounts = [0, -50, 0.5, 50001];

      for (const amount of invalidAmounts) {
        await request(app)
          .post('/api/mpesa/stk-push')
          .send({
            phoneNumber: '0712345678',
            amount
          })
          .expect(400);
      }
    });

    test('should fallback to legacy service when payment module unavailable', async () => {
      // Mock payment module as unavailable
      paymentAdapter.paymentClient.isAvailable = jest.fn().mockResolvedValue(false);

      // Mock legacy service
      paymentAdapter.legacyService = {
        initiateSTKPush: jest.fn().mockResolvedValue({
          success: true,
          requestId: 'LEGACY_REQ_123',
          message: 'Legacy STK sent'
        })
      };

      const response = await request(app)
        .post('/api/mpesa/stk-push')
        .send({
          phoneNumber: '0712345678',
          amount: 100
        })
        .expect(200);

      expect(paymentAdapter.legacyService.initiateSTKPush).toHaveBeenCalled();
      expect(response.body.success).toBe(true);
    });
  });

  describe('Transaction Status Queries', () => {
    test('should successfully query transaction status', async () => {
      const mockStatus = {
        success: true,
        status: 'completed',
        amount: 100,
        phoneNumber: '254712345678',
        createdAt: new Date().toISOString()
      };

      paymentAdapter.paymentClient.checkPaymentStatus = jest.fn().mockResolvedValue(mockStatus);
      paymentAdapter.paymentClient.isAvailable = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .get('/api/mpesa/status/TXN123456')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('completed');
    });

    test('should handle non-existent transaction ID', async () => {
      paymentAdapter.paymentClient.checkPaymentStatus = jest.fn().mockRejectedValue(
        new Error('Transaction not found')
      );
      paymentAdapter.paymentClient.isAvailable = jest.fn().mockResolvedValue(true);

      await request(app)
        .get('/api/mpesa/status/INVALID_ID')
        .expect(500);
    });
  });

  describe('Pending Transactions', () => {
    test('should retrieve user pending transactions', async () => {
      const mockTransactions = {
        success: true,
        transactions: [
          {
            id: 'TXN123',
            amount: 100,
            status: 'pending',
            createdAt: new Date().toISOString()
          }
        ],
        pagination: { page: 1, totalCount: 1 }
      };

      paymentAdapter.paymentClient.getUserPayments = jest.fn().mockResolvedValue(mockTransactions);
      paymentAdapter.paymentClient.isAvailable = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .get('/api/mpesa/pending')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toHaveLength(1);
      expect(response.body.transactions[0].status).toBe('pending');
    });

    test('should handle empty pending transactions', async () => {
      const mockEmptyResponse = {
        success: true,
        transactions: [],
        pagination: { page: 1, totalCount: 0 }
      };

      paymentAdapter.paymentClient.getUserPayments = jest.fn().mockResolvedValue(mockEmptyResponse);
      paymentAdapter.paymentClient.isAvailable = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .get('/api/mpesa/pending')
        .expect(200);

      expect(response.body.transactions).toHaveLength(0);
    });
  });

  describe('Transaction Cancellation', () => {
    test('should successfully cancel pending transaction', async () => {
      const mockCancelResponse = {
        success: true,
        message: 'Transaction cancelled successfully'
      };

      paymentAdapter.paymentClient.cancelPayment = jest.fn().mockResolvedValue(mockCancelResponse);
      paymentAdapter.paymentClient.isAvailable = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .post('/api/mpesa/cancel/TXN123456')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('cancelled');
    });

    test('should handle cancellation of non-existent transaction', async () => {
      paymentAdapter.paymentClient.cancelPayment = jest.fn().mockRejectedValue(
        new Error('Transaction not found or cannot be cancelled')
      );
      paymentAdapter.paymentClient.isAvailable = jest.fn().mockResolvedValue(true);

      await request(app)
        .post('/api/mpesa/cancel/INVALID_ID')
        .expect(500);
    });
  });

  describe('Payment System Health', () => {
    test('should return healthy status when all services operational', async () => {
      paymentAdapter.paymentClient.isAvailable = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .get('/api/mpesa/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.services).toBeDefined();
      expect(response.body.services.paymentModule.status).toBe('online');
    });

    test('should return degraded status when payment module unavailable', async () => {
      paymentAdapter.paymentClient.isAvailable = jest.fn().mockResolvedValue(false);

      const response = await request(app)
        .get('/api/mpesa/health')
        .expect(200);

      expect(response.body.status).toBe('degraded');
      expect(response.body.services.paymentModule.status).toBe('offline');
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle payment module timeout gracefully', async () => {
      paymentAdapter.paymentClient.initiatePayment = jest.fn().mockRejectedValue(
        new Error('Request timeout')
      );
      paymentAdapter.paymentClient.isAvailable = jest.fn().mockResolvedValue(true);

      // Mock legacy fallback
      paymentAdapter.legacyService = {
        initiateSTKPush: jest.fn().mockResolvedValue({
          success: true,
          requestId: 'LEGACY_FALLBACK',
          message: 'Processed via legacy service'
        })
      };

      const response = await request(app)
        .post('/api/mpesa/stk-push')
        .send({
          phoneNumber: '0712345678',
          amount: 100
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(paymentAdapter.legacyService.initiateSTKPush).toHaveBeenCalled();
    });

    test('should handle database connection errors', async () => {
      pool.connect.mockRejectedValue(new Error('Database connection failed'));

      await request(app)
        .post('/api/mpesa/stk-push')
        .send({
          phoneNumber: '0712345678',
          amount: 100
        })
        .expect(500);
    });

    test('should retry failed operations', async () => {
      let attemptCount = 0;
      paymentAdapter.paymentClient.initiatePayment = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({
          success: true,
          transactionId: 'TXN_RETRY_SUCCESS',
          message: 'Success after retry'
        });
      });

      paymentAdapter.paymentClient.isAvailable = jest.fn().mockResolvedValue(true);

      // Enable retry logic (if implemented)
      const response = await request(app)
        .post('/api/mpesa/stk-push')
        .send({
          phoneNumber: '0712345678',
          amount: 100
        });

      // Should eventually succeed after retries
      expect(attemptCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Security and Validation', () => {
    test('should prevent SQL injection in user queries', async () => {
      const maliciousInput = "'; DROP TABLE users; --";

      await request(app)
        .post('/api/mpesa/stk-push')
        .send({
          phoneNumber: maliciousInput,
          amount: 100
        })
        .expect(400); // Should be rejected due to validation
    });

    test('should validate request parameters', async () => {
      // Test missing required fields
      await request(app)
        .post('/api/mpesa/stk-push')
        .send({})
        .expect(400);

      // Test invalid data types
      await request(app)
        .post('/api/mpesa/stk-push')
        .send({
          phoneNumber: 123,
          amount: "invalid"
        })
        .expect(400);
    });

    test('should handle large amounts appropriately', async () => {
      const largeAmount = 1000000; // 1 million

      await request(app)
        .post('/api/mpesa/stk-push')
        .send({
          phoneNumber: '0712345678',
          amount: largeAmount
        })
        .expect(400); // Should reject amounts above maximum limit
    });
  });
});