/**
 * Transaction Model Unit Tests
 *
 * Comprehensive test suite for the Transaction model including
 * CRUD operations, status transitions, event emission, and error handling.
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { Transaction, TRANSACTION_STATUSES, STATUS_TRANSITIONS } = require('../../../src/database/models/Transaction');
const { dbConnection } = require('../../../src/database/connection');
const { paymentEvents, PAYMENT_EVENTS } = require('../../../src/events/PaymentEventEmitter');
const PaymentError = require('../../../src/errors/PaymentError');

// Mock database connection
jest.mock('../../../src/database/connection', () => ({
  dbConnection: {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    isConnected: true
  }
}));

// Mock payment events
jest.mock('../../../src/events/PaymentEventEmitter', () => ({
  paymentEvents: {
    emitPaymentEvent: jest.fn()
  },
  PAYMENT_EVENTS: {
    TRANSACTION_CREATED: 'transaction.created',
    TRANSACTION_STATUS_CHANGED: 'transaction.status_changed'
  }
}));

describe('Transaction Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should create transaction instance with default values', () => {
      const transaction = new Transaction();

      expect(transaction.currency).toBe('KES');
      expect(transaction.status).toBe(TRANSACTION_STATUSES.INITIATED);
      expect(transaction.metadata).toEqual({});
    });

    test('should create transaction instance with provided data', () => {
      const data = {
        id: 'test-123',
        user_id: 'user-456',
        provider_type: 'mpesa',
        amount: 1000,
        currency: 'USD',
        status: 'pending',
        reference: 'ref-123'
      };

      const transaction = new Transaction(data);

      expect(transaction.id).toBe('test-123');
      expect(transaction.userId).toBe('user-456');
      expect(transaction.providerType).toBe('mpesa');
      expect(transaction.amount).toBe(1000);
      expect(transaction.currency).toBe('USD');
      expect(transaction.status).toBe('pending');
      expect(transaction.reference).toBe('ref-123');
    });

    test('should handle both snake_case and camelCase properties', () => {
      const snakeCaseData = { user_id: 'user-123', provider_type: 'mpesa' };
      const camelCaseData = { userId: 'user-456', providerType: 'stripe' };

      const transaction1 = new Transaction(snakeCaseData);
      const transaction2 = new Transaction(camelCaseData);

      expect(transaction1.userId).toBe('user-123');
      expect(transaction1.providerType).toBe('mpesa');
      expect(transaction2.userId).toBe('user-456');
      expect(transaction2.providerType).toBe('stripe');
    });
  });

  describe('Create Transaction', () => {
    test('should create transaction successfully', async () => {
      const transactionData = global.testUtils.createTestTransaction();
      const mockResult = global.testUtils.mockDbResult({
        id: 'created-transaction-id',
        ...transactionData,
        created_at: new Date(),
        updated_at: new Date()
      });

      dbConnection.query.mockResolvedValue(mockResult);

      const transaction = await Transaction.create(transactionData);

      expect(transaction).toBeInstanceOf(Transaction);
      expect(transaction.id).toBe('created-transaction-id');
      expect(paymentEvents.emitPaymentEvent).toHaveBeenCalledWith(
        PAYMENT_EVENTS.TRANSACTION_CREATED,
        expect.objectContaining({
          transactionId: 'created-transaction-id',
          userId: transactionData.userId,
          amount: transactionData.amount
        })
      );
    });

    test('should validate required fields', async () => {
      const invalidData = { amount: 1000 }; // missing required fields

      await expect(Transaction.create(invalidData)).rejects.toThrow(PaymentError);
    });

    test('should validate positive amount', async () => {
      const invalidData = global.testUtils.createTestTransaction({ amount: -100 });

      await expect(Transaction.create(invalidData)).rejects.toThrow(PaymentError);
    });

    test('should check for duplicate references', async () => {
      const transactionData = global.testUtils.createTestTransaction();

      // Mock existing transaction with same reference
      dbConnection.query
        .mockResolvedValueOnce(global.testUtils.mockDbResult({
          id: 'existing-id',
          reference: transactionData.reference
        }));

      await expect(Transaction.create(transactionData)).rejects.toThrow(PaymentError);
    });

    test('should handle database errors', async () => {
      const transactionData = global.testUtils.createTestTransaction();

      dbConnection.query
        .mockResolvedValueOnce(global.testUtils.mockDbResult([])) // No duplicate check
        .mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(Transaction.create(transactionData)).rejects.toThrow(PaymentError);
    });

    test('should handle unique constraint violations', async () => {
      const transactionData = global.testUtils.createTestTransaction();
      const uniqueError = new Error('Unique violation');
      uniqueError.code = '23505';

      dbConnection.query
        .mockResolvedValueOnce(global.testUtils.mockDbResult([])) // No duplicate check
        .mockRejectedValueOnce(uniqueError);

      await expect(Transaction.create(transactionData)).rejects.toThrow(PaymentError);
    });
  });

  describe('Find Methods', () => {
    test('should find transaction by ID', async () => {
      const mockTransaction = {
        id: 'test-123',
        user_id: 'user-456',
        amount: 1000,
        status: 'completed'
      };

      dbConnection.query.mockResolvedValue(global.testUtils.mockDbResult(mockTransaction));

      const transaction = await Transaction.findById('test-123');

      expect(transaction).toBeInstanceOf(Transaction);
      expect(transaction.id).toBe('test-123');
      expect(dbConnection.query).toHaveBeenCalledWith(
        'SELECT * FROM transactions WHERE id = $1',
        ['test-123']
      );
    });

    test('should find transaction by ID with user filter', async () => {
      const mockTransaction = {
        id: 'test-123',
        user_id: 'user-456',
        amount: 1000
      };

      dbConnection.query.mockResolvedValue(global.testUtils.mockDbResult(mockTransaction));

      const transaction = await Transaction.findById('test-123', 'user-456');

      expect(transaction).toBeInstanceOf(Transaction);
      expect(dbConnection.query).toHaveBeenCalledWith(
        'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
        ['test-123', 'user-456']
      );
    });

    test('should return null when transaction not found', async () => {
      dbConnection.query.mockResolvedValue(global.testUtils.mockDbResult([]));

      const transaction = await Transaction.findById('nonexistent');

      expect(transaction).toBeNull();
    });

    test('should find transaction by reference', async () => {
      const mockTransaction = {
        id: 'test-123',
        reference: 'ref-456',
        amount: 1000
      };

      dbConnection.query.mockResolvedValue(global.testUtils.mockDbResult(mockTransaction));

      const transaction = await Transaction.findByReference('ref-456');

      expect(transaction).toBeInstanceOf(Transaction);
      expect(transaction.reference).toBe('ref-456');
    });

    test('should handle database errors in find methods', async () => {
      dbConnection.query.mockRejectedValue(new Error('Database error'));

      await expect(Transaction.findById('test-123')).rejects.toThrow(PaymentError);
    });
  });

  describe('Find by User with Pagination', () => {
    test('should find transactions by user with default pagination', async () => {
      const mockTransactions = [
        { id: 'tx-1', user_id: 'user-123', amount: 1000 },
        { id: 'tx-2', user_id: 'user-123', amount: 2000 }
      ];

      dbConnection.query
        .mockResolvedValueOnce(global.testUtils.mockDbResult({ count: '10' })) // Count query
        .mockResolvedValueOnce(global.testUtils.mockDbResult(mockTransactions)); // Data query

      const result = await Transaction.findByUser('user-123');

      expect(result.transactions).toHaveLength(2);
      expect(result.pagination.totalCount).toBe(10);
      expect(result.pagination.currentPage).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });

    test('should handle pagination parameters', async () => {
      const options = { page: 2, limit: 5 };

      dbConnection.query
        .mockResolvedValueOnce(global.testUtils.mockDbResult({ count: '25' }))
        .mockResolvedValueOnce(global.testUtils.mockDbResult([]));

      const result = await Transaction.findByUser('user-123', options);

      expect(result.pagination.currentPage).toBe(2);
      expect(result.pagination.totalPages).toBe(5);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrevious).toBe(true);
    });

    test('should apply filters correctly', async () => {
      const options = {
        status: 'completed',
        provider: 'mpesa',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };

      dbConnection.query
        .mockResolvedValueOnce(global.testUtils.mockDbResult({ count: '5' }))
        .mockResolvedValueOnce(global.testUtils.mockDbResult([]));

      await Transaction.findByUser('user-123', options);

      const queryCall = dbConnection.query.mock.calls[1];
      expect(queryCall[0]).toContain('status = $2');
      expect(queryCall[0]).toContain('provider_type = $3');
      expect(queryCall[0]).toContain('created_at >= $4');
      expect(queryCall[0]).toContain('created_at <= $5');
    });
  });

  describe('Status Transitions', () => {
    test('should validate status transitions', () => {
      const transaction = new Transaction({ status: TRANSACTION_STATUSES.INITIATED });

      expect(transaction.isValidStatusTransition(TRANSACTION_STATUSES.PENDING)).toBe(true);
      expect(transaction.isValidStatusTransition(TRANSACTION_STATUSES.COMPLETED)).toBe(true);
      expect(transaction.isValidStatusTransition('invalid_status')).toBe(false);
    });

    test('should prevent invalid status transitions', () => {
      const transaction = new Transaction({ status: TRANSACTION_STATUSES.COMPLETED });

      expect(transaction.isValidStatusTransition(TRANSACTION_STATUSES.PENDING)).toBe(false);
      expect(transaction.isValidStatusTransition(TRANSACTION_STATUSES.FAILED)).toBe(false);
    });

    test('should identify final statuses', () => {
      const completedTx = new Transaction({ status: TRANSACTION_STATUSES.COMPLETED });
      const failedTx = new Transaction({ status: TRANSACTION_STATUSES.FAILED });
      const pendingTx = new Transaction({ status: TRANSACTION_STATUSES.PENDING });

      expect(completedTx.isFinal()).toBe(true);
      expect(failedTx.isFinal()).toBe(true);
      expect(pendingTx.isFinal()).toBe(false);
    });
  });

  describe('Update Status', () => {
    test('should update transaction status successfully', async () => {
      const transaction = new Transaction({
        id: 'test-123',
        userId: 'user-456',
        status: TRANSACTION_STATUSES.INITIATED,
        amount: 1000,
        currency: 'KES'
      });

      const mockUpdatedData = {
        id: 'test-123',
        status: TRANSACTION_STATUSES.COMPLETED,
        updated_at: new Date()
      };

      dbConnection.query.mockResolvedValue(global.testUtils.mockDbResult(mockUpdatedData));

      const result = await transaction.updateStatus(TRANSACTION_STATUSES.COMPLETED);

      expect(result).toBe(true);
      expect(transaction.status).toBe(TRANSACTION_STATUSES.COMPLETED);
      expect(paymentEvents.emitPaymentEvent).toHaveBeenCalledWith(
        PAYMENT_EVENTS.TRANSACTION_STATUS_CHANGED,
        expect.objectContaining({
          transactionId: 'test-123',
          oldStatus: TRANSACTION_STATUSES.INITIATED,
          newStatus: TRANSACTION_STATUSES.COMPLETED
        })
      );
    });

    test('should reject invalid status transitions', async () => {
      const transaction = new Transaction({
        id: 'test-123',
        status: TRANSACTION_STATUSES.COMPLETED
      });

      await expect(
        transaction.updateStatus(TRANSACTION_STATUSES.PENDING)
      ).rejects.toThrow(PaymentError);
    });

    test('should update additional fields with status', async () => {
      const transaction = new Transaction({
        id: 'test-123',
        status: TRANSACTION_STATUSES.INITIATED
      });

      const updateData = {
        description: 'Payment completed',
        metadata: { receiptNumber: 'RCP123' }
      };

      dbConnection.query.mockResolvedValue(global.testUtils.mockDbResult({
        id: 'test-123',
        status: TRANSACTION_STATUSES.COMPLETED,
        description: updateData.description,
        metadata: JSON.stringify(updateData.metadata),
        updated_at: new Date()
      }));

      await transaction.updateStatus(TRANSACTION_STATUSES.COMPLETED, updateData);

      expect(transaction.description).toBe(updateData.description);
      expect(transaction.metadata).toEqual(updateData.metadata);
    });

    test('should handle transaction not found during update', async () => {
      const transaction = new Transaction({ id: 'nonexistent' });

      dbConnection.query.mockResolvedValue(global.testUtils.mockDbResult([]));

      await expect(
        transaction.updateStatus(TRANSACTION_STATUSES.COMPLETED)
      ).rejects.toThrow(PaymentError);
    });
  });

  describe('Expiration Handling', () => {
    test('should detect expired transactions', () => {
      const expiredTx = new Transaction({
        expiresAt: new Date(Date.now() - 1000) // 1 second ago
      });

      const validTx = new Transaction({
        expiresAt: new Date(Date.now() + 1000) // 1 second from now
      });

      const noExpiryTx = new Transaction({});

      expect(expiredTx.isExpired()).toBe(true);
      expect(validTx.isExpired()).toBe(false);
      expect(noExpiryTx.isExpired()).toBe(false);
    });

    test('should mark transaction as expired', async () => {
      const transaction = new Transaction({
        id: 'test-123',
        status: TRANSACTION_STATUSES.INITIATED,
        expiresAt: new Date(Date.now() - 1000)
      });

      dbConnection.query.mockResolvedValue(global.testUtils.mockDbResult({
        id: 'test-123',
        status: TRANSACTION_STATUSES.TIMEOUT,
        updated_at: new Date()
      }));

      const result = await transaction.markAsExpired();

      expect(result).toBe(true);
      expect(transaction.status).toBe(TRANSACTION_STATUSES.TIMEOUT);
    });

    test('should not mark final transactions as expired', async () => {
      const transaction = new Transaction({
        id: 'test-123',
        status: TRANSACTION_STATUSES.COMPLETED
      });

      const result = await transaction.markAsExpired();

      expect(result).toBe(false);
      expect(dbConnection.query).not.toHaveBeenCalled();
    });

    test('should mark expired transactions in batch', async () => {
      const mockResult = global.testUtils.mockDbResult([
        { id: 'tx-1' },
        { id: 'tx-2' },
        { id: 'tx-3' }
      ]);

      dbConnection.query.mockResolvedValue(mockResult);

      const count = await Transaction.markExpiredTransactions();

      expect(count).toBe(3);
      expect(dbConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE transactions'),
        [
          TRANSACTION_STATUSES.TIMEOUT,
          TRANSACTION_STATUSES.INITIATED,
          TRANSACTION_STATUSES.PENDING
        ]
      );
    });
  });

  describe('Utility Methods', () => {
    test('should calculate transaction duration', () => {
      const createdAt = new Date('2024-01-01T10:00:00Z');
      const updatedAt = new Date('2024-01-01T10:05:00Z');

      const transaction = new Transaction({
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString()
      });

      const duration = transaction.getDuration();
      expect(duration).toBe(5 * 60 * 1000); // 5 minutes in milliseconds
    });

    test('should convert to safe JSON', () => {
      const transaction = new Transaction({
        id: 'test-123',
        userId: 'user-456',
        amount: 1000,
        metadata: {
          cardNumber: '1234-5678-9012-3456',
          receiptNumber: 'RCP123',
          pin: '1234'
        }
      });

      const json = transaction.toJSON(false);

      expect(json.id).toBe('test-123');
      expect(json.userId).toBe('user-456');
      expect(json.metadata.receiptNumber).toBe('RCP123');
      expect(json.metadata.cardNumber).toBeUndefined();
      expect(json.metadata.pin).toBeUndefined();
    });

    test('should include sensitive data when requested', () => {
      const transaction = new Transaction({
        id: 'test-123',
        metadata: {
          cardNumber: '1234-5678-9012-3456',
          pin: '1234'
        }
      });

      const json = transaction.toJSON(true);

      expect(json.metadata.cardNumber).toBe('1234-5678-9012-3456');
      expect(json.metadata.pin).toBe('1234');
    });
  });

  describe('Constants and Validation', () => {
    test('should export transaction statuses', () => {
      expect(TRANSACTION_STATUSES.INITIATED).toBe('initiated');
      expect(TRANSACTION_STATUSES.PENDING).toBe('pending');
      expect(TRANSACTION_STATUSES.COMPLETED).toBe('completed');
      expect(TRANSACTION_STATUSES.FAILED).toBe('failed');
      expect(TRANSACTION_STATUSES.CANCELLED).toBe('cancelled');
      expect(TRANSACTION_STATUSES.TIMEOUT).toBe('timeout');
    });

    test('should export status transitions', () => {
      expect(STATUS_TRANSITIONS[TRANSACTION_STATUSES.INITIATED]).toContain(
        TRANSACTION_STATUSES.PENDING
      );
      expect(STATUS_TRANSITIONS[TRANSACTION_STATUSES.COMPLETED]).toEqual([]);
    });

    test('should handle unknown status transitions', () => {
      const transaction = new Transaction({ status: 'unknown_status' });

      expect(transaction.isValidStatusTransition(TRANSACTION_STATUSES.COMPLETED)).toBe(false);
    });
  });
});