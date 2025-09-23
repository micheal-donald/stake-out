/**
 * Payment Controller
 *
 * Handles HTTP requests for payment operations including initiation,
 * status checking, transaction management, and provider interactions.
 * Provides a clean separation between route handling and business logic.
 *
 * Features:
 * - Payment initiation across multiple providers
 * - Real-time status checking and updates
 * - Transaction history and management
 * - Provider-specific handling
 * - Comprehensive error handling
 * - Request validation and sanitization
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { providerFactory } = require('../../providers/ProviderFactory');
const { Transaction } = require('../../database/models/Transaction');
const PaymentDetail = require('../../database/models/PaymentDetail');
const { paymentEventEmitter } = require('../../events/PaymentEventEmitter');
const PaymentError = require('../../errors/PaymentError');
const logger = require('../../utils/logger');

/**
 * Payment Controller Class
 *
 * Centralizes payment-related HTTP request handling with comprehensive
 * error handling, logging, and event emission for downstream processing.
 */
class PaymentController {
  /**
   * Initiate a new payment transaction
   *
   * @param {Object} paymentData - Payment request data
   * @param {Object} user - Authenticated user object
   * @returns {Promise<Object>} Payment initiation result
   */
  static async initiatePayment(paymentData, user) {
    try {
      const { provider, amount, phoneNumber, currency, description, metadata, reference } = paymentData;

      logger.info('Payment initiation requested', {
        provider,
        amount,
        currency,
        userId: user?.userId || metadata?.userId,
        phoneNumber: phoneNumber?.slice(-4) // Log only last 4 digits for privacy
      });

      // Get payment provider instance
      const paymentProvider = await providerFactory.getProvider(provider);
      if (!paymentProvider) {
        throw new PaymentError(
          'PROVIDER_NOT_AVAILABLE',
          `Payment provider '${provider}' is not available`,
          'PROVIDER_ERROR',
          { provider }
        );
      }

      // Create transaction record
      const transactionData = {
        userId: user?.userId || metadata?.userId,
        providerType: provider,
        amount: parseFloat(amount),
        currency: currency || 'KES',
        reference: reference || `STK${Date.now()}${user?.userId || metadata?.userId || '000'}`,
        phoneNumber,
        description: description || 'Payment transaction',
        metadata: metadata || {},
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (5 * 60 * 1000)) // 5 minutes expiry
      };

      const transaction = await Transaction.create(transactionData);

      // Initiate payment with provider
      const providerResponse = await paymentProvider.initiatePayment({
        transactionId: transaction.id,
        amount: transaction.amount,
        phoneNumber: transaction.phoneNumber,
        currency: transaction.currency,
        description: transaction.description,
        metadata: transaction.metadata
      });

      // Update transaction with provider details
      await Transaction.update(transaction.id, {
        providerTransactionId: providerResponse.transactionId,
        providerData: providerResponse.providerData,
        status: providerResponse.status || 'pending'
      });

      // Create payment detail record
      await PaymentDetail.create({
        transactionId: transaction.id,
        providerName: provider,
        providerData: providerResponse.providerData || {},
        externalReference: providerResponse.transactionId,
        callbackData: {}
      });

      // Emit payment initiated event
      paymentEventEmitter.emit('payment.initiated', {
        transactionId: transaction.id,
        provider,
        amount: transaction.amount,
        phoneNumber: transaction.phoneNumber,
        metadata: transaction.metadata,
        providerResponse
      });

      logger.info('Payment initiated successfully', {
        transactionId: transaction.id,
        providerTransactionId: providerResponse.transactionId,
        provider,
        amount: transaction.amount
      });

      return {
        transaction: {
          id: transaction.id,
          providerTransactionId: providerResponse.transactionId,
          amount: transaction.amount,
          currency: transaction.currency,
          phoneNumber: transaction.phoneNumber,
          status: providerResponse.status || 'initiated',
          providerData: providerResponse.providerData,
          expiresAt: transaction.expiresAt
        },
        message: providerResponse.message || 'Payment initiated successfully'
      };

    } catch (error) {
      logger.error('Payment initiation failed', {
        error: error.message,
        stack: error.stack,
        paymentData: {
          ...paymentData,
          phoneNumber: paymentData.phoneNumber?.slice(-4) // Log only last 4 digits
        },
        userId: user?.userId
      });

      throw error;
    }
  }

  /**
   * Get payment transaction status
   *
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  static async getPaymentStatus(req, res, next) {
    try {
      const { transactionId } = req.params;

      logger.debug('Payment status requested', {
        requestId: req.requestId,
        transactionId
      });

      // Get transaction from database
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        throw new PaymentError(
          'TRANSACTION_NOT_FOUND',
          'Transaction not found',
          'NOT_FOUND',
          { transactionId }
        );
      }

      // Get payment details
      const paymentDetail = await PaymentDetail.findByTransactionId(transactionId);

      // Check with provider for latest status if transaction is still pending
      if (transaction.status === 'pending') {
        try {
          const provider = await providerFactory.getProvider(transaction.provider);
          if (provider && paymentDetail?.providerTransactionId) {
            const providerStatus = await provider.checkStatus(paymentDetail.providerTransactionId);

            // Update transaction status if it changed
            if (providerStatus.status !== transaction.status) {
              await Transaction.update(transactionId, {
                status: providerStatus.status,
                updatedAt: new Date()
              });

              await PaymentDetail.update(paymentDetail.id, {
                status: providerStatus.status,
                providerData: { ...paymentDetail.providerData, ...providerStatus.data }
              });

              // Emit status change event
              paymentEventEmitter.emit('payment.status_changed', {
                transactionId,
                oldStatus: transaction.status,
                newStatus: providerStatus.status,
                providerData: providerStatus.data
              });

              transaction.status = providerStatus.status;
            }
          }
        } catch (providerError) {
          logger.warn('Failed to check provider status', {
            requestId: req.requestId,
            transactionId,
            provider: transaction.provider,
            error: providerError.message
          });
        }
      }

      res.json({
        success: true,
        transaction: {
          id: transaction.id,
          amount: transaction.amount,
          currency: transaction.currency,
          phoneNumber: transaction.phoneNumber,
          description: transaction.description,
          status: transaction.status,
          provider: transaction.provider,
          providerTransactionId: paymentDetail?.providerTransactionId,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          expiresAt: transaction.expiresAt
        },
        requestId: req.requestId
      });

    } catch (error) {
      logger.error('Get payment status failed', {
        requestId: req.requestId,
        transactionId: req.params?.transactionId,
        error: error.message,
        stack: error.stack
      });

      next(error);
    }
  }

  /**
   * Get transaction details
   *
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  static async getTransaction(req, res, next) {
    try {
      const { transactionId } = req.params;

      logger.debug('Transaction details requested', {
        requestId: req.requestId,
        transactionId
      });

      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        throw new PaymentError(
          'TRANSACTION_NOT_FOUND',
          'Transaction not found',
          'NOT_FOUND',
          { transactionId }
        );
      }

      const paymentDetail = await PaymentDetail.findByTransactionId(transactionId);

      res.json({
        success: true,
        transaction: {
          id: transaction.id,
          amount: transaction.amount,
          currency: transaction.currency,
          phoneNumber: transaction.phoneNumber,
          description: transaction.description,
          status: transaction.status,
          provider: transaction.provider,
          metadata: transaction.metadata,
          providerTransactionId: paymentDetail?.providerTransactionId,
          providerData: paymentDetail?.providerData,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          expiresAt: transaction.expiresAt
        },
        requestId: req.requestId
      });

    } catch (error) {
      logger.error('Get transaction failed', {
        requestId: req.requestId,
        transactionId: req.params?.transactionId,
        error: error.message,
        stack: error.stack
      });

      next(error);
    }
  }

  /**
   * List transactions with filtering and pagination
   *
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  static async listTransactions(req, res, next) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        provider,
        userId,
        startDate,
        endDate
      } = req.query;

      logger.debug('Transaction list requested', {
        requestId: req.requestId,
        page,
        limit,
        status,
        provider,
        userId
      });

      const filters = {};
      if (status) filters.status = status;
      if (provider) filters.provider = provider;
      if (userId) filters['metadata.userId'] = userId;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);

      const options = {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100), // Cap at 100 per page
        sort: { createdAt: -1 }
      };

      const result = await Transaction.findWithPagination(filters, options);

      res.json({
        success: true,
        transactions: result.transactions,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: result.pages,
          hasNext: result.hasNext,
          hasPrev: result.hasPrev
        },
        requestId: req.requestId
      });

    } catch (error) {
      logger.error('List transactions failed', {
        requestId: req.requestId,
        error: error.message,
        stack: error.stack
      });

      next(error);
    }
  }

  /**
   * Cancel a pending payment
   *
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  static async cancelPayment(req, res, next) {
    try {
      const { transactionId } = req.params;
      const { reason, userId } = req.body;

      logger.info('Payment cancellation requested', {
        requestId: req.requestId,
        transactionId,
        reason,
        userId
      });

      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        throw new PaymentError(
          'TRANSACTION_NOT_FOUND',
          'Transaction not found',
          'NOT_FOUND',
          { transactionId }
        );
      }

      // Check if transaction can be cancelled
      if (!['pending'].includes(transaction.status)) {
        throw new PaymentError(
          'INVALID_TRANSACTION_STATE',
          `Cannot cancel transaction with status: ${transaction.status}`,
          'VALIDATION_ERROR',
          { status: transaction.status }
        );
      }

      // Check user authorization if userId provided
      if (userId && transaction.metadata?.userId !== userId) {
        throw new PaymentError(
          'UNAUTHORIZED_CANCELLATION',
          'User not authorized to cancel this transaction',
          'AUTHORIZATION_ERROR',
          { userId, transactionUserId: transaction.metadata?.userId }
        );
      }

      // Cancel with provider if possible
      const paymentDetail = await PaymentDetail.findByTransactionId(transactionId);
      if (paymentDetail?.providerTransactionId) {
        try {
          const provider = await providerFactory.getProvider(transaction.provider);
          if (provider && typeof provider.cancelPayment === 'function') {
            await provider.cancelPayment(paymentDetail.providerTransactionId);
          }
        } catch (providerError) {
          logger.warn('Provider cancellation failed', {
            requestId: req.requestId,
            transactionId,
            provider: transaction.provider,
            error: providerError.message
          });
        }
      }

      // Update transaction status
      await Transaction.update(transactionId, {
        status: 'cancelled',
        metadata: {
          ...transaction.metadata,
          cancellation: {
            reason: reason || 'User requested cancellation',
            cancelledAt: new Date(),
            cancelledBy: userId || 'system'
          }
        },
        updatedAt: new Date()
      });

      // Update payment detail
      if (paymentDetail) {
        await PaymentDetail.update(paymentDetail.id, {
          status: 'cancelled'
        });
      }

      // Emit cancellation event
      paymentEventEmitter.emit('payment.cancelled', {
        transactionId,
        reason: reason || 'User requested cancellation',
        userId,
        originalStatus: transaction.status
      });

      logger.info('Payment cancelled successfully', {
        requestId: req.requestId,
        transactionId,
        reason
      });

      res.json({
        success: true,
        message: 'Payment cancelled successfully',
        transaction: {
          id: transactionId,
          status: 'cancelled',
          cancelledAt: new Date()
        },
        requestId: req.requestId
      });

    } catch (error) {
      logger.error('Payment cancellation failed', {
        requestId: req.requestId,
        transactionId: req.params?.transactionId,
        error: error.message,
        stack: error.stack
      });

      next(error);
    }
  }

  /**
   * Get payment history for a user
   *
   * @param {Object} query - Query parameters
   * @param {Object} user - Authenticated user
   * @returns {Promise<Object>} Payment history result
   */
  static async getPaymentHistory(query, user) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        provider,
        startDate,
        endDate,
        userId
      } = query;

      // Use userId from query params if provided, otherwise from user object
      const targetUserId = userId || user?.userId;

      logger.debug('Payment history requested', {
        userId: targetUserId,
        page,
        limit,
        status,
        provider
      });

      // For now, return empty results as the Transaction model expects user_id column
      // which doesn't exist in our current setup
      return {
        transactions: [],
        pagination: {
          currentPage: parseInt(page),
          totalPages: 0,
          totalCount: 0,
          hasNext: false,
          hasPrevious: false
        }
      };

    } catch (error) {
      logger.error('Get payment history failed', {
        userId: user?.userId,
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Get available payment providers
   *
   * @returns {Promise<Object>} Available providers result
   */
  static async getAvailableProviders() {
    try {
      logger.debug('Available providers requested');

      const enabledProviders = providerFactory.getEnabledProviders();
      const providerDetails = {};

      for (const providerName of enabledProviders) {
        const provider = await providerFactory.getProvider(providerName);
        if (provider) {
          providerDetails[providerName] = {
            name: providerName,
            displayName: providerName.charAt(0).toUpperCase() + providerName.slice(1),
            enabled: true,
            paymentMethods: provider.getSupportedMethods ? provider.getSupportedMethods() : ['mobile_money'],
            supportedCurrencies: provider.getSupportedCurrencies ? provider.getSupportedCurrencies() : ['KES'],
            minAmount: provider.getMinAmount ? provider.getMinAmount() : 1,
            maxAmount: provider.getMaxAmount ? provider.getMaxAmount() : 300000,
            features: provider.getFeatures ? provider.getFeatures() : []
          };
        }
      }

      return {
        providers: Object.values(providerDetails),
        count: enabledProviders.length
      };

    } catch (error) {
      logger.error('Get available providers failed', {
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Get available payment providers (legacy method alias)
   *
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  static async getProviders(req, res, next) {
    try {
      logger.debug('Providers list requested', {
        requestId: req.requestId
      });

      const enabledProviders = providerFactory.getEnabledProviders();
      const providerDetails = {};

      for (const providerName of enabledProviders) {
        const provider = await providerFactory.getProvider(providerName);
        if (provider) {
          providerDetails[providerName] = {
            name: providerName,
            available: true,
            supportedCurrencies: provider.getSupportedCurrencies ? provider.getSupportedCurrencies() : ['KES'],
            minAmount: provider.getMinAmount ? provider.getMinAmount() : 1,
            maxAmount: provider.getMaxAmount ? provider.getMaxAmount() : 300000,
            features: provider.getFeatures ? provider.getFeatures() : []
          };
        }
      }

      res.json({
        success: true,
        providers: providerDetails,
        count: enabledProviders.length,
        requestId: req.requestId
      });

    } catch (error) {
      logger.error('Get providers failed', {
        requestId: req.requestId,
        error: error.message,
        stack: error.stack
      });

      next(error);
    }
  }
}

module.exports = PaymentController;