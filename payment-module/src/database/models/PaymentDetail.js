/**
 * Payment Detail Model
 *
 * Stores provider-specific payment information and metadata.
 * This model complements the Transaction model by maintaining
 * detailed payment data that varies between providers.
 *
 * Key Features:
 * - Provider-specific data storage
 * - JSON-based flexible schema
 * - External reference tracking
 * - Callback data management
 * - Provider integration history
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { dbConnection } = require('../connection');
const PaymentError = require('../../errors/PaymentError');
const logger = require('../../utils/logger');

/**
 * Payment Detail Model Class
 */
class PaymentDetail {
  constructor(data = {}) {
    this.id = data.id;
    this.transactionId = data.transaction_id || data.transactionId;
    this.providerName = data.provider_name || data.providerName;
    this.providerData = data.provider_data || data.providerData || {};
    this.externalReference = data.external_reference || data.externalReference;
    this.callbackData = data.callback_data || data.callbackData || {};
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  /**
   * Create a new payment detail record
   *
   * @static
   * @async
   * @param {Object} detailData - Payment detail data
   * @param {string} detailData.transactionId - Associated transaction ID
   * @param {string} detailData.providerName - Payment provider name
   * @param {Object} detailData.providerData - Provider-specific data
   * @param {string} [detailData.externalReference] - Provider's reference
   * @param {Object} [detailData.callbackData] - Callback/webhook data
   * @returns {Promise<PaymentDetail>} Created payment detail
   * @throws {PaymentError} If creation fails
   */
  static async create(detailData) {
    try {
      // Validate required fields
      const requiredFields = ['transactionId', 'providerName', 'providerData'];
      const missingFields = requiredFields.filter(field => !detailData[field]);

      if (missingFields.length > 0) {
        throw PaymentError.validationError(
          `Missing required fields: ${missingFields.join(', ')}`,
          'payment_detail_creation',
          missingFields
        );
      }

      // Validate provider data is an object
      if (typeof detailData.providerData !== 'object') {
        throw PaymentError.validationError(
          'Provider data must be an object',
          'providerData',
          typeof detailData.providerData
        );
      }

      const query = `
        INSERT INTO payment_details (
          transaction_id, provider_name, provider_data,
          external_reference, callback_data, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING *
      `;

      const values = [
        detailData.transactionId,
        detailData.providerName,
        JSON.stringify(detailData.providerData),
        detailData.externalReference || null,
        JSON.stringify(detailData.callbackData || {})
      ];

      const result = await dbConnection.query(query, values);
      const paymentDetail = new PaymentDetail(result.rows[0]);

      logger.info('Payment detail created successfully', {
        paymentDetailId: paymentDetail.id,
        transactionId: paymentDetail.transactionId,
        provider: paymentDetail.providerName,
        externalReference: paymentDetail.externalReference
      });

      return paymentDetail;

    } catch (error) {
      logger.error('Failed to create payment detail', {
        error: error.message,
        detailData: {
          ...detailData,
          providerData: '...', // Don't log full provider data
          callbackData: '...'  // Don't log full callback data
        }
      });

      if (error instanceof PaymentError) {
        throw error;
      }

      // Handle database constraint violations
      if (error.code === '23505') { // Unique violation
        throw PaymentError.duplicateTransactionError(detailData.transactionId);
      }

      if (error.code === '23503') { // Foreign key violation
        throw PaymentError.validationError(
          'Invalid transaction ID or foreign key constraint violation',
          'transaction_id',
          detailData.transactionId
        );
      }

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'PAYMENT_DETAIL_CREATION_FAILED');
    }
  }

  /**
   * Find payment detail by ID
   *
   * @static
   * @async
   * @param {string} id - Payment detail ID
   * @returns {Promise<PaymentDetail|null>} Payment detail or null if not found
   */
  static async findById(id) {
    try {
      const query = 'SELECT * FROM payment_details WHERE id = $1';
      const result = await dbConnection.query(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      return new PaymentDetail(result.rows[0]);

    } catch (error) {
      logger.error('Failed to find payment detail by ID', {
        paymentDetailId: id,
        error: error.message
      });

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'PAYMENT_DETAIL_LOOKUP_FAILED');
    }
  }

