const { authenticateToken } = require('../middlewares/auth');
const { registerValidation, loginValidation } = require('../middlewares/validation');
const logger = require('../config/logger');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const router = express.Router();

// NOTE: Rate limiting is now handled globally in server.js via authLimiter
// This local implementation is kept for backward compatibility but is redundant

// User Registration
router.post('/register', registerValidation, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if username or email already exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2', 
      [username, email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    // Insert new user
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING user_id, username, email, created_at, account_status, balance',
      [username, email, password_hash]
    );
    
    // Create default user settings
    await pool.query(
      'INSERT INTO user_settings (user_id) VALUES ($1)',
      [result.rows[0].user_id]
    );
    
    logger.info('New user registered', {
      userId: result.rows[0].user_id,
      username: result.rows[0].username,
      email: result.rows[0].email
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: result.rows[0]
    });
  } catch (error) {
    logger.error('Registration error:', { username, email, error: error.message });
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// User Login
router.post('/login', loginValidation, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find user
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Check if account is active
    if (user.account_status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.user_id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Create session record
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry
    
    await pool.query(
      'INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)',
      [user.user_id, token, expiresAt]
    );
    
    // Set httpOnly cookie instead of returning token in response
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict'
    });
    
    logger.logSecurity('USER_LOGIN', user.user_id, {
      username: user.username,
      ip: req.ip || req.connection.remoteAddress
    });

    // Return user info (without token)
    res.json({
      message: 'Login successful',
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        account_status: user.account_status
      }
    });
  } catch (error) {
    logger.error('Login error:', { username, error: error.message });
    res.status(500).json({ error: 'Server error during login' });
  }
});

// User Logout
router.post('/logout', authenticateToken, async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      // Remove session from database using user ID instead of token
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

// Socket Token Endpoint
// ⚠️ CRITICAL: DO NOT REMOVE - Required by frontend for socket authentication
// This endpoint is called by StakeOutBet.js:119 to get a short-lived token for Socket.IO auth
// Rate limiting: Uses socketLimiter (10 req/min) instead of authLimiter to allow multiple socket connections
router.get('/socket-token', authenticateToken, async (req, res) => {
  try {
    // Generate a short-lived token for socket authentication
    const socketToken = jwt.sign(
      { userId: req.user.userId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' } // Shorter expiry for socket tokens
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