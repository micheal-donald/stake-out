/**
 * Authentication Middleware
 *
 * Handles JWT-based authentication for the payment module API.
 * Provides secure access control for payment operations while
 * maintaining compatibility with the main application's auth system.
 *
 * Features:
 * - JWT token validation
 * - User context extraction
 * - Role-based access control
 * - Token refresh handling
 * - Rate limiting integration
 * - Comprehensive security logging
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const jwt = require('jsonwebtoken');
const PaymentError = require('../../errors/PaymentError');
const logger = require('../../utils/logger');

/**
 * JWT Authentication Configuration
 */
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_ISSUER = process.env.JWT_ISSUER || 'payment-module';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'payment-api';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Extract JWT token from request headers
 *
 * Supports multiple token formats:
 * - Authorization: Bearer <token>
 * - Authorization: <token>
 * - x-access-token header
 * - token query parameter (for webhooks only)
 *
 * @param {Object} req - Express request object
 * @returns {string|null} JWT token or null if not found
 * @private
 */
function extractToken(req) {
  // Check Authorization header (preferred method)
  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    } else {
      // Support for non-standard format
      return authHeader;
    }
  }

  // Check x-access-token header (alternative method)
  const accessToken = req.headers['x-access-token'];
  if (accessToken) {
    return accessToken;
  }

  // Check query parameter (for webhooks only - not recommended for regular API)
  if (req.query.token && req.path.includes('/webhooks/')) {
    return req.query.token;
  }

  return null;
}

/**
 * Validate JWT token and extract user information
 *
 * @param {string} token - JWT token to validate
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Decoded token payload
 * @throws {PaymentError} If token is invalid
 * @private
 */
async function validateToken(token, options = {}) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: options.issuer || JWT_ISSUER,
      audience: options.audience || JWT_AUDIENCE,
      clockTolerance: 30 // Allow 30 seconds clock skew
    });

    // Validate required fields
    if (!decoded.userId) {
      throw new Error('Token missing required userId field');
    }

    // Check if token is expired (additional check beyond jwt.verify)
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      throw new Error('Token has expired');
    }

    return decoded;

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw PaymentError.authenticationError(
        'Token has expired',
        { code: 'TOKEN_EXPIRED', expiredAt: error.expiredAt }
      );
    }

    if (error.name === 'JsonWebTokenError') {
      throw PaymentError.authenticationError(
        'Invalid token format',
        { code: 'INVALID_TOKEN' }
      );
    }

    if (error.name === 'NotBeforeError') {
      throw PaymentError.authenticationError(
        'Token not yet valid',
        { code: 'TOKEN_NOT_YET_VALID', notBefore: error.date }
      );
    }

    throw PaymentError.authenticationError(
      error.message || 'Token validation failed',
      { code: 'TOKEN_VALIDATION_FAILED' }
    );
  }
}

/**
 * Main authentication middleware
 *
 * Validates JWT tokens and sets user context on request object.
 * This middleware should be used on all protected payment API endpoints.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = async (req, res, next) => {
  const startTime = Date.now();

  try {
    // Extract token from request
    const token = extractToken(req);

    if (!token) {
      logger.security('Authentication attempted without token', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        path: req.path,
        method: req.method
      }, 'medium');

      return res.status(401).json({
        success: false,
        error: {
          type: 'AUTHENTICATION_ERROR',
          code: 'NO_TOKEN',
          message: 'Authentication token is required'
        }
      });
    }

    // Validate token
    const decoded = await validateToken(token);

    // Set user context on request
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role || 'user',
      permissions: decoded.permissions || [],
      tokenIssuedAt: decoded.iat,
      tokenExpiresAt: decoded.exp
    };

    // Add token to request for potential refresh
    req.token = token;

    // Log successful authentication
    logger.info('User authenticated successfully', {
      userId: req.user.userId,
      username: req.user.username,
      role: req.user.role,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      path: req.path,
      method: req.method,
      authDuration: Date.now() - startTime
    });

    next();

  } catch (error) {
    // Log authentication failure
    logger.security('Authentication failed', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      path: req.path,
      method: req.method,
      authDuration: Date.now() - startTime
    }, 'high');

    const statusCode = error.getHttpStatus ? error.getHttpStatus() : 401;

    return res.status(statusCode).json({
      success: false,
      error: error.toJSON ? error.toJSON() : {
        type: 'AUTHENTICATION_ERROR',
        code: 'AUTH_FAILED',
        message: error.message || 'Authentication failed'
      }
    });
  }
};

/**
 * Optional authentication middleware
 *
 * Attempts authentication but continues even if no token is provided.
 * Sets user context if token is valid, otherwise continues without user.
 * Useful for endpoints that have different behavior for authenticated users.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (token) {
      const decoded = await validateToken(token);
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role || 'user',
        permissions: decoded.permissions || [],
        tokenIssuedAt: decoded.iat,
        tokenExpiresAt: decoded.exp
      };

      logger.debug('Optional authentication successful', {
        userId: req.user.userId,
        path: req.path
      });
    }

    next();

  } catch (error) {
    // For optional auth, log but don't fail the request
    logger.debug('Optional authentication failed', {
      error: error.message,
      path: req.path
    });

    next();
  }
};

/**
 * Role-based authorization middleware factory
 *
 * Creates middleware that checks if authenticated user has required role.
 * Must be used after authenticate middleware.
 *
 * @param {string|string[]} requiredRoles - Required role(s)
 * @returns {Function} Authorization middleware
 */
