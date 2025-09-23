/**
 * Webhook Middleware
 *
 * Provides middleware functions for handling incoming webhooks from
 * payment providers. Includes signature verification, payload validation,
 * and security measures to ensure webhook authenticity.
 *
 * Features:
 * - Provider-specific signature verification
 * - Raw body preservation for signature validation
 * - Replay attack prevention
 * - IP whitelist validation
 * - Error handling and logging
 * - Webhook response formatting
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const PaymentError = require('../../errors/PaymentError');

/**
 * Webhook security configuration
 */
const WEBHOOK_CONFIG = {
  // M-Pesa webhook configuration
  mpesa: {
    allowedIPs: process.env.MPESA_WEBHOOK_IPS?.split(',') || [],
    secret: process.env.MPESA_WEBHOOK_SECRET,
    signatureHeader: 'x-safaricom-signature',
    maxAge: 300000 // 5 minutes
  },

  // Generic webhook configuration
  default: {
    allowedIPs: process.env.WEBHOOK_ALLOWED_IPS?.split(',') || [],
    secret: process.env.WEBHOOK_SECRET,
    signatureHeader: 'x-webhook-signature',
    maxAge: 300000 // 5 minutes
  }
};

/**
 * Preserve raw body for signature verification
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function preserveRawBody(req, res, next) {
  try {
    // Raw body is already preserved in server.js during JSON parsing
    // This middleware ensures it's available for webhook verification
    if (!req.rawBody && req.body) {
      req.rawBody = Buffer.from(JSON.stringify(req.body));
    }

    next();
  } catch (error) {
    logger.error('Failed to preserve raw body', {
      error: error.message,
      path: req.path
    });

    next(error);
  }
}

/**
 * Validate webhook IP address
 *
 * @param {Array<string>} allowedIPs - List of allowed IP addresses
 * @returns {Function} Express middleware function
 */
function validateWebhookIP(allowedIPs = []) {
  return (req, res, next) => {
    // Skip IP validation if no IPs configured or in development
    if (allowedIPs.length === 0 || process.env.NODE_ENV === 'development') {
      return next();
    }

    const clientIP = req.ip || req.connection.remoteAddress;

    if (!allowedIPs.includes(clientIP)) {
      logger.warn('Webhook from unauthorized IP', {
        ip: clientIP,
        allowedIPs,
        path: req.path,
        userAgent: req.get('User-Agent')
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: 'IP address not authorized for webhooks',
        timestamp: new Date().toISOString()
      });
    }

    logger.debug('Webhook IP validated', {
      ip: clientIP,
      path: req.path
    });

    next();
  };
}

/**
 * Verify webhook signature
 *
 * @param {Object} config - Webhook configuration
 * @returns {Function} Express middleware function
 */
