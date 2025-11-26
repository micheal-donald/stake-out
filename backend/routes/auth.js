const { authenticateToken } = require('../middlewares/auth');
const { registerValidation, loginValidation } = require('../middlewares/validation');
const logger = require('../config/logger');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const emailService = require('../services/emailService');
const router = express.Router();

// Configuration
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MINUTES = 10;
const EMAIL_VERIFICATION_EXPIRY_HOURS = 24;
const PASSWORD_RESET_EXPIRY_HOURS = 1;
const MINIMUM_AGE_YEARS = 18;

/**
 * Helper function to calculate age from date of birth
 */
function calculateAge(dateOfBirth) {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * User Registration with Email Verification and Age Check
 */
router.post('/register', registerValidation, async (req, res) => {
  const client = await pool.connect();

  try {
    const { username, email, password, dateOfBirth, acceptedTerms } = req.body;

    // Validate date of birth and age
    if (!dateOfBirth) {
      return res.status(400).json({ error: 'Date of birth is required' });
    }

    const age = calculateAge(dateOfBirth);
    if (age < MINIMUM_AGE_YEARS) {
      logger.logSecurity('UNDERAGE_REGISTRATION_ATTEMPT', null, { email, age });
      return res.status(403).json({
        error: `You must be at least ${MINIMUM_AGE_YEARS} years old to register`
      });
    }

    // Validate terms acceptance
    if (!acceptedTerms) {
      return res.status(400).json({ error: 'You must accept the Terms of Service' });
    }

    await client.query('BEGIN');

    // Check if username or email already exists
    const existingUser = await client.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const salt = await bcrypt.genSalt(bcryptRounds);
    const password_hash = await bcrypt.hash(password, salt);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date();
    verificationExpiry.setHours(verificationExpiry.getHours() + EMAIL_VERIFICATION_EXPIRY_HOURS);

    // Get current terms version
    const termsVersion = await client.query(
      'SELECT version FROM terms_versions WHERE document_type = $1 ORDER BY effective_date DESC LIMIT 1',
      ['terms_of_service']
    );

    const currentTermsVersion = termsVersion.rows[0]?.version || '1.0';

    // Insert new user with all new fields
    const result = await client.query(
      `INSERT INTO users (
        username, email, password_hash, date_of_birth, age_verified,
        email_verified, email_verification_token, verification_token_expires_at,
        accepted_terms_version, terms_accepted_at,
        failed_login_attempts, account_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING user_id, username, email, created_at, account_status`,
      [
        username,
        email,
        password_hash,
        dateOfBirth,
        true, // age_verified (already checked above)
        false, // email_verified
        verificationToken,
        verificationExpiry,
        currentTermsVersion,
        new Date(),
        0, // failed_login_attempts
        'active'
      ]
    );

    const newUser = result.rows[0];

    // Create default user settings
    await client.query(
      'INSERT INTO user_settings (user_id) VALUES ($1)',
      [newUser.user_id]
    );

    await client.query('COMMIT');

    // Send verification email
    try {
      await emailService.sendVerificationEmail(email, verificationToken, username);
      logger.info('Verification email sent', { userId: newUser.user_id, email });
    } catch (emailError) {
      logger.error('Failed to send verification email', {
        userId: newUser.user_id,
        error: emailError.message
      });
      // Don't fail registration if email fails
    }

    logger.logSecurity('USER_REGISTERED', newUser.user_id, {
      username: newUser.username,
      email: newUser.email,
      age
    });

    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.',
      user: {
        user_id: newUser.user_id,
        username: newUser.username,
        email: newUser.email,
        email_verified: false
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Registration error:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Server error during registration' });
  } finally {
    client.release();
  }
});

/**
 * Email Verification
 */
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Find user with this token
    const result = await pool.query(
      `SELECT user_id, username, email, email_verified, verification_token_expires_at
       FROM users
       WHERE email_verification_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    const user = result.rows[0];

    // Check if already verified
    if (user.email_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    // Check if token expired
    if (new Date() > new Date(user.verification_token_expires_at)) {
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    // Update user as verified
    await pool.query(
      `UPDATE users
       SET email_verified = true,
           email_verification_token = NULL,
           verification_token_expires_at = NULL
       WHERE user_id = $1`,
      [user.user_id]
    );

    logger.logSecurity('EMAIL_VERIFIED', user.user_id, { email: user.email });

    res.json({
      message: 'Email verified successfully',
      verified: true
    });
  } catch (error) {
    logger.error('Email verification error:', { error: error.message });
    res.status(500).json({ error: 'Server error during verification' });
  }
});

/**
 * Resend Verification Email
 */
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await pool.query(
      'SELECT user_id, username, email, email_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists
      return res.json({ message: 'If your email exists, a verification email has been sent' });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    // Generate new token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date();
    verificationExpiry.setHours(verificationExpiry.getHours() + EMAIL_VERIFICATION_EXPIRY_HOURS);

    await pool.query(
      `UPDATE users
       SET email_verification_token = $1, verification_token_expires_at = $2
       WHERE user_id = $3`,
      [verificationToken, verificationExpiry, user.user_id]
    );

    // Send verification email
    await emailService.sendVerificationEmail(email, verificationToken, user.username);

    logger.info('Verification email resent', { userId: user.user_id, email });

    res.json({ message: 'Verification email sent' });
  } catch (error) {
    logger.error('Resend verification error:', { error: error.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * User Login with Account Lockout Protection
 */
router.post('/login', loginValidation, async (req, res) => {
  const client = await pool.connect();

  try {
    const { username, password } = req.body;

    await client.query('BEGIN');

    // Find user
    const result = await client.query(
      `SELECT user_id, username, email, password_hash, account_status,
              failed_login_attempts, account_locked_until, email_verified,
              accepted_terms_version, balance
       FROM users
       WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check if account is locked
    if (user.account_locked_until && new Date() < new Date(user.account_locked_until)) {
      await client.query('ROLLBACK');
      const remainingTime = Math.ceil((new Date(user.account_locked_until) - new Date()) / 1000 / 60);
      return res.status(403).json({
        error: `Account is locked. Try again in ${remainingTime} minutes`
      });
    }

    // If lockout period has passed, reset failed attempts
    if (user.account_locked_until && new Date() >= new Date(user.account_locked_until)) {
      await client.query(
        'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL WHERE user_id = $1',
        [user.user_id]
      );
    }

    // Check if account is active
    if (user.account_status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Account is not active' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      // Increment failed attempts
      const newFailedAttempts = user.failed_login_attempts + 1;
      let lockoutUntil = null;

      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        lockoutUntil = new Date();
        lockoutUntil.setMinutes(lockoutUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);

        // Send lockout notification
        try {
          await emailService.sendAccountLockedNotification(user.email, user.username, lockoutUntil);
        } catch (emailError) {
          logger.error('Failed to send lockout email', { error: emailError.message });
        }

        logger.logSecurity('ACCOUNT_LOCKED', user.user_id, {
          reason: 'Too many failed login attempts',
          attempts: newFailedAttempts
        });
      }

      await client.query(
        'UPDATE users SET failed_login_attempts = $1, account_locked_until = $2 WHERE user_id = $3',
        [newFailedAttempts, lockoutUntil, user.user_id]
      );

      await client.query('COMMIT');

      logger.logSecurity('FAILED_LOGIN_ATTEMPT', user.user_id, {
        username,
        attempts: newFailedAttempts,
        ip: req.ip
      });

      return res.status(401).json({
        error: 'Invalid credentials',
        attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - newFailedAttempts)
      });
    }

    // Successful login - reset failed attempts
    await client.query(
      'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL WHERE user_id = $1',
      [user.user_id]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.user_id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Create session record
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await client.query(
      'INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)',
      [user.user_id, token, expiresAt]
    );

    await client.query('COMMIT');

    // Set httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });

    logger.logSecurity('USER_LOGIN', user.user_id, {
      username: user.username,
      ip: req.ip
    });

    res.json({
      message: 'Login successful',
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        account_status: user.account_status,
        email_verified: user.email_verified,
        accepted_terms_version: user.accepted_terms_version
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Login error:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Server error during login' });
  } finally {
    client.release();
  }
});

/**
 * Forgot Password - Send Reset Email
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await pool.query(
      'SELECT user_id, username, email FROM users WHERE email = $1',
      [email]
    );

    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      return res.json({ message: 'If your email exists, a password reset link has been sent' });
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date();
    resetExpiry.setHours(resetExpiry.getHours() + PASSWORD_RESET_EXPIRY_HOURS);

    await pool.query(
      'UPDATE users SET password_reset_token = $1, reset_token_expires_at = $2 WHERE user_id = $3',
      [resetToken, resetExpiry, user.user_id]
    );

    // Send reset email
    await emailService.sendPasswordResetEmail(email, resetToken, user.username);

    logger.logSecurity('PASSWORD_RESET_REQUESTED', user.user_id, { email });

    res.json({ message: 'If your email exists, a password reset link has been sent' });
  } catch (error) {
    logger.error('Forgot password error:', { error: error.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Reset Password with Token
 */
router.post('/reset-password', async (req, res) => {
  const client = await pool.connect();

  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    await client.query('BEGIN');

    // Find user with this token
    const result = await client.query(
      `SELECT user_id, username, email, reset_token_expires_at
       FROM users
       WHERE password_reset_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid reset token' });
    }

    const user = result.rows[0];

    // Check if token expired
    if (new Date() > new Date(user.reset_token_expires_at)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    // Hash new password
    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const salt = await bcrypt.genSalt(bcryptRounds);
    const password_hash = await bcrypt.hash(newPassword, salt);

    // Update password and clear reset token
    await client.query(
      `UPDATE users
       SET password_hash = $1,
           password_reset_token = NULL,
           reset_token_expires_at = NULL,
           failed_login_attempts = 0,
           account_locked_until = NULL
       WHERE user_id = $2`,
      [password_hash, user.user_id]
    );

    await client.query('COMMIT');

    // Send confirmation email
    try {
      await emailService.sendPasswordChangedNotification(user.email, user.username);
    } catch (emailError) {
      logger.error('Failed to send password changed email', { error: emailError.message });
    }

    logger.logSecurity('PASSWORD_RESET_COMPLETED', user.user_id, { email: user.email });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Reset password error:', { error: error.message });
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

/**
 * Validate Reset Token
 */
router.get('/validate-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      'SELECT reset_token_expires_at FROM users WHERE password_reset_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ valid: false, error: 'Invalid token' });
    }

    const { reset_token_expires_at } = result.rows[0];

    if (new Date() > new Date(reset_token_expires_at)) {
      return res.status(400).json({ valid: false, error: 'Token expired' });
    }

    res.json({ valid: true });
  } catch (error) {
    logger.error('Validate reset token error:', { error: error.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * User Logout
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Remove session from database
    await pool.query(
      'DELETE FROM sessions WHERE user_id = $1',
      [req.user.userId]
    );

    logger.logSecurity('USER_LOGOUT', req.user.userId);

    res.json({ message: 'Logout successful' });
  } catch (error) {
    logger.error('Logout error:', { userId: req.user?.userId, error: error.message });
    res.status(500).json({ error: 'Server error during logout' });
  }
});

/**
 * Socket Token Endpoint
 */
router.get('/socket-token', authenticateToken, async (req, res) => {
  try {
    const socketToken = jwt.sign(
      { userId: req.user.userId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    logger.info('Socket token generated', {
      userId: req.user.userId,
      expiresIn: '1h'
    });

    res.json({ token: socketToken });
  } catch (error) {
    logger.error('Socket token generation failed:', {
      userId: req.user?.userId,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to generate socket token' });
  }
});

module.exports = router;
