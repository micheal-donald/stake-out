/**
 * Webhook API Routes
 *
 * Handles incoming webhook notifications from payment providers.
 * These routes process callbacks for payment status updates and
 * other provider-specific notifications.
 *
 * Migrated and Enhanced from: backend/routes/mpesa.js (callback endpoints)
 *
 * Key Features:
 * - Provider-specific webhook handling
 * - Signature validation for security
 * - Automatic transaction status updates
 * - Event emission for real-time notifications
 * - Comprehensive error handling and logging
 * - Idempotency protection
 *
 * Security Considerations:
 * - Webhook signature validation
 * - IP address whitelisting (where supported)
 * - Request rate limiting
 * - Payload size limits
 * - Automatic retry handling
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const express = require('express');
const router = express.Router();

const WebhookController = require('../controllers/WebhookController');
const webhookMiddleware = require('../middleware/webhook');
const rateLimitMiddleware = require('../middleware/rateLimit');
const logger = require('../../utils/logger');

/**
 * @swagger
 * components:
 *   schemas:
 *     WebhookResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Whether the webhook was processed successfully
 *           example: true
 *         message:
 *           type: string
 *           description: Processing status message
 *           example: "Webhook processed successfully"
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: Processing timestamp
 *           example: "2024-01-15T10:35:00.000Z"
 *
 *     MpesaCallbackPayload:
 *       type: object
 *       description: M-Pesa STK Push callback payload structure
 *       properties:
 *         Body:
 *           type: object
 *           properties:
 *             stkCallback:
 *               type: object
 *               properties:
 *                 MerchantRequestID:
 *                   type: string
 *                   example: "29115-34620561-1"
 *                 CheckoutRequestID:
 *                   type: string
 *                   example: "ws_CO_191220191020363925"
 *                 ResultCode:
 *                   type: integer
 *                   description: M-Pesa result code (0 = success)
 *                   example: 0
 *                 ResultDesc:
 *                   type: string
 *                   example: "The service request is processed successfully."
 *                 CallbackMetadata:
 *                   type: object
 *                   properties:
 *                     Item:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           Name:
 *                             type: string
 *                             example: "Amount"
 *                           Value:
 *                             oneOf:
 *                               - type: string
 *                               - type: number
 *                             example: 1000
 */

/**
 * @swagger
 * /api/webhooks/mpesa/callback:
 *   post:
 *     summary: M-Pesa payment callback
 *     description: |
 *       Receives payment status notifications from Safaricom M-Pesa.
 *       This endpoint processes STK Push results and updates transaction status.
 *
 *       **Important**: This endpoint is called directly by M-Pesa servers
 *       and should not be called manually. It has special security considerations
 *       and must respond quickly to prevent M-Pesa from retrying.
 *     tags:
 *       - Webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MpesaCallbackPayload'
 *           examples:
 *             successful_payment:
 *               summary: Successful Payment Callback
 *               value:
 *                 Body:
 *                   stkCallback:
 *                     MerchantRequestID: "29115-34620561-1"
 *                     CheckoutRequestID: "ws_CO_191220191020363925"
 *                     ResultCode: 0
 *                     ResultDesc: "The service request is processed successfully."
 *                     CallbackMetadata:
 *                       Item:
 *                         - Name: "Amount"
 *                           Value: 1000
 *                         - Name: "MpesaReceiptNumber"
 *                           Value: "NLJ7RT61SV"
 *                         - Name: "TransactionDate"
 *                           Value: 20191219102115
 *                         - Name: "PhoneNumber"
 *                           Value: 254708374149
 *             failed_payment:
 *               summary: Failed Payment Callback
 *               value:
 *                 Body:
 *                   stkCallback:
 *                     MerchantRequestID: "29115-34620561-1"
 *                     CheckoutRequestID: "ws_CO_191220191020363925"
 *                     ResultCode: 1032
 *                     ResultDesc: "Request cancelled by user"
 *     responses:
 *       200:
 *         description: Callback processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookResponse'
 *       400:
 *         description: Invalid callback payload
 *       500:
 *         description: Internal processing error
 *     x-internal: true
 */
