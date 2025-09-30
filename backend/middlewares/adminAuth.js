/**
 * Admin Authentication and Authorization Middleware
 *
 * Provides role-based access control for admin functionality
 * Includes audit logging and enhanced security for admin operations
 */

const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * Role hierarchy for permission checking
 */
const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  USER: 'user'
};

/**
 * Role permissions mapping
 */
const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: ['read', 'write', 'delete', 'manage_admins', 'system_settings'],
  [ROLES.ADMIN]: ['read', 'write', 'delete', 'user_management'],
  [ROLES.MODERATOR]: ['read', 'write', 'basic_moderation'],
  [ROLES.USER]: ['read_own']
};

/**
 * Check if a role has specific permission
 */
function hasPermission(userRole, permission) {
  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.includes(permission);
}

/**
 * Check if a role is at least as high as required role
 */
function hasMinimumRole(userRole, requiredRole) {
  const roleHierarchy = [ROLES.USER, ROLES.MODERATOR, ROLES.ADMIN, ROLES.SUPER_ADMIN];
  const userRoleIndex = roleHierarchy.indexOf(userRole);
  const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);

  return userRoleIndex >= requiredRoleIndex;
}

/**
 * Log admin action to audit trail
 */
async function logAdminAction(adminUserId, action, targetType = null, targetId = null, details = null, req = null) {
  try {
    const ipAddress = req ? req.ip || req.connection.remoteAddress : null;
    const userAgent = req ? req.get('User-Agent') : null;

    await pool.query(
      'SELECT log_admin_action($1, $2, $3, $4, $5, $6, $7)',
      [adminUserId, action, targetType, targetId, details, ipAddress, userAgent]
    );
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}

/**
 * Enhanced admin authentication middleware
 * Checks for valid admin session and role
 */
const authenticateAdmin = async (req, res, next) => {
  try {
    // First check for token in cookie
    let token = req.cookies.token;

    // If not in cookie, check for Bearer token
    if (!token) {
      const authHeader = req.headers['authorization'];
      token = authHeader && authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        code: 'NO_TOKEN'
      });
    }

    // Verify JWT token
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });

    // Get user details including role
    const userResult = await pool.query(
      'SELECT user_id, username, email, role, account_status FROM users WHERE user_id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    // Check if user has admin privileges
    if (!hasMinimumRole(user.role, ROLES.MODERATOR)) {
      await logAdminAction(user.user_id, 'UNAUTHORIZED_ACCESS_ATTEMPT', 'admin_panel', null, {
        attempted_url: req.originalUrl,
        user_role: user.role
      }, req);

      return res.status(403).json({
        error: 'Insufficient privileges. Admin access required.',
        code: 'INSUFFICIENT_PRIVILEGES'
      });
    }

    // Check if account is active
    if (user.account_status !== 'active') {
      return res.status(403).json({
        error: 'Account is not active',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Check for admin session (enhanced security)
    const sessionResult = await pool.query(`
      SELECT * FROM admin_sessions
      WHERE user_id = $1 AND session_token = $2 AND is_active = true AND expires_at > NOW()
    `, [user.user_id, token]);

    // If no admin session exists, create one
    if (sessionResult.rows.length === 0) {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent') || '';
      const expiresAt = new Date(Date.now() + (30 * 60 * 1000)); // 30 minutes

      await pool.query(`
        INSERT INTO admin_sessions (user_id, session_token, ip_address, user_agent, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (session_token) DO UPDATE SET
        last_activity = NOW(),
        expires_at = $5
      `, [user.user_id, token, ipAddress, userAgent, expiresAt]);

      await logAdminAction(user.user_id, 'ADMIN_LOGIN', 'admin_panel', null, {
        ip_address: ipAddress,
        user_agent: userAgent
      }, req);
    } else {
      // Update last activity
      await pool.query(
        'UPDATE admin_sessions SET last_activity = NOW() WHERE session_token = $1',
        [token]
      );
    }

    // Add user info to request
    req.user = user;
    req.adminSession = sessionResult.rows[0] || { created: true };

    next();
  } catch (error) {
    console.error('Admin authentication error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Middleware to require specific role
 */
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!hasMinimumRole(req.user.role, requiredRole)) {
      logAdminAction(req.user.user_id, 'INSUFFICIENT_ROLE_ACCESS_ATTEMPT', 'admin_endpoint', req.originalUrl, {
        user_role: req.user.role,
        required_role: requiredRole
      }, req);

      return res.status(403).json({
        error: `Role '${requiredRole}' or higher required`,
        code: 'INSUFFICIENT_ROLE',
        userRole: req.user.role,
        requiredRole
      });
    }

    next();
  };
};

/**
 * Middleware to require specific permission
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!hasPermission(req.user.role, permission)) {
      logAdminAction(req.user.user_id, 'INSUFFICIENT_PERMISSION_ACCESS_ATTEMPT', 'admin_endpoint', req.originalUrl, {
        user_role: req.user.role,
        required_permission: permission
      }, req);

      return res.status(403).json({
        error: `Permission '${permission}' required`,
        code: 'INSUFFICIENT_PERMISSION',
        userRole: req.user.role,
        requiredPermission: permission
      });
    }

    next();
  };
};

/**
 * Audit logging middleware - logs all admin actions
 */
const auditLogger = (action, targetType = null) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json;

    // Override json method to log after successful response
    res.json = function(data) {
      // Log the action if response was successful
      if (res.statusCode < 400) {
        const targetId = req.params.id || req.body.id || null;
        const details = {
          method: req.method,
          url: req.originalUrl,
          body: req.method !== 'GET' ? req.body : undefined,
          params: req.params,
          query: req.query
        };

        // Don't await this to avoid blocking response
        logAdminAction(req.user?.user_id, action, targetType, targetId, details, req)
          .catch(error => console.error('Audit logging failed:', error));
      }

      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Session cleanup function (should be called periodically)
 */
async function cleanupExpiredSessions() {
  try {
    const result = await pool.query(`
      UPDATE admin_sessions
      SET is_active = false
      WHERE expires_at < NOW() AND is_active = true
    `);

    console.log(`Cleaned up ${result.rowCount} expired admin sessions`);
  } catch (error) {
    console.error('Failed to cleanup expired admin sessions:', error);
  }
}

/**
 * Error logging function for admin monitoring
 */
async function logError(errorType, errorMessage, stackTrace = null, userId = null, req = null, severity = 'error') {
  try {
    const requestUrl = req ? req.originalUrl : null;
    const requestMethod = req ? req.method : null;
    const ipAddress = req ? req.ip || req.connection.remoteAddress : null;
    const userAgent = req ? req.get('User-Agent') : null;

    await pool.query(
      'SELECT log_error($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [errorType, errorMessage, stackTrace, userId, requestUrl, requestMethod, ipAddress, userAgent, severity]
    );
  } catch (error) {
    console.error('Failed to log error to database:', error);
  }
}

module.exports = {
  authenticateAdmin,
  requireRole,
  requirePermission,
  auditLogger,
  logAdminAction,
  logError,
  cleanupExpiredSessions,
  hasPermission,
  hasMinimumRole,
  ROLES,
  ROLE_PERMISSIONS
};