function verifyWebhookSignature(config) {
  return (req, res, next) => {
    try {
      // Skip signature verification if no secret configured
      if (!config.secret) {
        logger.warn('Webhook signature verification skipped - no secret configured', {
          provider: config.provider || 'unknown',
          path: req.path
        });
        return next();
      }

      const signature = req.get(config.signatureHeader);
      if (!signature) {
        throw new PaymentError(
          'MISSING_WEBHOOK_SIGNATURE',
          'Webhook signature header missing',
          'AUTHENTICATION_ERROR'
        );
      }

      // Get raw body for signature verification
      const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));

      // Verify signature based on provider
      let isValid = false;

      if (config.provider === 'mpesa') {
        isValid = verifyMpesaSignature(payload, signature, config.secret);
      } else {
        isValid = verifyGenericSignature(payload, signature, config.secret);
      }

      if (!isValid) {
        logger.error('Webhook signature verification failed', {
          provider: config.provider || 'unknown',
          path: req.path,
          signatureProvided: !!signature,
          payloadSize: payload.length
        });

        throw new PaymentError(
          'INVALID_WEBHOOK_SIGNATURE',
          'Webhook signature verification failed',
          'AUTHENTICATION_ERROR'
        );
      }

      logger.debug('Webhook signature verified', {
        provider: config.provider || 'unknown',
        path: req.path
      });

      next();

    } catch (error) {
      logger.error('Webhook signature verification error', {
        error: error.message,
        path: req.path,
        provider: config.provider || 'unknown'
      });

      if (error instanceof PaymentError) {
        return res.status(401).json({
          error: error.type,
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }

      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Signature verification failed',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Verify M-Pesa webhook signature
 *
 * @param {Buffer} payload - Raw payload
 * @param {string} signature - Provided signature
 * @param {string} secret - Webhook secret
 * @returns {boolean} Verification result
 */
function verifyMpesaSignature(payload, signature, secret) {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error('M-Pesa signature verification failed', {
      error: error.message
    });
    return false;
  }
}

/**
 * Verify generic webhook signature
 *
 * @param {Buffer} payload - Raw payload
 * @param {string} signature - Provided signature
 * @param {string} secret - Webhook secret
 * @returns {boolean} Verification result
 */
function verifyGenericSignature(payload, signature, secret) {
  try {
    // Support both sha256= prefixed and raw signatures
    const cleanSignature = signature.startsWith('sha256=')
      ? signature.substring(7)
      : signature;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(cleanSignature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error('Generic signature verification failed', {
      error: error.message
    });
    return false;
  }
}

/**
 * Prevent replay attacks by checking timestamp
 *
 * @param {number} maxAge - Maximum age in milliseconds
 * @returns {Function} Express middleware function
 */
function preventReplayAttacks(maxAge = 300000) {
  return (req, res, next) => {
    try {
      const timestamp = req.get('x-webhook-timestamp') || req.body.timestamp;

      if (!timestamp) {
        logger.warn('Webhook timestamp missing', {
          path: req.path,
          headers: req.headers
        });
        // Don't fail if timestamp is missing - some providers don't send it
        return next();
      }

      const webhookTime = new Date(parseInt(timestamp) * 1000);
      const currentTime = new Date();
      const age = currentTime - webhookTime;

      if (age > maxAge) {
        logger.warn('Webhook replay attack detected', {
          path: req.path,
          webhookTime: webhookTime.toISOString(),
          currentTime: currentTime.toISOString(),
          age,
          maxAge
        });

        return res.status(400).json({
          error: 'Bad Request',
          message: 'Webhook timestamp too old',
          timestamp: new Date().toISOString()
        });
      }

      next();

    } catch (error) {
      logger.error('Replay attack prevention error', {
        error: error.message,
        path: req.path
      });

      // Continue processing if timestamp validation fails
      next();
    }
  };
}

/**
 * Add webhook context to request
 *
 * @param {string} provider - Provider name
 * @returns {Function} Express middleware function
 */
function addWebhookContext(provider) {
  return (req, res, next) => {
    req.webhookContext = {
      provider,
      receivedAt: new Date(),
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId
    };

    logger.info('Webhook received', {
      provider,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId
    });

    next();
  };
}

/**
 * Create M-Pesa webhook middleware stack
 *
 * @returns {Array<Function>} Middleware functions
 */
function createMpesaWebhookMiddleware() {
  const config = {
    ...WEBHOOK_CONFIG.mpesa,
    provider: 'mpesa'
  };

  return [
    preserveRawBody,
    addWebhookContext('mpesa'),
    validateWebhookIP(config.allowedIPs),
    verifyWebhookSignature(config),
    preventReplayAttacks(config.maxAge)
  ];
}

/**
 * Create generic webhook middleware stack
 *
 * @param {string} provider - Provider name
 * @returns {Array<Function>} Middleware functions
 */
function createGenericWebhookMiddleware(provider) {
  const config = {
    ...WEBHOOK_CONFIG.default,
    provider
  };

  return [
    preserveRawBody,
    addWebhookContext(provider),
    validateWebhookIP(config.allowedIPs),
    verifyWebhookSignature(config),
    preventReplayAttacks(config.maxAge)
  ];
}

/**
 * Handle webhook processing errors
 *
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function handleWebhookError(error, req, res, next) {
  logger.error('Webhook processing error', {
    error: error.message,
    stack: error.stack,
    provider: req.webhookContext?.provider,
    path: req.path,
    requestId: req.requestId
  });

  if (res.headersSent) {
    return next(error);
  }

  // Return appropriate error response
  const statusCode = error.status || error.statusCode || 500;

  res.status(statusCode).json({
    error: error.type || 'Webhook Processing Error',
    message: error.message || 'Failed to process webhook',
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
}

/**
 * M-Pesa webhook validation middleware
 */
const mpesaValidation = [
  preserveRawBody,
  addWebhookContext('mpesa'),
  validateWebhookIP(WEBHOOK_CONFIG.mpesa.allowedIPs),
  // Signature verification disabled for now as M-Pesa doesn't always send signatures
  preventReplayAttacks(WEBHOOK_CONFIG.mpesa.maxAge)
];

/**
 * Stripe webhook validation middleware
 */
const stripeValidation = [
  preserveRawBody,
  addWebhookContext('stripe'),
  validateWebhookIP(WEBHOOK_CONFIG.default.allowedIPs),
  verifyWebhookSignature({ ...WEBHOOK_CONFIG.default, provider: 'stripe' }),
  preventReplayAttacks(WEBHOOK_CONFIG.default.maxAge)
];

/**
 * Test environment only middleware
 */
const testEnvironmentOnly = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Test endpoints not available in production',
      timestamp: new Date().toISOString()
    });
  }
  next();
};

module.exports = {
  preserveRawBody,
  validateWebhookIP,
  verifyWebhookSignature,
  preventReplayAttacks,
  addWebhookContext,
  createMpesaWebhookMiddleware,
  createGenericWebhookMiddleware,
  handleWebhookError,
  verifyMpesaSignature,
  verifyGenericSignature,
  // Validation middleware for routes
  mpesaValidation,
  stripeValidation,
  testEnvironmentOnly
};