  /**
   * Find payment detail by transaction ID
   *
   * @static
   * @async
   * @param {string} transactionId - Transaction ID
   * @param {string} [providerName] - Optional provider filter
   * @returns {Promise<PaymentDetail|null>} Payment detail or null if not found
   */
  static async findByTransactionId(transactionId, providerName = null) {
    try {
      let query = 'SELECT * FROM payment_details WHERE transaction_id = $1';
      const values = [transactionId];

      if (providerName) {
        query += ' AND provider_name = $2';
        values.push(providerName);
      }

      query += ' ORDER BY created_at DESC LIMIT 1';

      const result = await dbConnection.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      return new PaymentDetail(result.rows[0]);

    } catch (error) {
      logger.error('Failed to find payment detail by transaction ID', {
        transactionId,
        providerName,
        error: error.message
      });

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'PAYMENT_DETAIL_LOOKUP_FAILED');
    }
  }

  /**
   * Find payment detail by external reference
   *
   * @static
   * @async
   * @param {string} externalReference - Provider's reference
   * @param {string} [providerName] - Optional provider filter
   * @returns {Promise<PaymentDetail|null>} Payment detail or null if not found
   */
  static async findByExternalReference(externalReference, providerName = null) {
    try {
      let query = 'SELECT * FROM payment_details WHERE external_reference = $1';
      const values = [externalReference];

      if (providerName) {
        query += ' AND provider_name = $2';
        values.push(providerName);
      }

      const result = await dbConnection.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      return new PaymentDetail(result.rows[0]);

    } catch (error) {
      logger.error('Failed to find payment detail by external reference', {
        externalReference,
        providerName,
        error: error.message
      });

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'PAYMENT_DETAIL_LOOKUP_FAILED');
    }
  }

  /**
   * Update payment detail data
   *
   * @async
   * @param {Object} updateData - Data to update
   * @param {Object} [updateData.providerData] - Updated provider data
   * @param {string} [updateData.externalReference] - Updated external reference
   * @param {Object} [updateData.callbackData] - Updated callback data
   * @returns {Promise<boolean>} True if update successful
   */
  async update(updateData) {
    try {
      const updateFields = ['updated_at = NOW()'];
      const values = [this.id];
      let paramIndex = 2;

      // Build dynamic update query
      if (updateData.providerData) {
        updateFields.push(`provider_data = $${paramIndex}`);
        values.push(JSON.stringify(updateData.providerData));
        paramIndex++;
      }

      if (updateData.externalReference !== undefined) {
        updateFields.push(`external_reference = $${paramIndex}`);
        values.push(updateData.externalReference);
        paramIndex++;
      }

      if (updateData.callbackData) {
        updateFields.push(`callback_data = $${paramIndex}`);
        values.push(JSON.stringify(updateData.callbackData));
        paramIndex++;
      }

      if (updateFields.length === 1) {
        // Only updated_at, no actual changes
        return true;
      }

      const query = `
        UPDATE payment_details
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
      this.updatedAt = updatedData.updated_at;

      if (updateData.providerData) {
        this.providerData = JSON.parse(updatedData.provider_data);
      }

      if (updateData.externalReference !== undefined) {
        this.externalReference = updatedData.external_reference;
      }

      if (updateData.callbackData) {
        this.callbackData = JSON.parse(updatedData.callback_data);
      }

      logger.info('Payment detail updated successfully', {
        paymentDetailId: this.id,
        transactionId: this.transactionId,
        updatedFields: Object.keys(updateData)
      });

      return true;

    } catch (error) {
      logger.error('Failed to update payment detail', {
        paymentDetailId: this.id,
        updateData: Object.keys(updateData),
        error: error.message
      });

      if (error instanceof PaymentError) {
        throw error;
      }

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'PAYMENT_DETAIL_UPDATE_FAILED');
    }
  }

  /**
   * Update provider data (merge with existing data)
   *
   * @async
   * @param {Object} newProviderData - New provider data to merge
   * @returns {Promise<boolean>} True if update successful
   */
  async updateProviderData(newProviderData) {
    const mergedData = {
      ...this.providerData,
      ...newProviderData,
      lastUpdated: new Date().toISOString()
    };

    return await this.update({ providerData: mergedData });
  }

  /**
   * Update callback data (merge with existing data)
   *
   * @async
   * @param {Object} newCallbackData - New callback data to merge
   * @returns {Promise<boolean>} True if update successful
   */
  async updateCallbackData(newCallbackData) {
    const mergedData = {
      ...this.callbackData,
      ...newCallbackData,
      lastCallback: new Date().toISOString()
    };

    return await this.update({ callbackData: mergedData });
  }

  /**
   * Get specific provider data field
   *
   * @param {string} fieldPath - Dot-notation path to field (e.g., 'mpesa.receiptNumber')
   * @param {*} defaultValue - Default value if field not found
   * @returns {*} Field value or default
   */
  getProviderDataField(fieldPath, defaultValue = null) {
    return this.getNestedField(this.providerData, fieldPath, defaultValue);
  }

  /**
   * Get specific callback data field
   *
   * @param {string} fieldPath - Dot-notation path to field
   * @param {*} defaultValue - Default value if field not found
   * @returns {*} Field value or default
   */
  getCallbackDataField(fieldPath, defaultValue = null) {
    return this.getNestedField(this.callbackData, fieldPath, defaultValue);
  }

  /**
   * Get nested field from object using dot notation
   *
   * @private
   * @param {Object} obj - Object to search
   * @param {string} path - Dot-notation path
   * @param {*} defaultValue - Default value
   * @returns {*} Field value or default
   */
  getNestedField(obj, path, defaultValue = null) {
    if (!obj || typeof obj !== 'object') {
      return defaultValue;
    }

    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return defaultValue;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Get provider-specific status from provider data
   *
   * @returns {string|null} Provider status or null
   */
  getProviderStatus() {
    // Common provider status field names
    const statusFields = [
      'status',
      'state',
      'paymentStatus',
      'transactionStatus',
      'stkStatus', // M-Pesa specific
      'intentStatus' // Stripe specific
    ];

    for (const field of statusFields) {
      const status = this.getProviderDataField(field);
      if (status) {
        return status;
      }
    }

    return null;
  }

  /**
   * Get provider receipt/confirmation number
   *
   * @returns {string|null} Receipt number or null
   */
  getReceiptNumber() {
    // Common receipt field names
    const receiptFields = [
      'receiptNumber',
      'confirmationNumber',
      'mpesaReceiptNumber', // M-Pesa specific
      'transactionId',
      'paymentIntentId' // Stripe specific
    ];

    for (const field of receiptFields) {
      const receipt = this.getProviderDataField(field);
      if (receipt) {
        return receipt;
      }
    }

    return null;
  }

  /**
   * Convert payment detail to safe JSON (removing sensitive data)
   *
   * @param {boolean} [includeSensitive=false] - Include sensitive data
   * @returns {Object} JSON representation
   */
  toJSON(includeSensitive = false) {
    const json = {
      id: this.id,
      transactionId: this.transactionId,
      providerName: this.providerName,
      externalReference: this.externalReference,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      providerStatus: this.getProviderStatus(),
      receiptNumber: this.getReceiptNumber()
    };

    if (includeSensitive) {
      json.providerData = this.providerData;
      json.callbackData = this.callbackData;
    } else {
      // Include only non-sensitive provider data
      json.providerData = this.sanitizeProviderData();
      json.callbackData = this.sanitizeCallbackData();
    }

    return json;
  }

  /**
   * Sanitize provider data for safe logging/API responses
   *
   * @private
   * @returns {Object} Sanitized provider data
   */
  sanitizeProviderData() {
    if (!this.providerData || typeof this.providerData !== 'object') {
      return {};
    }

    const sanitized = { ...this.providerData };

    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'pin',
      'secret',
      'key',
      'token',
      'credential',
      'auth'
    ];

    for (const field of sensitiveFields) {
      delete sanitized[field];
    }

    return sanitized;
  }

  /**
   * Sanitize callback data for safe logging/API responses
   *
   * @private
   * @returns {Object} Sanitized callback data
   */
  sanitizeCallbackData() {
    if (!this.callbackData || typeof this.callbackData !== 'object') {
      return {};
    }

    const sanitized = { ...this.callbackData };

    // Remove sensitive fields and large raw data
    const sensitiveFields = [
      'rawCallback',
      'fullPayload',
      'headers',
      'authorization'
    ];

    for (const field of sensitiveFields) {
      delete sanitized[field];
    }

    return sanitized;
  }

  /**
   * Delete payment detail record
   *
   * @async
   * @returns {Promise<boolean>} True if deletion successful
   */
  async delete() {
    try {
      const query = 'DELETE FROM payment_details WHERE id = $1';
      const result = await dbConnection.query(query, [this.id]);

      const deleted = result.rowCount > 0;

      if (deleted) {
        logger.info('Payment detail deleted', {
          paymentDetailId: this.id,
          transactionId: this.transactionId
        });
      }

      return deleted;

    } catch (error) {
      logger.error('Failed to delete payment detail', {
        paymentDetailId: this.id,
        error: error.message
      });

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'PAYMENT_DETAIL_DELETE_FAILED');
    }
  }
}

module.exports = {
  PaymentDetail
};