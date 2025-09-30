/**
 * CSRF Protection Middleware
 *
 * Modern CSRF protection using Double Submit Cookie pattern
 * Alternative to deprecated csurf package
 */

const crypto = require('crypto');
const logger = require('../config/logger');

/**
 * Generate a secure random CSRF token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF token generation middleware
 * Sets a CSRF token in both cookie and makes it available to views
 */
const generateCsrfToken = (req, res, next) => {
  // Check if token already exists in cookie
  let token = req.cookies.csrf_token;

  if (!token) {
    // Generate new token
    token = generateToken();

    // Set cookie with the token
    res.cookie('csrf_token', token, {
      httpOnly: false, // Must be accessible to JavaScript for sending in requests
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
  }

  // Make token available to request handler
  req.csrfToken = () => token;

  next();
};

/**
 * CSRF token validation middleware
 * Validates token from request header/body against cookie
 */
const validateCsrfToken = (req, res, next) => {
  // Skip CSRF validation for safe methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Skip CSRF validation for webhook endpoints (external callbacks)
  if (req.path.startsWith('/api/webhooks') || req.path.startsWith('/health')) {
    return next();
  }

  // Skip CSRF validation for Socket.IO (uses different auth mechanism)
  if (req.path.startsWith('/socket.io')) {
    return next();
  }

  // Skip CSRF for socket-token endpoint (GET request, read-only)
  if (req.path === '/api/socket-token' && req.method === 'GET') {
    return next();
  }

  // TODO: TEMPORARY - Skip CSRF for auth endpoints until frontend is updated
  // Remove this once frontend implements CSRF token handling
  if (req.path === '/api/register' ||
      req.path === '/api/login' ||
      req.path === '/api/logout' ||
      req.path === '/api/refresh') {
    logger.warn('CSRF validation temporarily disabled for auth endpoint', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    return next();
  }

  // Get token from cookie
  const cookieToken = req.cookies.csrf_token;

  // Get token from header or body
  const requestToken = req.get('X-CSRF-Token') ||
                       req.get('CSRF-Token') ||
                       req.body?._csrf ||
                       req.query?._csrf;

  // Validate tokens exist
  if (!cookieToken || !requestToken) {
    logger.logSecurity('CSRF_TOKEN_MISSING', req.user?.userId, {
      ip: req.ip,
      path: req.path,
      method: req.method,
      hasCookie: !!cookieToken,
      hasRequest: !!requestToken
    });

    return res.status(403).json({
      error: 'CSRF token missing',
      code: 'CSRF_MISSING'
    });
  }

  // Validate tokens match using timing-safe comparison
  if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(requestToken))) {
    logger.logSecurity('CSRF_TOKEN_INVALID', req.user?.userId, {
      ip: req.ip,
      path: req.path,
      method: req.method
    });

    return res.status(403).json({
      error: 'Invalid CSRF token',
      code: 'CSRF_INVALID'
    });
  }

  // Token is valid
  next();
};

/**
 * Endpoint to get CSRF token (for SPAs)
 */
const getCsrfToken = (req, res) => {
  res.json({
    csrfToken: req.csrfToken()
  });
};

/**
 * Combined CSRF middleware for convenience
 */
const csrfProtection = [generateCsrfToken, validateCsrfToken];

module.exports = {
  generateCsrfToken,
  validateCsrfToken,
  csrfProtection,
  getCsrfToken
};