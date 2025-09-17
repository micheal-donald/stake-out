/**
 * Payment API Routes Integration Tests
 *
 * Integration test suite for payment API endpoints including
 * authentication, validation, provider integration, and error handling.
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const request = require('supertest');
const { PaymentServer } = require('../../../src/server');
const { dbConnection } = require('../../../src/database/connection');
const { providerFactory } = require('../../../src/providers/ProviderFactory');
const jwt = require('jsonwebtoken');

// Mock database and provider factory
jest.mock('../../../src/database/connection');
jest.mock('../../../src/providers/ProviderFactory');

describe('Payment API Routes', () => {
  let app;
  let server;
  let authToken;

  beforeAll(async () => {
    // Create test server
    server = new PaymentServer({
      port: 0, // Use random port for testing
      rateLimiting: false, // Disable rate limiting for tests
      swagger: false // Disable swagger for tests
    });

    app = server.getApp();

    // Mock database connection
    dbConnection.isConnected = true;
    dbConnection.query = jest.fn();
    dbConnection.connect = jest.fn().mockResolvedValue(true);

    // Mock provider factory
    providerFactory.isInitialized = true;
    providerFactory.initialize = jest.fn().mockResolvedValue(true);
    providerFactory.getProvider = jest.fn();
    providerFactory.isProviderAvailable = jest.fn().mockReturnValue(true);
    providerFactory.getEnabledProviders = jest.fn().mockReturnValue(['mpesa']);

    // Generate test JWT token
    authToken = jwt.sign(
      { userId: 'test-user-123', email: 'test@example.com' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    await server.initialize();
  });

  afterAll(async () => {
    if (server) {
      await server.shutdown();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/payments/initiate', () => {
    const validPaymentData = {
      amount: 1000,
      currency: 'KES',
      provider: 'mpesa',
      phoneNumber: '254708374149',
      description: 'Test payment'
    };

    test('should initiate payment successfully', async () => {
      // Mock successful transaction creation
      dbConnection.query.mockResolvedValueOnce(
        global.testUtils.mockDbResult([]) // No existing transaction
      ).mockResolvedValueOnce(
        global.testUtils.mockDbResult({
          id: 'created-transaction-id',
          reference: 'REF-123',
          ...validPaymentData
        })
      );

      // Mock successful provider payment initiation
      const mockProvider = {
        initiatePayment: jest.fn().mockResolvedValue({
          success: true,
          transactionId: 'provider-tx-123',
          providerData: {
            checkoutRequestId: 'checkout-123',
            merchantRequestId: 'merchant-123'
          }
        })
      };

      providerFactory.getProvider.mockReturnValue(mockProvider);

      const response = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.transaction).toHaveProperty('id');
      expect(response.body.transaction).toHaveProperty('reference');
      expect(response.body.providerResponse).toHaveProperty('transactionId');
    });

    test('should require authentication', async () => {
      await request(app)
        .post('/api/payments/initiate')
        .send(validPaymentData)
        .expect(401);
    });

    test('should validate request body', async () => {
      const invalidData = {
        amount: -100, // Invalid amount
        currency: 'INVALID', // Invalid currency
        provider: 'unknown' // Unknown provider
      };

      await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
    });

    test('should handle missing required fields', async () => {
      const incompleteData = {
        amount: 1000
        // Missing required fields
      };

      await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(incompleteData)
        .expect(400);
    });

    test('should handle provider errors', async () => {
      dbConnection.query.mockResolvedValueOnce(
        global.testUtils.mockDbResult([])
      ).mockResolvedValueOnce(
        global.testUtils.mockDbResult({
          id: 'created-transaction-id',
          ...validPaymentData
        })
      );

      const mockProvider = {
        initiatePayment: jest.fn().mockRejectedValue(
          new Error('Provider service unavailable')
        )
      };

      providerFactory.getProvider.mockReturnValue(mockProvider);

      await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData)
        .expect(500);
    });

    test('should handle unavailable provider', async () => {
      providerFactory.isProviderAvailable.mockReturnValue(false);

      await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...validPaymentData, provider: 'unavailable' })
        .expect(400);
    });

    test('should validate phone number format for mpesa', async () => {
      const invalidPhoneData = {
        ...validPaymentData,
        phoneNumber: '123' // Invalid phone number
      };

      await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidPhoneData)
        .expect(400);
    });

    test('should validate amount limits', async () => {
      const tooLargeAmount = {
        ...validPaymentData,
        amount: 10000000 // Too large
      };

      const tooSmallAmount = {
        ...validPaymentData,
        amount: 0.5 // Too small
      };

      await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(tooLargeAmount)
        .expect(400);

      await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(tooSmallAmount)
        .expect(400);
    });
  });

  describe('GET /api/payments/:transactionId', () => {
    test('should get transaction status successfully', async () => {
      const mockTransaction = {
        id: 'test-transaction-id',
        user_id: 'test-user-123',
        amount: 1000,
        currency: 'KES',
        status: 'completed',
        reference: 'REF-123'
      };

      dbConnection.query.mockResolvedValue(
        global.testUtils.mockDbResult(mockTransaction)
      );

      const response = await request(app)
        .get('/api/payments/test-transaction-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.transaction.id).toBe('test-transaction-id');
      expect(response.body.transaction.status).toBe('completed');
    });

    test('should require authentication', async () => {
      await request(app)
        .get('/api/payments/test-transaction-id')
        .expect(401);
    });

    test('should return 404 for non-existent transaction', async () => {
      dbConnection.query.mockResolvedValue(
        global.testUtils.mockDbResult([])
      );

      await request(app)
        .get('/api/payments/nonexistent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should only return user\'s own transactions', async () => {
      const otherUserTransaction = {
        id: 'test-transaction-id',
        user_id: 'other-user-456', // Different user
        amount: 1000,
        status: 'completed'
      };

      dbConnection.query.mockResolvedValue(
        global.testUtils.mockDbResult([]) // No results for this user
      );

      await request(app)
        .get('/api/payments/test-transaction-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should handle database errors', async () => {
      dbConnection.query.mockRejectedValue(new Error('Database error'));

      await request(app)
        .get('/api/payments/test-transaction-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);
    });
  });

  describe('GET /api/payments', () => {
    test('should list user transactions with pagination', async () => {
      const mockTransactions = [
        {
          id: 'tx-1',
          user_id: 'test-user-123',
          amount: 1000,
          status: 'completed'
        },
        {
          id: 'tx-2',
          user_id: 'test-user-123',
          amount: 2000,
          status: 'pending'
        }
      ];

      dbConnection.query
        .mockResolvedValueOnce(global.testUtils.mockDbResult({ count: '10' })) // Count query
        .mockResolvedValueOnce(global.testUtils.mockDbResult(mockTransactions)); // Data query

      const response = await request(app)
        .get('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toHaveLength(2);
      expect(response.body.pagination.totalCount).toBe(10);
      expect(response.body.pagination.currentPage).toBe(1);
    });

    test('should handle pagination parameters', async () => {
      dbConnection.query
        .mockResolvedValueOnce(global.testUtils.mockDbResult({ count: '25' }))
        .mockResolvedValueOnce(global.testUtils.mockDbResult([]));

      const response = await request(app)
        .get('/api/payments?page=2&limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.pagination.currentPage).toBe(2);
      expect(response.body.pagination.limit).toBe(5);
    });

    test('should handle filter parameters', async () => {
      dbConnection.query
        .mockResolvedValueOnce(global.testUtils.mockDbResult({ count: '5' }))
        .mockResolvedValueOnce(global.testUtils.mockDbResult([]));

      await request(app)
        .get('/api/payments?status=completed&provider=mpesa')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Check that filter parameters were passed to database query
      const queryCall = dbConnection.query.mock.calls[1];
      expect(queryCall[0]).toContain('status = $2');
      expect(queryCall[0]).toContain('provider_type = $3');
    });

    test('should require authentication', async () => {
      await request(app)
        .get('/api/payments')
        .expect(401);
    });

    test('should validate pagination parameters', async () => {
      await request(app)
        .get('/api/payments?page=0&limit=1000')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('POST /api/payments/:transactionId/cancel', () => {
    test('should cancel transaction successfully', async () => {
      const mockTransaction = {
        id: 'test-transaction-id',
        user_id: 'test-user-123',
        status: 'pending',
        amount: 1000
      };

      dbConnection.query
        .mockResolvedValueOnce(global.testUtils.mockDbResult(mockTransaction)) // Find transaction
        .mockResolvedValueOnce(global.testUtils.mockDbResult({ // Update transaction
          ...mockTransaction,
          status: 'cancelled',
          updated_at: new Date()
        }));

      const response = await request(app)
        .post('/api/payments/test-transaction-id/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.transaction.status).toBe('cancelled');
    });

    test('should not cancel completed transactions', async () => {
      const completedTransaction = {
        id: 'test-transaction-id',
        user_id: 'test-user-123',
        status: 'completed',
        amount: 1000
      };

      dbConnection.query.mockResolvedValue(
        global.testUtils.mockDbResult(completedTransaction)
      );

      await request(app)
        .post('/api/payments/test-transaction-id/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    test('should require authentication', async () => {
      await request(app)
        .post('/api/payments/test-transaction-id/cancel')
        .expect(401);
    });

    test('should return 404 for non-existent transaction', async () => {
      dbConnection.query.mockResolvedValue(
        global.testUtils.mockDbResult([])
      );

      await request(app)
        .post('/api/payments/nonexistent-id/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('GET /api/payments/providers', () => {
    test('should list available providers', async () => {
      providerFactory.getProviderCapabilities = jest.fn().mockReturnValue([
        {
          name: 'mpesa',
          displayName: 'M-Pesa',
          type: 'mobile_money',
          supportedCurrencies: ['KES'],
          supportedMethods: ['mobile_money'],
          isAvailable: true,
          isImplemented: true
        }
      ]);

      const response = await request(app)
        .get('/api/payments/providers')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.providers).toHaveLength(1);
      expect(response.body.providers[0].name).toBe('mpesa');
    });

    test('should work without authentication for public endpoint', async () => {
      providerFactory.getProviderCapabilities = jest.fn().mockReturnValue([]);

      await request(app)
        .get('/api/payments/providers')
        .expect(200);
    });
  });

  describe('GET /api/payments/providers/:provider/capabilities', () => {
    test('should get specific provider capabilities', async () => {
      providerFactory.getProviderCapabilities = jest.fn().mockReturnValue({
        name: 'mpesa',
        displayName: 'M-Pesa',
        type: 'mobile_money',
        supportedCurrencies: ['KES'],
        supportedMethods: ['mobile_money'],
        isAvailable: true,
        isImplemented: true
      });

      const response = await request(app)
        .get('/api/payments/providers/mpesa/capabilities')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.provider.name).toBe('mpesa');
    });

    test('should return 404 for unknown provider', async () => {
      providerFactory.getProviderCapabilities = jest.fn().mockImplementation(() => {
        throw new Error('Unknown provider');
      });

      await request(app)
        .get('/api/payments/providers/unknown/capabilities')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });

    test('should handle invalid JWT tokens', async () => {
      await request(app)
        .get('/api/payments')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    test('should handle expired JWT tokens', async () => {
      const expiredToken = jwt.sign(
        { userId: 'test-user-123' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      await request(app)
        .get('/api/payments')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    test('should handle missing authorization header', async () => {
      await request(app)
        .get('/api/payments')
        .expect(401);
    });

    test('should handle internal server errors gracefully', async () => {
      dbConnection.query.mockRejectedValue(new Error('Database connection lost'));

      const response = await request(app)
        .get('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.error).toBe('Internal Server Error');
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Request Validation', () => {
    test('should validate UUID format for transaction IDs', async () => {
      await request(app)
        .get('/api/payments/invalid-uuid-format')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    test('should validate currency codes', async () => {
      const invalidCurrency = {
        amount: 1000,
        currency: 'INVALID',
        provider: 'mpesa',
        phoneNumber: '254708374149'
      };

      await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidCurrency)
        .expect(400);
    });

    test('should validate phone number formats', async () => {
      const invalidPhone = {
        amount: 1000,
        currency: 'KES',
        provider: 'mpesa',
        phoneNumber: 'not-a-phone-number'
      };

      await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidPhone)
        .expect(400);
    });

    test('should handle request timeout', async () => {
      // Mock a long-running database operation
      dbConnection.query.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 35000))
      );

      await request(app)
        .get('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000)
        .expect(500);
    });
  });
});