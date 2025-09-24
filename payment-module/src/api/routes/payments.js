/**
 * Payment API Routes
 *
 * RESTful API endpoints for payment operations. These routes provide a
 * provider-agnostic interface for initiating payments, checking status,
 * and managing transactions.
 *
 * Migrated and Enhanced from: backend/routes/mpesa.js
 *
 * Key Features:
 * - Provider-agnostic payment API
 * - Comprehensive input validation
 * - Structured error responses
 * - Request/response logging
 * - Authentication middleware integration
 * - Rate limiting support
 * - Comprehensive API documentation
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();

const PaymentController = require('../controllers/PaymentController');
const authMiddleware = require('../middleware/auth');
const validationMiddleware = require('../middleware/validation');
const rateLimitMiddleware = require('../middleware/rateLimit');
const logger = require('../../utils/logger');

/**
 * @swagger
 * components:
 *   schemas:
 *     PaymentInitiationRequest:
 *       type: object
 *       required:
 *         - provider
 *         - amount
 *         - phoneNumber
 *         - reference
 *       properties:
 *         provider:
 *           type: string
 *           enum: [mpesa, stripe, paypal]
 *           description: Payment provider to use
 *           example: mpesa
 *         amount:
 *           type: number
 *           minimum: 1
 *           description: Payment amount in smallest currency unit
 *           example: 1000
 *         currency:
 *           type: string
 *           pattern: '^[A-Z]{3}$'
 *           description: ISO 4217 currency code
 *           example: KES
 *           default: KES
 *         phoneNumber:
 *           type: string
 *           pattern: '^(254|0|\+254)\d{9}$'
 *           description: Customer phone number (Kenyan format)
 *           example: "254712345678"
 *         email:
 *           type: string
 *           format: email
 *           description: Customer email address
 *           example: "customer@example.com"
 *         reference:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *           description: Unique transaction reference
 *           example: "ORDER123456"
 *         description:
 *           type: string
 *           maxLength: 200
 *           description: Payment description
 *           example: "Payment for order #123456"
 *         metadata:
 *           type: object
 *           description: Additional metadata for the transaction
 *           example: { "orderId": "12345", "customerId": "67890" }
 *
 *     PaymentInitiationResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Whether the payment initiation was successful
 *           example: true
 *         transactionId:
 *           type: string
 *           description: Internal transaction identifier
 *           example: "txn_abc123def456"
 *         externalReference:
 *           type: string
 *           description: Provider's transaction reference
 *           example: "ws_CO_123456789"
 *         status:
 *           type: string
 *           enum: [initiated, pending, completed, failed, cancelled, timeout]
 *           description: Current payment status
 *           example: "initiated"
 *         message:
 *           type: string
 *           description: Human-readable status message
 *           example: "Payment initiated successfully. Please check your phone."
 *         amount:
 *           type: number
 *           description: Payment amount
 *           example: 1000
 *         currency:
 *           type: string
 *           description: Payment currency
 *           example: "KES"
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           description: When the payment request expires
 *           example: "2024-01-15T10:35:00.000Z"
 *         providerData:
 *           type: object
 *           description: Provider-specific response data
 *
 *     PaymentStatusResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         transactionId:
 *           type: string
 *           example: "txn_abc123def456"
 *         externalReference:
 *           type: string
 *           example: "ws_CO_123456789"
 *         status:
 *           type: string
 *           enum: [pending, completed, failed]
 *           example: "completed"
 *         message:
 *           type: string
 *           example: "Payment completed successfully"
 *         amount:
 *           type: number
 *           example: 1000
 *         currency:
 *           type: string
 *           example: "KES"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:32:00.000Z"
 *         providerData:
 *           type: object
 *           description: Provider-specific status data
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *               example: "VALIDATION_ERROR"
 *             code:
 *               type: string
 *               example: "INVALID_AMOUNT"
 *             message:
 *               type: string
 *               example: "Amount must be greater than 0"
 *             details:
 *               type: object
 *               example: { "field": "amount", "value": -100 }
 *         correlationId:
 *           type: string
 *           example: "req_abc123def456"
 */

/**
 * Validation rules for payment initiation
 */
