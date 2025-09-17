/**
 * Transaction Model
 *
 * Represents a payment transaction with comprehensive CRUD operations,
 * status management, and business logic validation. This model provides
 * a clean interface to the transactions table while maintaining data
 * integrity and audit trails.
 *
 * Key Features:
 * - Complete transaction lifecycle management
 * - Status transition validation
 * - Audit trail maintenance
 * - Performance-optimized queries
 * - Comprehensive error handling
 * - Provider-agnostic design
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { dbConnection } = require('../connection');
const PaymentError = require('../../errors/PaymentError');
const logger = require('../../utils/logger');

/**
 * Valid transaction statuses and their allowed transitions
 */
const TRANSACTION_STATUSES = {
  INITIATED: 'initiated',
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout'
};

/**
 * Valid status transitions
 */
const STATUS_TRANSITIONS = {
  [TRANSACTION_STATUSES.INITIATED]: [
    TRANSACTION_STATUSES.PENDING,
    TRANSACTION_STATUSES.COMPLETED,
    TRANSACTION_STATUSES.FAILED,
    TRANSACTION_STATUSES.CANCELLED,
    TRANSACTION_STATUSES.TIMEOUT
  ],
  [TRANSACTION_STATUSES.PENDING]: [
    TRANSACTION_STATUSES.COMPLETED,
    TRANSACTION_STATUSES.FAILED,
    TRANSACTION_STATUSES.CANCELLED,
    TRANSACTION_STATUSES.TIMEOUT
  ],
  [TRANSACTION_STATUSES.COMPLETED]: [], // Final status
  [TRANSACTION_STATUSES.FAILED]: [], // Final status
  [TRANSACTION_STATUSES.CANCELLED]: [], // Final status
  [TRANSACTION_STATUSES.TIMEOUT]: [] // Final status
};

/**
 * Transaction Model Class
 */