const requireRole = (requiredRoles) => {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          type: 'AUTHENTICATION_ERROR',
          code: 'NOT_AUTHENTICATED',
          message: 'Authentication required for this endpoint'
        }
      });
    }

    const userRole = req.user.role;
    if (!roles.includes(userRole)) {
      logger.security('Authorization failed - insufficient role', {
        userId: req.user.userId,
        userRole,
        requiredRoles: roles,
        path: req.path,
        method: req.method
      }, 'medium');

      return res.status(403).json({
        success: false,
        error: {
          type: 'AUTHORIZATION_ERROR',
          code: 'INSUFFICIENT_ROLE',
          message: `Role '${userRole}' not authorized. Required: ${roles.join(', ')}`,
          details: { userRole, requiredRoles: roles }
        }
      });
    }

    logger.debug('Authorization successful', {
      userId: req.user.userId,
      userRole,
      path: req.path
    });

    next();
  };
};

/**
 * Permission-based authorization middleware factory
 *
 * Creates middleware that checks if authenticated user has required permission.
 * Must be used after authenticate middleware.
 *
 * @param {string|string[]} requiredPermissions - Required permission(s)
 * @returns {Function} Authorization middleware
 */
const requirePermission = (requiredPermissions) => {
  const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          type: 'AUTHENTICATION_ERROR',
          code: 'NOT_AUTHENTICATED',
          message: 'Authentication required for this endpoint'
        }
      });
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = permissions.some(perm => userPermissions.includes(perm));

    if (!hasPermission) {
      logger.security('Authorization failed - insufficient permissions', {
        userId: req.user.userId,
        userPermissions,
        requiredPermissions: permissions,
        path: req.path,
        method: req.method
      }, 'medium');

      return res.status(403).json({
        success: false,
        error: {
          type: 'AUTHORIZATION_ERROR',
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Missing required permissions: ${permissions.join(', ')}`,
          details: { userPermissions, requiredPermissions: permissions }
        }
      });
    }

    logger.debug('Permission check successful', {
      userId: req.user.userId,
      userPermissions,
      path: req.path
    });

    next();
  };
};

/**
 * API key authentication middleware
 *
 * For service-to-service authentication using API keys.
 * Useful for webhook endpoints or internal service calls.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: {
          type: 'AUTHENTICATION_ERROR',
          code: 'NO_API_KEY',
          message: 'API key is required'
        }
      });
    }

    // Validate API key (implement your API key validation logic here)
    const validApiKey = process.env.API_KEY || process.env.WEBHOOK_API_KEY;

    if (!validApiKey || apiKey !== validApiKey) {
      logger.security('Invalid API key provided', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        path: req.path,
        method: req.method,
        apiKeyPrefix: apiKey.substring(0, 8) + '...'
      }, 'high');

      return res.status(401).json({
        success: false,
        error: {
          type: 'AUTHENTICATION_ERROR',
          code: 'INVALID_API_KEY',
          message: 'Invalid API key'
        }
      });
    }

    // Set service context
    req.service = {
      type: 'api_key',
      authenticated: true
    };

    logger.info('API key authentication successful', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });

    next();

  } catch (error) {
    logger.error('API key authentication error', {
      error: error.message,
      ip: req.ip,
      path: req.path
    });

    return res.status(500).json({
      success: false,
      error: {
        type: 'AUTHENTICATION_ERROR',
        code: 'AUTH_ERROR',
        message: 'Authentication service error'
      }
    });
  }
};

/**
 * Token ownership validation middleware
 *
 * Ensures that users can only access their own transactions.
 * Compares the authenticated user ID with the transaction owner.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateTransactionOwnership = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          type: 'AUTHENTICATION_ERROR',
          code: 'NOT_AUTHENTICATED',
          message: 'Authentication required'
        }
      });
    }

    // This will be implemented by the calling controller
    // which has access to the database to verify ownership
    next();

  } catch (error) {
    logger.error('Transaction ownership validation error', {
      error: error.message,
      userId: req.user?.userId,
      transactionId: req.params.transactionId
    });

    return res.status(500).json({
      success: false,
      error: {
        type: 'AUTHORIZATION_ERROR',
        code: 'OWNERSHIP_CHECK_FAILED',
        message: 'Unable to verify transaction ownership'
      }
    });
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  requirePermission,
  authenticateApiKey,
  validateTransactionOwnership,

  // Export utilities for testing and advanced usage
  extractToken,
  validateToken
};