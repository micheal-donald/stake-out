/**
 * Unit Tests for Payment Adapter
 * Tests the payment adapter layer that provides backward compatibility
 */

const PaymentAdapter = require('../../services/paymentAdapter');

// Mock the payment module client
jest.mock('../../services/paymentModuleClient');
const PaymentModuleClient = require('../../services/paymentModuleClient');

// Mock the database pool
jest.mock('../../config/db', () => ({
  query: jest.fn(),
  connect: jest.fn(() => ({
    query: jest.fn(),
    release: jest.fn()
  }))
}));

const pool = require('../../config/db');

describe('PaymentAdapter', () => {
  let paymentAdapter;
  let mockPaymentClient;
  let mockLegacyService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock payment client
    mockPaymentClient = {
      isAvailable: jest.fn().mockResolvedValue(true),
      initiatePayment: jest.fn(),
      checkPaymentStatus: jest.fn(),
      getUserPayments: jest.fn(),
      cancelPayment: jest.fn(),
      getHealthStatus: jest.fn()
    };

    // Mock legacy service
    mockLegacyService = {
      initiateSTKPush: jest.fn(),
      querySTKStatus: jest.fn(),
      getPendingTransactions: jest.fn(),
      cancelTransaction: jest.fn()
    };

    PaymentModuleClient.mockImplementation(() => mockPaymentClient);

    paymentAdapter = new PaymentAdapter({
      legacyService: mockLegacyService
    });
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const adapter = new PaymentAdapter();

      expect(adapter.config.usePaymentModule).toBe(true);
      expect(adapter.config.fallbackToLegacy).toBe(true);
      expect(adapter.paymentClient).toBeInstanceOf(PaymentModuleClient);
    });

    test('should initialize with custom configuration', () => {
      const config = {
        usePaymentModule: false,
        fallbackToLegacy: false,
        customOption: 'test'
      };

      const adapter = new PaymentAdapter(config);

      expect(adapter.config.usePaymentModule).toBe(false);
      expect(adapter.config.fallbackToLegacy).toBe(false);
      expect(adapter.config.customOption).toBe('test');
    });
  });

  describe('STK Push Initiation', () => {
    test('should initiate STK push via payment module when available', async () => {
      const mockResponse = {
        success: true,
        transactionId: 'TXN123',
        checkoutRequestId: 'ws_CO_123',
        message: 'Payment initiated'
      };

      mockPaymentClient.initiatePayment.mockResolvedValue(mockResponse);

      const result = await paymentAdapter.initiateSTKPush('254712345678', 100, 1);

      expect(mockPaymentClient.isAvailable).toHaveBeenCalled();
      expect(mockPaymentClient.initiatePayment).toHaveBeenCalledWith({
        phoneNumber: '254712345678',
        amount: 100,
        userId: 1,
        description: 'StakeOut Bet Deposit'
      });
      expect(result).toEqual(mockResponse);
    });

    test('should fallback to legacy service when payment module unavailable', async () => {
      mockPaymentClient.isAvailable.mockResolvedValue(false);

      const mockLegacyResponse = {
        success: true,
        requestId: 'LEGACY_123',
        message: 'Legacy STK sent'
      };

      mockLegacyService.initiateSTKPush.mockResolvedValue(mockLegacyResponse);

      const result = await paymentAdapter.initiateSTKPush('254712345678', 100, 1);

      expect(mockLegacyService.initiateSTKPush).toHaveBeenCalledWith(
        '254712345678',
        100,
        1
      );
      expect(result).toEqual(mockLegacyResponse);
    });

    test('should handle payment module errors gracefully', async () => {
      mockPaymentClient.initiatePayment.mockRejectedValue(new Error('Payment module error'));

      const mockLegacyResponse = {
        success: true,
        requestId: 'FALLBACK_123'
      };

      mockLegacyService.initiateSTKPush.mockResolvedValue(mockLegacyResponse);

      const result = await paymentAdapter.initiateSTKPush('254712345678', 100, 1);

      expect(mockLegacyService.initiateSTKPush).toHaveBeenCalled();
      expect(result).toEqual(mockLegacyResponse);
    });

    test('should validate input parameters', async () => {
      await expect(
        paymentAdapter.initiateSTKPush('', 100, 1)
      ).rejects.toThrow('Invalid phone number');

      await expect(
        paymentAdapter.initiateSTKPush('254712345678', 0, 1)
      ).rejects.toThrow('Invalid amount');

      await expect(
        paymentAdapter.initiateSTKPush('254712345678', 100, '')
      ).rejects.toThrow('Invalid user ID');
    });

    test('should format phone number correctly', async () => {
      const mockResponse = { success: true, transactionId: 'TXN123' };
      mockPaymentClient.initiatePayment.mockResolvedValue(mockResponse);

      // Test various phone number formats
      await paymentAdapter.initiateSTKPush('0712345678', 100, 1);
      expect(mockPaymentClient.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNumber: '254712345678' })
      );

      await paymentAdapter.initiateSTKPush('+254712345678', 100, 1);
      expect(mockPaymentClient.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNumber: '254712345678' })
      );
    });
  });

  describe('Transaction Status Queries', () => {
    test('should query status via payment module', async () => {
      const mockStatus = {
        success: true,
        status: 'completed',
        amount: 100,
        phoneNumber: '254712345678'
      };

      mockPaymentClient.checkPaymentStatus.mockResolvedValue(mockStatus);

      const result = await paymentAdapter.querySTKStatus('TXN123');

      expect(mockPaymentClient.checkPaymentStatus).toHaveBeenCalledWith('TXN123');
      expect(result).toEqual(mockStatus);
    });

    test('should fallback to legacy for status queries', async () => {
      mockPaymentClient.isAvailable.mockResolvedValue(false);

      const mockLegacyStatus = {
        success: true,
        status: 'pending'
      };

      mockLegacyService.querySTKStatus.mockResolvedValue(mockLegacyStatus);

      const result = await paymentAdapter.querySTKStatus('LEGACY_123');

      expect(mockLegacyService.querySTKStatus).toHaveBeenCalledWith('LEGACY_123');
      expect(result).toEqual(mockLegacyStatus);
    });

    test('should handle non-existent transactions', async () => {
      mockPaymentClient.checkPaymentStatus.mockRejectedValue(
        new Error('Transaction not found')
      );

      await expect(
        paymentAdapter.querySTKStatus('INVALID_TXN')
      ).rejects.toThrow('Transaction not found');
    });
  });

  describe('Pending Transactions', () => {
    test('should get pending transactions for user', async () => {
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

      mockPaymentClient.getUserPayments.mockResolvedValue(mockTransactions);

      const result = await paymentAdapter.getPendingTransactionsForUser(1);

      expect(mockPaymentClient.getUserPayments).toHaveBeenCalledWith(1, {
        status: 'pending',
        page: 1,
        limit: 20
      });
      expect(result).toEqual(mockTransactions);
    });

    test('should handle pagination parameters', async () => {
      const mockTransactions = { success: true, transactions: [] };
      mockPaymentClient.getUserPayments.mockResolvedValue(mockTransactions);

      await paymentAdapter.getPendingTransactionsForUser(1, { page: 2, limit: 10 });

      expect(mockPaymentClient.getUserPayments).toHaveBeenCalledWith(1, {
        status: 'pending',
        page: 2,
        limit: 10
      });
    });

    test('should fallback to legacy for pending transactions', async () => {
      mockPaymentClient.isAvailable.mockResolvedValue(false);

      const mockLegacyTransactions = {
        success: true,
        transactions: []
      };

      mockLegacyService.getPendingTransactions.mockResolvedValue(mockLegacyTransactions);

      const result = await paymentAdapter.getPendingTransactionsForUser(1);

      expect(mockLegacyService.getPendingTransactions).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockLegacyTransactions);
    });
  });

  describe('Transaction Cancellation', () => {
    test('should cancel transaction via payment module', async () => {
      const mockCancelResponse = {
        success: true,
        message: 'Transaction cancelled'
      };

      mockPaymentClient.cancelPayment.mockResolvedValue(mockCancelResponse);

      const result = await paymentAdapter.cancelTransaction('TXN123', 1);

      expect(mockPaymentClient.cancelPayment).toHaveBeenCalledWith('TXN123', 1);
      expect(result).toEqual(mockCancelResponse);
    });

    test('should validate user ownership before cancellation', async () => {
      // Mock database query to check ownership
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      pool.connect.mockResolvedValue(mockClient);

      await expect(
        paymentAdapter.cancelTransaction('TXN123', 999)
      ).rejects.toThrow('Transaction not found or not owned by user');
    });

    test('should handle cancellation failures', async () => {
      mockPaymentClient.cancelPayment.mockRejectedValue(
        new Error('Cannot cancel completed transaction')
      );

      await expect(
        paymentAdapter.cancelTransaction('TXN123', 1)
      ).rejects.toThrow('Cannot cancel completed transaction');
    });
  });

  describe('Health Status', () => {
    test('should return comprehensive health status', async () => {
      const mockHealthStatus = {
        status: 'healthy',
        services: {
          paymentModule: { status: 'online', responseTime: 50 },
          database: { status: 'online', responseTime: 10 }
        }
      };

      mockPaymentClient.getHealthStatus.mockResolvedValue(mockHealthStatus);

      const result = await paymentAdapter.getHealthStatus();

      expect(result.status).toBe('healthy');
      expect(result.services.paymentModule).toBeDefined();
      expect(result.adapter).toBeDefined();
    });

    test('should show degraded status when payment module offline', async () => {
      mockPaymentClient.isAvailable.mockResolvedValue(false);

      const result = await paymentAdapter.getHealthStatus();

      expect(result.status).toBe('degraded');
      expect(result.services.paymentModule.status).toBe('offline');
    });

    test('should include adapter-specific health info', async () => {
      mockPaymentClient.getHealthStatus.mockResolvedValue({
        status: 'healthy',
        services: {}
      });

      const result = await paymentAdapter.getHealthStatus();

      expect(result.adapter).toEqual({
        usePaymentModule: true,
        fallbackToLegacy: true,
        legacyServiceAvailable: true
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle network timeouts gracefully', async () => {
      mockPaymentClient.initiatePayment.mockRejectedValue(
        new Error('ECONNREFUSED')
      );

      const mockLegacyResponse = { success: true, requestId: 'FALLBACK' };
      mockLegacyService.initiateSTKPush.mockResolvedValue(mockLegacyResponse);

      const result = await paymentAdapter.initiateSTKPush('254712345678', 100, 1);

      expect(result).toEqual(mockLegacyResponse);
    });

    test('should handle malformed responses', async () => {
      mockPaymentClient.initiatePayment.mockResolvedValue(null);

      await expect(
        paymentAdapter.initiateSTKPush('254712345678', 100, 1)
      ).rejects.toThrow('Invalid response from payment service');
    });

    test('should handle database connection failures', async () => {
      pool.connect.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        paymentAdapter.cancelTransaction('TXN123', 1)
      ).rejects.toThrow('Database connection failed');
    });

    test('should implement circuit breaker pattern', async () => {
      // Simulate multiple failures
      for (let i = 0; i < 5; i++) {
        mockPaymentClient.initiatePayment.mockRejectedValue(new Error('Service error'));
        mockLegacyService.initiateSTKPush.mockResolvedValue({ success: true });

        await paymentAdapter.initiateSTKPush('254712345678', 100, 1);
      }

      // Adapter should now prefer legacy service for a period
      expect(mockLegacyService.initiateSTKPush).toHaveBeenCalledTimes(5);
    });
  });

  describe('Configuration Management', () => {
    test('should disable payment module when configured', async () => {
      const adapter = new PaymentAdapter({
        usePaymentModule: false,
        legacyService: mockLegacyService
      });

      const mockLegacyResponse = { success: true };
      mockLegacyService.initiateSTKPush.mockResolvedValue(mockLegacyResponse);

      const result = await adapter.initiateSTKPush('254712345678', 100, 1);

      expect(mockPaymentClient.initiatePayment).not.toHaveBeenCalled();
      expect(mockLegacyService.initiateSTKPush).toHaveBeenCalled();
    });

    test('should disable fallback when configured', async () => {
      const adapter = new PaymentAdapter({
        fallbackToLegacy: false
      });

      mockPaymentClient.initiatePayment.mockRejectedValue(new Error('Module error'));

      await expect(
        adapter.initiateSTKPush('254712345678', 100, 1)
      ).rejects.toThrow('Module error');
    });
  });

  describe('Data Transformation', () => {
    test('should transform payment module response to legacy format', async () => {
      const moduleResponse = {
        success: true,
        transactionId: 'PM_TXN_123',
        checkoutRequestId: 'ws_CO_456',
        amount: 100,
        phoneNumber: '254712345678',
        message: 'Payment initiated'
      };

      mockPaymentClient.initiatePayment.mockResolvedValue(moduleResponse);

      const result = await paymentAdapter.initiateSTKPush('254712345678', 100, 1);

      expect(result).toMatchObject({
        success: true,
        transactionId: 'PM_TXN_123',
        checkoutRequestId: 'ws_CO_456',
        message: expect.stringContaining('Payment initiated')
      });
    });

    test('should handle missing fields in responses', async () => {
      const incompleteResponse = {
        success: true,
        transactionId: 'TXN123'
        // Missing other expected fields
      };

      mockPaymentClient.initiatePayment.mockResolvedValue(incompleteResponse);

      const result = await paymentAdapter.initiateSTKPush('254712345678', 100, 1);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('TXN123');
    });
  });
});