class Transaction {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id || data.userId;
    this.providerType = data.provider_type || data.providerType;
    this.amount = data.amount;
    this.currency = data.currency || 'KES';
    this.status = data.status || TRANSACTION_STATUSES.INITIATED;
    this.reference = data.reference;
    this.description = data.description;
    this.metadata = data.metadata || {};
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
    this.expiresAt = data.expires_at || data.expiresAt;
  }

  /**
   * Create a new transaction
   *
   * @static
   * @async
   * @param {Object} transactionData - Transaction data
   * @param {string} transactionData.userId - User ID
   * @param {string} transactionData.providerType - Payment provider
   * @param {number} transactionData.amount - Transaction amount
   * @param {string} transactionData.currency - Currency code
   * @param {string} transactionData.reference - Unique reference
   * @param {string} [transactionData.description] - Description
   * @param {Object} [transactionData.metadata] - Additional metadata
   * @param {Date} [transactionData.expiresAt] - Expiration time
   * @returns {Promise<Transaction>} Created transaction
   * @throws {PaymentError} If creation fails
   */
  static async create(transactionData) {
    try {
      // Validate required fields
      const requiredFields = ['userId', 'providerType', 'amount', 'reference'];
      const missingFields = requiredFields.filter(field => !transactionData[field]);

      if (missingFields.length > 0) {
        throw PaymentError.validationError(
          `Missing required fields: ${missingFields.join(', ')}`,
          'transaction_creation',
          missingFields
        );
      }

      // Validate amount
      if (transactionData.amount <= 0) {
        throw PaymentError.validationError(
          'Amount must be greater than 0',
          'amount',
          transactionData.amount
        );
      }

      // Check for duplicate reference
      const existingTransaction = await Transaction.findByReference(transactionData.reference);
      if (existingTransaction) {
        throw PaymentError.duplicateTransactionError(transactionData.reference);
      }

      const query = `
        INSERT INTO transactions (
          user_id, provider_type, amount, currency, reference,
          description, metadata, expires_at, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING *
      `;

      const values = [
        transactionData.userId,
        transactionData.providerType,
        transactionData.amount,
        transactionData.currency || 'KES',
        transactionData.reference,
        transactionData.description || null,
        JSON.stringify(transactionData.metadata || {}),
        transactionData.expiresAt || null,
        TRANSACTION_STATUSES.INITIATED
      ];

      const result = await dbConnection.query(query, values);
      const transaction = new Transaction(result.rows[0]);

      logger.info('Transaction created successfully', {
        transactionId: transaction.id,
        userId: transaction.userId,
        provider: transaction.providerType,
        amount: transaction.amount,
        currency: transaction.currency,
        reference: transaction.reference
      });

      return transaction;

    } catch (error) {
      logger.error('Failed to create transaction', {
        error: error.message,
        transactionData: {
          ...transactionData,
          metadata: '...' // Don't log full metadata
        }
      });

      if (error instanceof PaymentError) {
        throw error;
      }

      // Handle database constraint violations
      if (error.code === '23505') { // Unique violation
        throw PaymentError.duplicateTransactionError(transactionData.reference);
      }

      if (error.code === '23503') { // Foreign key violation
        throw PaymentError.validationError(
          'Invalid user ID or foreign key constraint violation',
          'foreign_key',
          transactionData.userId
        );
      }

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'TRANSACTION_CREATION_FAILED');
    }
  }

  /**
   * Find transaction by ID
   *
   * @static
   * @async
   * @param {string} id - Transaction ID
   * @param {string} [userId] - Optional user ID for ownership validation
   * @returns {Promise<Transaction|null>} Transaction or null if not found
   */
  static async findById(id, userId = null) {
    try {
      let query = 'SELECT * FROM transactions WHERE id = $1';
      const values = [id];

      if (userId) {
        query += ' AND user_id = $2';
        values.push(userId);
      }

      const result = await dbConnection.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      return new Transaction(result.rows[0]);

    } catch (error) {
      logger.error('Failed to find transaction by ID', {
        transactionId: id,
        userId,
        error: error.message
      });

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'TRANSACTION_LOOKUP_FAILED');
    }
  }

  /**
   * Find transaction by reference
   *
   * @static
   * @async
   * @param {string} reference - Transaction reference
   * @returns {Promise<Transaction|null>} Transaction or null if not found
   */
  static async findByReference(reference) {
    try {
      const query = 'SELECT * FROM transactions WHERE reference = $1';
      const result = await dbConnection.query(query, [reference]);

      if (result.rows.length === 0) {
        return null;
      }

      return new Transaction(result.rows[0]);

    } catch (error) {
      logger.error('Failed to find transaction by reference', {
        reference,
        error: error.message
      });

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'TRANSACTION_LOOKUP_FAILED');
    }
  }

  /**
   * Find transactions by user with pagination and filtering
   *
   * @static
   * @async
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=20] - Items per page
   * @param {string} [options.status] - Filter by status
   * @param {string} [options.provider] - Filter by provider
   * @param {Date} [options.startDate] - Filter from date
   * @param {Date} [options.endDate] - Filter to date
   * @returns {Promise<Object>} Paginated results with transactions and metadata
   */
  static async findByUser(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        provider,
        startDate,
        endDate
      } = options;

      const offset = (page - 1) * limit;
      let whereConditions = ['user_id = $1'];
      let values = [userId];
      let paramIndex = 2;

      // Add filters
      if (status) {
        whereConditions.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }

      if (provider) {
        whereConditions.push(`provider_type = $${paramIndex}`);
        values.push(provider);
        paramIndex++;
      }

      if (startDate) {
        whereConditions.push(`created_at >= $${paramIndex}`);
        values.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        whereConditions.push(`created_at <= $${paramIndex}`);
        values.push(endDate);
        paramIndex++;
      }

      const whereClause = whereConditions.join(' AND ');

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM transactions WHERE ${whereClause}`;
      const countResult = await dbConnection.query(countQuery, values);
      const totalCount = parseInt(countResult.rows[0].count);

      // Get transactions
      const query = `
        SELECT * FROM transactions
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      values.push(limit, offset);

      const result = await dbConnection.query(query, values);
      const transactions = result.rows.map(row => new Transaction(row));

      const totalPages = Math.ceil(totalCount / limit);

      return {
        transactions,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
          limit
        }
      };

    } catch (error) {
      logger.error('Failed to find transactions by user', {
        userId,
        options,
        error: error.message
      });

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'TRANSACTION_QUERY_FAILED');
    }
  }

  /**
   * Update transaction status with validation
   *
   * @async
   * @param {string} newStatus - New status
   * @param {Object} [updateData] - Additional data to update
   * @returns {Promise<boolean>} True if update successful
   * @throws {PaymentError} If status transition is invalid
   */
  async updateStatus(newStatus, updateData = {}) {
    try {
      // Validate status transition
      if (!this.isValidStatusTransition(newStatus)) {
        throw PaymentError.validationError(
          `Invalid status transition from '${this.status}' to '${newStatus}'`,
          'status_transition',
          { currentStatus: this.status, newStatus }
        );
      }

      const oldStatus = this.status;

      // Build update query
      const updateFields = ['status = $2', 'updated_at = NOW()'];
      const values = [this.id, newStatus];
      let paramIndex = 3;

      // Add optional update fields
      if (updateData.description) {
        updateFields.push(`description = $${paramIndex}`);
        values.push(updateData.description);
        paramIndex++;
      }

      if (updateData.metadata) {
        updateFields.push(`metadata = $${paramIndex}`);
        values.push(JSON.stringify(updateData.metadata));
        paramIndex++;
      }

      const query = `
        UPDATE transactions
        SET ${updateFields.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const result = await dbConnection.query(query, values);

      if (result.rows.length === 0) {
        throw PaymentError.transactionNotFoundError(this.id);
      }

      // Update instance properties
      const updatedData = result.rows[0];
      this.status = updatedData.status;
      this.updatedAt = updatedData.updated_at;
      if (updateData.description) this.description = updatedData.description;
      if (updateData.metadata) this.metadata = JSON.parse(updatedData.metadata);

      logger.info('Transaction status updated', {
        transactionId: this.id,
        oldStatus,
        newStatus,
        userId: this.userId
      });

      return true;

    } catch (error) {
      logger.error('Failed to update transaction status', {
        transactionId: this.id,
        currentStatus: this.status,
        newStatus,
        error: error.message
      });

      if (error instanceof PaymentError) {
        throw error;
      }

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'STATUS_UPDATE_FAILED');
    }
  }

  /**
   * Check if a status transition is valid
   *
   * @param {string} newStatus - Target status
   * @returns {boolean} True if transition is valid
   */
  isValidStatusTransition(newStatus) {
    if (!Object.values(TRANSACTION_STATUSES).includes(newStatus)) {
      return false;
    }

    const allowedTransitions = STATUS_TRANSITIONS[this.status] || [];
    return allowedTransitions.includes(newStatus);
  }

  /**
   * Check if transaction is in a final state
   *
   * @returns {boolean} True if transaction cannot be modified
   */
  isFinal() {
    const finalStatuses = [
      TRANSACTION_STATUSES.COMPLETED,
      TRANSACTION_STATUSES.FAILED,
      TRANSACTION_STATUSES.CANCELLED,
      TRANSACTION_STATUSES.TIMEOUT
    ];

    return finalStatuses.includes(this.status);
  }

  /**
   * Check if transaction has expired
   *
   * @returns {boolean} True if transaction has expired
   */
  isExpired() {
    if (!this.expiresAt) {
      return false;
    }

    return new Date() > new Date(this.expiresAt);
  }

  /**
   * Mark transaction as expired
   *
   * @async
   * @returns {Promise<boolean>} True if update successful
   */
  async markAsExpired() {
    if (this.isFinal()) {
      return false; // Already in final state
    }

    return await this.updateStatus(TRANSACTION_STATUSES.TIMEOUT, {
      description: 'Transaction expired'
    });
  }

  /**
   * Get transaction duration in milliseconds
   *
   * @returns {number} Duration from creation to last update
   */
  getDuration() {
    const startTime = new Date(this.createdAt);
    const endTime = new Date(this.updatedAt || this.createdAt);
    return endTime.getTime() - startTime.getTime();
  }

  /**
   * Convert transaction to safe JSON (removing sensitive data)
   *
   * @param {boolean} [includeSensitive=false] - Include sensitive data
   * @returns {Object} JSON representation
   */
  toJSON(includeSensitive = false) {
    const json = {
      id: this.id,
      userId: this.userId,
      providerType: this.providerType,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
      reference: this.reference,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      expiresAt: this.expiresAt,
      isExpired: this.isExpired(),
      isFinal: this.isFinal(),
      duration: this.getDuration()
    };

    if (includeSensitive) {
      json.metadata = this.metadata;
    } else {
      // Include only non-sensitive metadata
      json.metadata = this.metadata ? {
        ...this.metadata,
        // Remove potentially sensitive fields
        cardNumber: undefined,
        pin: undefined,
        password: undefined
      } : {};
    }

    return json;
  }

  /**
   * Find and mark expired transactions
   *
   * @static
   * @async
   * @returns {Promise<number>} Number of transactions marked as expired
   */
  static async markExpiredTransactions() {
    try {
      const query = `
        UPDATE transactions
        SET status = $1, updated_at = NOW()
        WHERE expires_at < NOW()
        AND status IN ($2, $3)
        RETURNING id
      `;

      const result = await dbConnection.query(query, [
        TRANSACTION_STATUSES.TIMEOUT,
        TRANSACTION_STATUSES.INITIATED,
        TRANSACTION_STATUSES.PENDING
      ]);

      const expiredCount = result.rows.length;

      if (expiredCount > 0) {
        logger.info('Marked expired transactions', {
          count: expiredCount,
          transactionIds: result.rows.map(row => row.id)
        });
      }

      return expiredCount;

    } catch (error) {
      logger.error('Failed to mark expired transactions', {
        error: error.message
      });

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'EXPIRE_TRANSACTIONS_FAILED');
    }
  }
}

module.exports = {
  Transaction,
  TRANSACTION_STATUSES,
  STATUS_TRANSITIONS
};