const { authenticateToken } = require('../middlewares/auth');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const router = express.Router();

// Simple rate limiting middleware for auth endpoints
const rateLimit = (windowMs, max) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const windowKey = `${ip}-${Math.floor(Date.now() / windowMs)}`;
    const current = requests.get(windowKey) || 0;
    
    if (current >= max) {
      return res.status(429).json({ error: 'Too many requests, please try again later' });
    }
    
    requests.set(windowKey, current + 1);
    
    // Clean up old entries periodically
    if (Math.random() < 0.1) { // 10% chance to clean up
      const now = Date.now();
      for (const [key] of requests.entries()) {
        const keyTime = parseInt(key.split('-')[1]);
        if (now - (keyTime * windowMs) > windowMs) {
          requests.delete(key);
        }
      }
    }
    
    next();
  };
};

// Apply rate limiting to auth endpoints
const loginLimiter = rateLimit(15 * 60 * 1000, 5); // 5 attempts per 15 minutes
const registerLimiter = rateLimit(15 * 60 * 1000, 3); // 3 attempts per 15 minutes

// User Registration
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    
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
    
    res.status(201).json({
      message: 'User registered successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// User Login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
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
    console.error('Login error:', error);
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
      
      res.json({ message: 'Logout successful' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Server error during logout' });
    }
  });

module.exports = router;