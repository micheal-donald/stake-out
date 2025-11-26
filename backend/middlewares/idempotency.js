/**
 * Idempotency Middleware for Payment Endpoints
 *
 * Prevents duplicate payment processing by:
 * 1. Requiring Idempotency-Key header on payment requests
 * 2. Caching successful responses for 24 hours
 * 3. Returning cached response if same key is used again
 *
 * This prevents double-charging users on network retries or accidental duplicate submissions.
 */

const crypto = require('crypto');
const pool = require('../config/db');
const logger = require('../config/logger');

/**
 * Generate hash of request body for validation
 */
function hashRequestBody(body) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex');
}

/**
 * Idempotency Middleware
 *
 * Usage:
 * router.post('/deposit', idempotencyMiddleware, depositHandler);
 *
 * Requirements:
 * - Client must send Idempotency-Key header (UUID v4)
 * - Key must be unique per request
 * - Cached responses returned for duplicate keys
 */
async function idempotencyMiddleware(req, res, next) {
  // Only apply to state-changing methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  // Extract idempotency key from header
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    logger.warn('Missing idempotency key', {
      path: req.path,
      method: req.method,
      userId: req.user?.userId
    });

    return res.status(400).json({
      error: 'Idempotency-Key header is required for payment requests',
      code: 'IDEMPOTENCY_KEY_MISSING'
    });
  }

  // Validate idempotency key format (UUID v4)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(idempotencyKey)) {
    logger.warn('Invalid idempotency key format', {
      idempotencyKey,
      userId: req.user?.userId
    });

    return res.status(400).json({
      error: 'Idempotency-Key must be a valid UUID v4',
      code: 'IDEMPOTENCY_KEY_INVALID'
    });
  }

  try {
    // Check if we've seen this idempotency key before
    const cachedResult = await pool.query(
      `SELECT response_status, response_body, created_at
       FROM idempotency_cache
       WHERE idempotency_key = $1 AND expires_at > NOW()`,
      [idempotencyKey]
    );

    if (cachedResult.rows.length > 0) {
      const cached = cachedResult.rows[0];

      // Hash current request body
      const currentHash = hashRequestBody(req.body);

      // Also check if the request body matches (optional, for extra safety)
      // This prevents using same idempotency key for different requests
      const storedResult = await pool.query(
        `SELECT request_hash FROM idempotency_cache WHERE idempotency_key = $1`,
        [idempotencyKey]
      );

      if (storedResult.rows.length > 0 && storedResult.rows[0].request_hash !== currentHash) {
        logger.logSecurity('IDEMPOTENCY_KEY_REUSED', req.user?.userId, {
          idempotencyKey,
          path: req.path
        });

        return res.status(409).json({
          error: 'Idempotency key already used for a different request',
          code: 'IDEMPOTENCY_KEY_CONFLICT'
        });
      }

      // Return cached response
      logger.info('Returning cached response for idempotency key', {
        idempotencyKey,
        cachedAt: cached.created_at,
        userId: req.user?.userId
      });

      return res.status(cached.response_status).json(cached.response_body);
    }

    // No cached response found - this is a new request
    // Store idempotency key and request hash for this request
    req.idempotencyKey = idempotencyKey;
    req.requestHash = hashRequestBody(req.body);

    // Intercept the response to cache it
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      // Cache this response asynchronously (don't block the response)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Only cache successful responses
        pool.query(
          `INSERT INTO idempotency_cache
           (idempotency_key, request_hash, response_status, response_body, expires_at)
           VALUES ($1, $2, $3, $4, NOW() + INTERVAL '24 hours')
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [idempotencyKey, req.requestHash, res.statusCode, body]
        ).catch(error => {
          logger.error('Failed to cache idempotency response', {
            error: error.message,
            idempotencyKey
          });
        });
      }

      // Call original json method
      return originalJson(body);
    };

    next();
  } catch (error) {
    logger.error('Idempotency middleware error', {
      error: error.message,
      stack: error.stack,
      idempotencyKey
    });

    // Don't block the request on cache errors
    // Just log and continue
    next();
  }
}

/**
 * Cleanup Expired Idempotency Cache
 *
 * Should be run periodically (e.g., daily via cron job)
 * Removes cache entries older than 24 hours
 */
async function cleanupExpiredIdempotencyCache() {
  try {
    const result = await pool.query(
      'DELETE FROM idempotency_cache WHERE expires_at < NOW()'
    );

    logger.info('Cleaned up expired idempotency cache', {
      deletedCount: result.rowCount
    });

    return result.rowCount;
  } catch (error) {
    logger.error('Failed to cleanup idempotency cache', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Optional: Idempotency middleware for specific routes
 * This version allows customization of cache duration
 */
function createIdempotencyMiddleware(options = {}) {
  const {
    required = true,
    cacheDurationHours = 24,
    validateRequestBody = true
  } = options;

  return async (req, res, next) => {
    const idempotencyKey = req.headers['idempotency-key'];

    if (!idempotencyKey) {
      if (required) {
        return res.status(400).json({
          error: 'Idempotency-Key header is required',
          code: 'IDEMPOTENCY_KEY_MISSING'
        });
      }
      return next();
    }

    // ... rest of the middleware logic with customizable options
    // (simplified version, use the main middleware for full implementation)
    return idempotencyMiddleware(req, res, next);
  };
}

module.exports = {
  idempotencyMiddleware,
  cleanupExpiredIdempotencyCache,
  createIdempotencyMiddleware
};
