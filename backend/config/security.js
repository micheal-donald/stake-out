/**
 * Security Configuration
 *
 * Centralized security settings for helmet, rate limiting, and CORS
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

/**
 * Helmet configuration for security headers
 */
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for AdminJS
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow inline scripts for AdminJS
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000'],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for AdminJS compatibility
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: {
    policy: 'no-referrer'
  }
});

/**
 * Rate limiting configurations
 */

// General API rate limiter - 100 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for certain paths
  skip: (req) => {
    return req.path === '/health' || req.path === '/';
  }
});

// Strict limiter for authentication endpoints - 5 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: 'Too many login attempts, please try again later.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});

// Game action rate limiter - 30 requests per minute
const gameLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: {
    error: 'Too many game actions, please slow down.',
    code: 'GAME_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Payment endpoint rate limiter - 10 requests per 10 minutes
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: {
    error: 'Too many payment requests, please try again later.',
    code: 'PAYMENT_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Admin endpoint rate limiter - 50 requests per 10 minutes
const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
  message: {
    error: 'Too many admin requests, please try again later.',
    code: 'ADMIN_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Socket token endpoint rate limiter - 20 requests per minute
// Allows multiple reconnection attempts during network instability
// Rate limited per authenticated user (not IP) to prevent false positives
const socketLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Increased from 10 to handle: token refresh, page reloads, network reconnects
  message: {
    error: 'Too many socket token requests, please try again in a minute.',
    code: 'SOCKET_RATE_LIMIT_EXCEEDED',
    retryAfter: 60 // Seconds until limit resets
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests to prevent abuse
  // Use authenticated userId as key instead of IP to avoid blocking users on same network
  keyGenerator: (req) => {
    // If user is authenticated, use userId; otherwise fall back to IP
    return req.user?.userId ? `user_${req.user.userId}` : req.ip;
  },
  // Skip rate limiting for authenticated users, only apply to unauthenticated requests
  skip: (req, res) => {
    // Skip rate limiting for authenticated users, only apply to unauthenticated requests
    return !!req.user?.userId;
  }
});

/**
 * HTTPS enforcement middleware (for production)
 */
const enforceHTTPS = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    // Check X-Forwarded-Proto header (set by reverse proxies)
    const proto = req.get('X-Forwarded-Proto');

    if (proto === 'http') {
      return res.redirect(301, `https://${req.get('Host')}${req.url}`);
    }
  }
  next();
};

/**
 * Security headers for Socket.IO
 */
const socketSecurityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

module.exports = {
  helmetConfig,
  apiLimiter,
  authLimiter,
  gameLimiter,
  paymentLimiter,
  adminLimiter,
  socketLimiter,
  enforceHTTPS,
  socketSecurityHeaders
};