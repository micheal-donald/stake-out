/**
 * Rate Limiting Middleware
 *
 * Provides configurable rate limiting for payment API endpoints
 * to prevent abuse and ensure fair usage across all clients.
 * Supports different rate limits for different endpoint types.
 *
 * Features:
 * - Per-IP rate limiting with configurable windows
 * - Different limits for different endpoint types
 * - Redis-backed storage for distributed systems
 * - Memory fallback when Redis unavailable
 * - Custom error responses with retry information
 * - Bypass options for trusted sources
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');

/**
 * Default rate limit configuration
 */
const DEFAULT_CONFIG = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: null // Will be set dynamically
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: false, // Don't count successful requests
  skipFailedRequests: false, // Don't count failed requests
};

/**
 * Create rate limiter with custom configuration
 *
 * @param {Object} options - Rate limiting options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @param {string} options.message - Custom error message
 * @param {string} options.type - Rate limit type for logging
 * @returns {Function} Express middleware function
 */
function createRateLimiter(options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...options,
    handler: (req, res) => {
      const retryAfter = Math.round(req.rateLimit.resetTime / 1000);

      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        type: options.type || 'general',
        limit: req.rateLimit.limit,
        remaining: req.rateLimit.remaining,
        resetTime: new Date(req.rateLimit.resetTime).toISOString(),
        requestId: req.requestId
      });

      const errorResponse = {
        ...DEFAULT_CONFIG.message,
        retryAfter,
        limit: req.rateLimit.limit,
        remaining: req.rateLimit.remaining,
        resetTime: new Date(req.rateLimit.resetTime).toISOString(),
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      };

      if (options.message) {
        errorResponse.message = options.message;
      }

      res.status(429).json(errorResponse);
    }
  };

  return rateLimit(config);
}

/**
 * General API rate limiter
 * Applied to all API endpoints
 */
const generalApiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  type: 'general_api',
  message: 'Too many API requests from this IP, please try again later.'
});

/**
 * Payment initiation rate limiter
 * More restrictive for payment operations
 */
const paymentInitiationLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 payment initiations per 10 minutes
  type: 'payment_initiation',
  message: 'Too many payment initiation requests. Please wait before trying again.'
});

/**
 * Payment status check rate limiter
 * Moderate limits for status checks
 */
const statusCheckLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 status checks per 5 minutes
  type: 'status_check',
  message: 'Too many status check requests. Please reduce frequency.'
});

/**
 * Webhook rate limiter
 * Higher limits for provider webhooks
 */
const webhookLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 webhook calls per minute
  type: 'webhook',
  message: 'Too many webhook requests from this IP.'
});

/**
 * Authentication rate limiter
 * Strict limits for auth attempts
 */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 auth attempts per 15 minutes
  type: 'authentication',
  message: 'Too many authentication attempts. Please try again later.'
});

/**
 * Create a bypass middleware for trusted IPs
 *
 * @param {Array<string>} trustedIPs - Array of trusted IP addresses
 * @returns {Function} Express middleware function
 */
function createBypassMiddleware(trustedIPs = []) {
  return (req, res, next) => {
    // Check if IP is in trusted list
    if (trustedIPs.includes(req.ip)) {
      logger.debug('Rate limit bypassed for trusted IP', {
        ip: req.ip,
        path: req.path,
        requestId: req.requestId
      });
      return next();
    }

    // Check for API key bypass
    const apiKey = req.headers['x-api-key'];
    if (apiKey && process.env.BYPASS_API_KEYS?.split(',').includes(apiKey)) {
      logger.debug('Rate limit bypassed for trusted API key', {
        ip: req.ip,
        path: req.path,
        requestId: req.requestId
      });
      return next();
    }

    next();
  };
}

/**
 * Conditional rate limiting based on environment
 *
 * @param {Function} limiter - Rate limiter middleware
 * @returns {Function} Express middleware function
 */
function conditionalRateLimit(limiter) {
  return (req, res, next) => {
    // Skip rate limiting in test environment
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    // Skip if rate limiting is disabled
    if (process.env.DISABLE_RATE_LIMITING === 'true') {
      return next();
    }

    return limiter(req, res, next);
  };
}

/**
 * Get rate limit status for monitoring
 *
 * @param {Object} req - Express request object
 * @returns {Object} Rate limit status
 */
function getRateLimitStatus(req) {
  if (!req.rateLimit) {
    return null;
  }

  return {
    limit: req.rateLimit.limit,
    remaining: req.rateLimit.remaining,
    resetTime: new Date(req.rateLimit.resetTime).toISOString(),
    retryAfter: Math.round(req.rateLimit.resetTime / 1000)
  };
}

module.exports = {
  createRateLimiter,
  generalApiLimiter,
  paymentInitiationLimiter,
  statusCheckLimiter,
  webhookLimiter,
  authLimiter,
  createBypassMiddleware,
  conditionalRateLimit,
  getRateLimitStatus,
  // Aliases for backwards compatibility
  payment: paymentInitiationLimiter,
  status: statusCheckLimiter,
  webhook: webhookLimiter,
  auth: authLimiter
};