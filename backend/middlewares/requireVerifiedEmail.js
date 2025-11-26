const pool = require('../config/db');
const logger = require('../config/logger');

/**
 * Middleware to require email verification before accessing certain routes
 * Use this middleware after authenticateToken on routes that require verified email
 */
async function requireVerifiedEmail(req, res, next) {
  try {
    // req.user should already be set by authenticateToken middleware
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user's email is verified
    const result = await pool.query(
      'SELECT email_verified, email FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (!user.email_verified) {
      logger.warn('Unverified email access attempt', {
        userId: req.user.userId,
        email: user.email,
        route: req.path
      });

      return res.status(403).json({
        error: 'Email verification required',
        message: 'Please verify your email address before accessing this feature',
        emailVerified: false
      });
    }

    // Email is verified, proceed to next middleware
    next();
  } catch (error) {
    logger.error('Error checking email verification:', {
      userId: req.user?.userId,
      error: error.message
    });
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = requireVerifiedEmail;