router.post('/mpesa/callback',
  rateLimitMiddleware.webhook,
  webhookMiddleware.mpesaValidation,
  async (req, res) => {
    const webhookId = require('crypto').randomUUID();

    logger.info('M-Pesa webhook received', {
      webhookId,
      provider: 'mpesa',
      userAgent: req.get('user-agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    // Respond to M-Pesa immediately to prevent retries
    // Process callback asynchronously after response
    res.status(200).json({
      success: true,
      message: 'Callback received and processing',
      timestamp: new Date().toISOString()
    });

    // Process callback asynchronously
    setImmediate(async () => {
      const operationContext = logger.startOperation('mpesa_webhook_processing', {
        webhookId,
        provider: 'mpesa',
        checkoutRequestId: req.body?.Body?.stkCallback?.CheckoutRequestID
      });

      try {
        await WebhookController.processMpesaCallback(req.body, {
          userAgent: req.get('user-agent'),
          ip: req.ip,
          webhookId
        });

        logger.endOperation(operationContext, true, {
          processed: true
        });

      } catch (error) {
        logger.endOperation(operationContext, false, error);

        // Log webhook processing error but don't affect the response
        // since we already responded to M-Pesa
        logger.error('M-Pesa webhook processing failed', {
          webhookId,
          error: error.message,
          callbackData: JSON.stringify(req.body, null, 2)
        });
      }
    });
  }
);

/**
 * @swagger
 * /api/webhooks/mpesa/timeout:
 *   post:
 *     summary: M-Pesa timeout callback
 *     description: |
 *       Receives timeout notifications from M-Pesa when a payment request expires.
 *       This helps update transaction status when customers don't respond to STK prompts.
 *     tags:
 *       - Webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               Body:
 *                 type: object
 *                 properties:
 *                   stkCallback:
 *                     type: object
 *                     properties:
 *                       CheckoutRequestID:
 *                         type: string
 *                         example: "ws_CO_191220191020363925"
 *                       ResultCode:
 *                         type: integer
 *                         example: 1037
 *                       ResultDesc:
 *                         type: string
 *                         example: "STK Push Timeout"
 *     responses:
 *       200:
 *         description: Timeout processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookResponse'
 *     x-internal: true
 */
router.post('/mpesa/timeout',
  rateLimitMiddleware.webhook,
  webhookMiddleware.mpesaValidation,
  async (req, res) => {
    const webhookId = require('crypto').randomUUID();

    logger.info('M-Pesa timeout webhook received', {
      webhookId,
      provider: 'mpesa',
      checkoutRequestId: req.body?.Body?.stkCallback?.CheckoutRequestID,
      timestamp: new Date().toISOString()
    });

    // Respond immediately
    res.status(200).json({
      success: true,
      message: 'Timeout callback received and processing',
      timestamp: new Date().toISOString()
    });

    // Process timeout asynchronously
    setImmediate(async () => {
      const operationContext = logger.startOperation('mpesa_timeout_processing', {
        webhookId,
        provider: 'mpesa',
        checkoutRequestId: req.body?.Body?.stkCallback?.CheckoutRequestID
      });

      try {
        await WebhookController.processMpesaTimeout(req.body, {
          userAgent: req.get('user-agent'),
          ip: req.ip,
          webhookId
        });

        logger.endOperation(operationContext, true, {
          processed: true
        });

      } catch (error) {
        logger.endOperation(operationContext, false, error);

        logger.error('M-Pesa timeout processing failed', {
          webhookId,
          error: error.message,
          callbackData: JSON.stringify(req.body, null, 2)
        });
      }
    });
  }
);

/**
 * @swagger
 * /api/webhooks/stripe/callback:
 *   post:
 *     summary: Stripe webhook callback
 *     description: |
 *       Receives event notifications from Stripe for payment status updates.
 *       This endpoint processes various Stripe events like payment_intent.succeeded,
 *       payment_intent.payment_failed, etc.
 *
 *       **Note**: This endpoint is prepared for future Stripe integration
 *       and is not currently active.
 *     tags:
 *       - Webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: "evt_1234567890"
 *               object:
 *                 type: string
 *                 example: "event"
 *               type:
 *                 type: string
 *                 example: "payment_intent.succeeded"
 *               data:
 *                 type: object
 *                 properties:
 *                   object:
 *                     type: object
 *                     description: The Stripe object that triggered the event
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookResponse'
 *       400:
 *         description: Invalid signature or payload
 *       404:
 *         description: Stripe provider not enabled
 *     x-internal: true
 */
router.post('/stripe/callback',
  rateLimitMiddleware.webhook,
  webhookMiddleware.stripeValidation,
  async (req, res) => {
    const webhookId = require('crypto').randomUUID();

    logger.info('Stripe webhook received', {
      webhookId,
      provider: 'stripe',
      eventType: req.body?.type,
      eventId: req.body?.id,
      timestamp: new Date().toISOString()
    });

    try {
      const result = await WebhookController.processStripeCallback(req.body, {
        signature: req.get('stripe-signature'),
        userAgent: req.get('user-agent'),
        ip: req.ip,
        webhookId
      });

      res.status(200).json({
        success: true,
        message: 'Stripe webhook processed successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Stripe webhook processing failed', {
        webhookId,
        error: error.message,
        eventType: req.body?.type,
        eventId: req.body?.id
      });

      const statusCode = error.getHttpStatus ? error.getHttpStatus() : 500;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Webhook processing failed',
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @swagger
 * /api/webhooks/test:
 *   post:
 *     summary: Test webhook endpoint
 *     description: |
 *       Test endpoint for webhook functionality. Only available in development
 *       and testing environments. Used for integration testing and debugging.
 *     tags:
 *       - Webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [mpesa, stripe]
 *                 example: "mpesa"
 *               transactionId:
 *                 type: string
 *                 example: "test_txn_123"
 *               status:
 *                 type: string
 *                 enum: [completed, failed, cancelled]
 *                 example: "completed"
 *               amount:
 *                 type: number
 *                 example: 1000
 *     responses:
 *       200:
 *         description: Test webhook processed
 *       404:
 *         description: Not available in production
 *       400:
 *         description: Invalid test payload
 *     x-internal: true
 */
router.post('/test',
  webhookMiddleware.testEnvironmentOnly,
  async (req, res) => {
    const webhookId = require('crypto').randomUUID();

    logger.info('Test webhook received', {
      webhookId,
      provider: req.body?.provider,
      transactionId: req.body?.transactionId,
      status: req.body?.status,
      environment: process.env.NODE_ENV
    });

    try {
      const result = await WebhookController.processTestWebhook(req.body, {
        webhookId,
        ip: req.ip
      });

      res.status(200).json({
        success: true,
        message: 'Test webhook processed successfully',
        result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Test webhook processing failed', {
        webhookId,
        error: error.message,
        payload: req.body
      });

      res.status(400).json({
        success: false,
        message: error.message || 'Test webhook processing failed',
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @swagger
 * /api/webhooks/health:
 *   get:
 *     summary: Webhook endpoint health check
 *     description: |
 *       Health check endpoint for webhook processing. Returns the status
 *       of webhook handlers and any recent processing statistics.
 *     tags:
 *       - Webhooks
 *     responses:
 *       200:
 *         description: Webhook system is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: "healthy"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 providers:
 *                   type: object
 *                   properties:
 *                     mpesa:
 *                       type: object
 *                       properties:
 *                         enabled:
 *                           type: boolean
 *                         lastCallback:
 *                           type: string
 *                           format: date-time
 *                         totalCallbacks:
 *                           type: integer
 *                     stripe:
 *                       type: object
 *                       properties:
 *                         enabled:
 *                           type: boolean
 *                         lastCallback:
 *                           type: string
 *                           format: date-time
 *                         totalCallbacks:
 *                           type: integer
 *       500:
 *         description: Webhook system has issues
 */
router.get('/health',
  async (req, res) => {
    try {
      const healthStatus = await WebhookController.getWebhookHealth();

      res.status(200).json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        ...healthStatus
      });

    } catch (error) {
      logger.error('Webhook health check failed', {
        error: error.message
      });

      res.status(500).json({
        success: false,
        status: 'unhealthy',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

module.exports = router;