const paymentInitiationValidation = [
  body('provider')
    .isIn(['mpesa', 'stripe', 'paypal'])
    .withMessage('Provider must be one of: mpesa, stripe, paypal'),

  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be a number greater than 0')
    .toFloat(),

  body('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .isAlpha()
    .toUpperCase()
    .withMessage('Currency must be a 3-letter ISO code'),

  body('phoneNumber')
    .matches(/^(254|0|\+254)\d{9}$/)
    .withMessage('Phone number must be a valid Kenyan mobile number'),

  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email must be a valid email address'),

  body('reference')
    .isLength({ min: 1, max: 50 })
    .trim()
    .withMessage('Reference must be between 1 and 50 characters'),

  body('description')
    .optional()
    .isLength({ max: 200 })
    .trim()
    .withMessage('Description must be maximum 200 characters'),

  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

/**
 * Validation rules for status check
 */
const statusCheckValidation = [
  param('transactionId')
    .isUUID()
    .withMessage('Transaction ID must be a valid UUID')
];

/**
 * Validation rules for transaction history
 */
const transactionHistoryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .toInt()
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt()
    .withMessage('Limit must be between 1 and 100'),

  query('status')
    .optional()
    .isIn(['pending', 'completed', 'failed'])
    .withMessage('Status must be a valid payment status'),

  query('provider')
    .optional()
    .isIn(['mpesa', 'stripe', 'paypal'])
    .withMessage('Provider must be a valid payment provider'),

  query('startDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Start date must be a valid ISO 8601 date'),

  query('endDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('End date must be a valid ISO 8601 date')
];

/**
 * @swagger
 * /api/payments/initiate:
 *   post:
 *     summary: Initiate a payment transaction
 *     description: |
 *       Initiates a payment transaction with the specified provider.
 *       For M-Pesa, this sends an STK Push to the customer's phone.
 *       For other providers, it creates the appropriate payment intent.
 *     tags:
 *       - Payments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentInitiationRequest'
 *           examples:
 *             mpesa_payment:
 *               summary: M-Pesa Payment
 *               value:
 *                 provider: "mpesa"
 *                 amount: 1000
 *                 currency: "KES"
 *                 phoneNumber: "254712345678"
 *                 reference: "ORDER123456"
 *                 description: "Payment for premium subscription"
 *                 metadata:
 *                   orderId: "12345"
 *                   customerId: "67890"
 *     responses:
 *       200:
 *         description: Payment initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentInitiationResponse'
 *       400:
 *         description: Validation error or bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.post('/initiate',
  rateLimitMiddleware.payment,
  authMiddleware.authenticateApiKey,
  paymentInitiationValidation,
  validationMiddleware.handleValidationErrors,
  async (req, res) => {
    const operationContext = logger.startOperation('payment_initiation', {
      userId: req.user?.userId,
      provider: req.body.provider,
      amount: req.body.amount,
      correlationId: req.correlationId
    });

    try {
      // For API key authentication, user info comes from request body metadata
      const user = req.user || (req.body.metadata ? { userId: req.body.metadata.userId } : null);
      const result = await PaymentController.initiatePayment(req.body, user);

      logger.endOperation(operationContext, true, {
        transactionId: result.transactionId,
        status: result.status
      });

      res.json({
        success: true,
        ...result,
        correlationId: req.correlationId
      });

    } catch (error) {
      logger.endOperation(operationContext, false, error);

      const statusCode = error.getHttpStatus ? error.getHttpStatus() : 500;

      res.status(statusCode).json({
        success: false,
        error: error.toJSON ? error.toJSON() : {
          type: 'INTERNAL_ERROR',
          code: 'UNKNOWN_ERROR',
          message: error.message || 'An unexpected error occurred'
        },
        correlationId: req.correlationId
      });
    }
  }
);

/**
 * @swagger
 * /api/payments/{transactionId}/status:
 *   get:
 *     summary: Check payment status
 *     description: |
 *       Retrieves the current status of a payment transaction.
 *       This may trigger a status query to the payment provider
 *       if the local status is stale.
 *     tags:
 *       - Payments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Transaction ID to check
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentStatusResponse'
 *       404:
 *         description: Transaction not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied to this transaction
 *       500:
 *         description: Internal server error
 */
router.get('/:transactionId/status',
  authMiddleware.authenticate,
  statusCheckValidation,
  validationMiddleware.handleValidationErrors,
  async (req, res) => {
    const operationContext = logger.startOperation('payment_status_check', {
      userId: req.user?.userId,
      transactionId: req.params.transactionId,
      correlationId: req.correlationId
    });

    try {
      const result = await PaymentController.getPaymentStatus(
        req.params.transactionId,
        req.user
      );

      logger.endOperation(operationContext, true, {
        status: result.status,
        updatedAt: result.updatedAt
      });

      res.json({
        success: true,
        ...result,
        correlationId: req.correlationId
      });

    } catch (error) {
      logger.endOperation(operationContext, false, error);

      const statusCode = error.getHttpStatus ? error.getHttpStatus() : 500;

      res.status(statusCode).json({
        success: false,
        error: error.toJSON ? error.toJSON() : {
          type: 'INTERNAL_ERROR',
          code: 'UNKNOWN_ERROR',
          message: error.message || 'An unexpected error occurred'
        },
        correlationId: req.correlationId
      });
    }
  }
);

/**
 * @swagger
 * /api/payments/history:
 *   get:
 *     summary: Get payment transaction history
 *     description: |
 *       Retrieves a paginated list of payment transactions for the authenticated user.
 *       Results can be filtered by status, provider, and date range.
 *     tags:
 *       - Payments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of transactions per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [initiated, pending, completed, failed, cancelled, timeout]
 *         description: Filter by payment status
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *           enum: [mpesa, stripe, paypal]
 *         description: Filter by payment provider
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter transactions from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter transactions until this date
 *     responses:
 *       200:
 *         description: Transaction history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 transactions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PaymentStatusResponse'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                       example: 1
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                     totalCount:
 *                       type: integer
 *                       example: 95
 *                     hasNext:
 *                       type: boolean
 *                       example: true
 *                     hasPrevious:
 *                       type: boolean
 *                       example: false
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/history',
  authMiddleware.authenticateApiKey,
  transactionHistoryValidation,
  validationMiddleware.handleValidationErrors,
  async (req, res) => {
    const operationContext = logger.startOperation('payment_history', {
      userId: req.query.userId,
      page: req.query.page || 1,
      limit: req.query.limit || 20,
      correlationId: req.correlationId,
      serviceAuth: req.service?.type === 'api_key'
    });

    try {
      // For API key authentication, user info comes from query params
      const user = req.service?.type === 'api_key' ? null : req.user;
      const result = await PaymentController.getPaymentHistory(req.query, user);

      logger.endOperation(operationContext, true, {
        totalTransactions: result.pagination.totalCount,
        page: result.pagination.currentPage
      });

      res.json({
        success: true,
        ...result,
        correlationId: req.correlationId
      });

    } catch (error) {
      logger.endOperation(operationContext, false, error);

      const statusCode = error.getHttpStatus ? error.getHttpStatus() : 500;

      res.status(statusCode).json({
        success: false,
        error: error.toJSON ? error.toJSON() : {
          type: 'INTERNAL_ERROR',
          code: 'UNKNOWN_ERROR',
          message: error.message || 'An unexpected error occurred'
        },
        correlationId: req.correlationId
      });
    }
  }
);

/**
 * @swagger
 * /api/payments/{transactionId}/cancel:
 *   post:
 *     summary: Cancel a pending payment
 *     description: |
 *       Attempts to cancel a payment transaction that is still in progress.
 *       Only transactions in 'initiated' or 'pending' status can be cancelled.
 *     tags:
 *       - Payments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Transaction ID to cancel
 *     responses:
 *       200:
 *         description: Transaction cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Transaction cancelled successfully"
 *                 transactionId:
 *                   type: string
 *                   example: "123e4567-e89b-12d3-a456-426614174000"
 *                 status:
 *                   type: string
 *                   example: "cancelled"
 *       400:
 *         description: Transaction cannot be cancelled (wrong status)
 *       404:
 *         description: Transaction not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied to this transaction
 *       500:
 *         description: Internal server error
 */
router.post('/:transactionId/cancel',
  authMiddleware.authenticate,
  statusCheckValidation,
  validationMiddleware.handleValidationErrors,
  async (req, res) => {
    const operationContext = logger.startOperation('payment_cancellation', {
      userId: req.user?.userId,
      transactionId: req.params.transactionId,
      correlationId: req.correlationId
    });

    try {
      const result = await PaymentController.cancelPayment(
        req.params.transactionId,
        req.user
      );

      logger.endOperation(operationContext, true, {
        status: result.status
      });

      res.json({
        success: true,
        ...result,
        correlationId: req.correlationId
      });

    } catch (error) {
      logger.endOperation(operationContext, false, error);

      const statusCode = error.getHttpStatus ? error.getHttpStatus() : 500;

      res.status(statusCode).json({
        success: false,
        error: error.toJSON ? error.toJSON() : {
          type: 'INTERNAL_ERROR',
          code: 'UNKNOWN_ERROR',
          message: error.message || 'An unexpected error occurred'
        },
        correlationId: req.correlationId
      });
    }
  }
);

/**
 * @swagger
 * /api/payments/providers:
 *   get:
 *     summary: Get available payment providers
 *     description: |
 *       Returns a list of available payment providers and their capabilities.
 *       This endpoint does not require authentication and can be used
 *       to populate payment method selection in the frontend.
 *     tags:
 *       - Payments
 *     responses:
 *       200:
 *         description: Providers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 providers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "mpesa"
 *                       displayName:
 *                         type: string
 *                         example: "M-Pesa"
 *                       enabled:
 *                         type: boolean
 *                         example: true
 *                       paymentMethods:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["mobile_money"]
 *                       supportedCurrencies:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["KES"]
 *                       minAmount:
 *                         type: number
 *                         example: 1
 *                       maxAmount:
 *                         type: number
 *                         example: 300000
 *       500:
 *         description: Internal server error
 */
router.get('/providers',
  async (req, res) => {
    try {
      const result = await PaymentController.getAvailableProviders();

      res.json({
        success: true,
        ...result,
        correlationId: req.correlationId
      });

    } catch (error) {
      logger.error('Failed to get payment providers', {
        error: error.message,
        correlationId: req.correlationId
      });

      const statusCode = error.getHttpStatus ? error.getHttpStatus() : 500;

      res.status(statusCode).json({
        success: false,
        error: error.toJSON ? error.toJSON() : {
          type: 'INTERNAL_ERROR',
          code: 'UNKNOWN_ERROR',
          message: error.message || 'An unexpected error occurred'
        },
        correlationId: req.correlationId
      });
    }
  }
);

module.exports = router;