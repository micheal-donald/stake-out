/**
 * Webhook Security Middleware
 *
 * Provides security layers for webhook endpoints:
 * - IP whitelisting for M-Pesa callbacks
 * - Request validation
 * - Logging and monitoring
 */

const logger = require('../config/logger');

/**
 * M-Pesa Webhook IP Whitelist
 *
 * IMPORTANT: These are example IPs. Get actual IP ranges from:
 * - Safaricom Developer Portal: https://developer.safaricom.co.ke/
 * - Contact Safaricom support for production IPs
 *
 * Update this list in production with actual Safaricom IPs
 */
const MPESA_ALLOWED_IPS = (process.env.MPESA_WEBHOOK_IPS || '').split(',').filter(ip => ip.trim());

// Development/testing IPs (ngrok, localhost, etc.)
const DEV_ALLOWED_IPS = [
  '127.0.0.1',
  '::1',
  'localhost'
];

/**
 * Get client IP address from request
 * Handles proxied requests (nginx, load balancers)
 */
function getClientIP(req) {
  // Check X-Forwarded-For header (nginx, load balancer)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // Take first IP if multiple proxies
    return forwardedFor.split(',')[0].trim();
  }

  // Check X-Real-IP header (nginx)
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return realIP.trim();
  }

  // Fallback to direct connection IP
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
}

/**
 * Normalize IP address (handle IPv6 mapped IPv4)
 */
function normalizeIP(ip) {
  if (!ip) return '';

  // Handle IPv6 mapped IPv4 (::ffff:127.0.0.1 -> 127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }

  // Handle IPv6 localhost
  if (ip === '::1') {
    return '127.0.0.1';
  }

  return ip;
}

/**
 * Check if IP is in whitelist
 */
function isIPAllowed(ip, whitelist) {
  const normalizedIP = normalizeIP(ip);

  // Check exact match
  if (whitelist.includes(normalizedIP)) {
    return true;
  }

  // Check CIDR ranges (if implemented)
  // TODO: Add CIDR range checking if needed

  return false;
}

/**
 * IP Whitelist Middleware for M-Pesa Webhooks
 *
 * Usage:
 * router.post('/mpesa/callback', ipWhitelistMiddleware, handler);
 */
function ipWhitelistMiddleware(req, res, next) {
  const clientIP = getClientIP(req);
  const normalizedIP = normalizeIP(clientIP);

  // Build combined whitelist
  let allowedIPs = [];

  // In production, only use M-Pesa IPs
  if (process.env.NODE_ENV === 'production') {
    allowedIPs = MPESA_ALLOWED_IPS;

    if (allowedIPs.length === 0) {
      logger.error('CRITICAL: MPESA_WEBHOOK_IPS not configured in production!');
      return res.status(500).json({
        error: 'Webhook IP whitelist not configured'
      });
    }
  } else {
    // In development, allow both M-Pesa and dev IPs
    allowedIPs = [...MPESA_ALLOWED_IPS, ...DEV_ALLOWED_IPS];
  }

  // Check if IP is allowed
  if (!isIPAllowed(clientIP, allowedIPs)) {
    logger.logSecurity('WEBHOOK_IP_BLOCKED', null, {
      clientIP: normalizedIP,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent']
    });

    return res.status(403).json({
      error: 'Forbidden',
      code: 'IP_NOT_WHITELISTED'
    });
  }

  // Log successful IP validation
  logger.info('Webhook IP validated', {
    clientIP: normalizedIP,
    path: req.path
  });

  next();
}

/**
 * Webhook Request Validator
 *
 * Validates webhook payload structure before processing
 */
function webhookRequestValidator(req, res, next) {
  // Validate request body exists
  if (!req.body || Object.keys(req.body).length === 0) {
    logger.logSecurity('WEBHOOK_EMPTY_BODY', null, {
      ip: getClientIP(req),
      path: req.path
    });

    return res.status(400).json({
      error: 'Invalid request',
      code: 'EMPTY_BODY'
    });
  }

  // Validate Content-Type
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    logger.logSecurity('WEBHOOK_INVALID_CONTENT_TYPE', null, {
      ip: getClientIP(req),
      contentType,
      path: req.path
    });

    return res.status(400).json({
      error: 'Invalid Content-Type',
      code: 'INVALID_CONTENT_TYPE',
      expected: 'application/json'
    });
  }

  next();
}

/**
 * Webhook Timestamp Validator
 *
 * Prevents replay attacks by validating timestamp
 * M-Pesa callbacks should be recent (within 5 minutes)
 */
function webhookTimestampValidator(maxAgeMinutes = 5) {
  return (req, res, next) => {
    // Check if timestamp header exists (custom implementation)
    const timestamp = req.headers['x-webhook-timestamp'];

    if (!timestamp) {
      // If no timestamp header, skip validation (M-Pesa doesn't send this)
      // This is a placeholder for future enhancement
      return next();
    }

    const requestTime = parseInt(timestamp);
    const currentTime = Math.floor(Date.now() / 1000);
    const ageMinutes = (currentTime - requestTime) / 60;

    if (ageMinutes > maxAgeMinutes || ageMinutes < 0) {
      logger.logSecurity('WEBHOOK_TIMESTAMP_INVALID', null, {
        ip: getClientIP(req),
        timestamp: requestTime,
        ageMinutes,
        path: req.path
      });

      return res.status(403).json({
        error: 'Request timestamp invalid',
        code: 'TIMESTAMP_EXPIRED'
      });
    }

    next();
  };
}

/**
 * Combined Webhook Security Middleware
 *
 * Applies all security checks in order:
 * 1. IP whitelisting
 * 2. Request validation
 * 3. Timestamp validation (if applicable)
 *
 * Usage:
 * router.post('/webhook', webhookSecurityMiddleware, handler);
 */
const webhookSecurityMiddleware = [
  ipWhitelistMiddleware,
  webhookRequestValidator
];

module.exports = {
  ipWhitelistMiddleware,
  webhookRequestValidator,
  webhookTimestampValidator,
  webhookSecurityMiddleware,
  getClientIP,
  normalizeIP
};
