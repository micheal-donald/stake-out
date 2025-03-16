const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 4000;

// Connect to PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Middleware
app.use(express.json());
app.use(cors());

// Middleware for JWT authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// ROUTES

// User Registration
app.post('/api/register', async (req, res) => {
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
app.post('/api/login', async (req, res) => {
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
    
    // Return user info and token
    res.json({
      message: 'Login successful',
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        account_status: user.account_status
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// User Logout
app.post('/api/logout', authenticateToken, async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    // Remove session from database
    await pool.query(
      'DELETE FROM sessions WHERE session_token = $1',
      [token]
    );
    
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Server error during logout' });
  }
});

// Get User Profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get user profile
    const userResult = await pool.query(
      'SELECT user_id, username, email, balance, account_status, created_at FROM users WHERE user_id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user settings
    const settingsResult = await pool.query(
      'SELECT auto_cashout_multiplier, auto_cashout_amount FROM user_settings WHERE user_id = $1',
      [userId]
    );
    
    // Get bet history summary
    const betHistoryResult = await pool.query(
      'SELECT COUNT(*) as total_bets, SUM(winnings) as total_winnings FROM bet_history WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      user: userResult.rows[0],
      settings: settingsResult.rows[0] || {},
      betSummary: betHistoryResult.rows[0] || { total_bets: 0, total_winnings: 0 }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

// Update User Profile
app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Update user profile
    const result = await pool.query(
      'UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING user_id, username, email, account_status',
      [email, userId]
    );
    
    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// Change Password
app.put('/api/change-password', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    // Get user
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE user_id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);
    
    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [password_hash, userId]
    );
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Server error changing password' });
  }
});

// Update User Settings
app.put('/api/settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { auto_cashout_multiplier, auto_cashout_amount } = req.body;
    
    // Update or insert user settings
    const result = await pool.query(
      `INSERT INTO user_settings (user_id, auto_cashout_multiplier, auto_cashout_amount, updated_at) 
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         auto_cashout_multiplier = $2,
         auto_cashout_amount = $3,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, auto_cashout_multiplier || 0, auto_cashout_amount || 0]
    );
    
    res.json({
      message: 'Settings updated successfully',
      settings: result.rows[0]
    });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Server error updating settings' });
  }
});

// Get Bet History
app.get('/api/bet-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get bet history
    const result = await pool.query(
      'SELECT * FROM bet_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    
    // Get total count for pagination
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM bet_history WHERE user_id = $1',
      [userId]
    );
    
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);
    
    res.json({
      bets: result.rows,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasMore: page < totalPages
      }
    });
  } catch (error) {
    console.error('Bet history error:', error);
    res.status(500).json({ error: 'Server error fetching bet history' });
  }
});

// Add a bet to history (would be called when a bet is placed)
app.post('/api/place-bet', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bet_amount, multiplier, crash_point, winnings, cashout_trigger } = req.body;
    
    // Validate input
    if (!bet_amount || !multiplier || !crash_point) {
      return res.status(400).json({ error: 'Bet amount, multiplier, and crash point are required' });
    }
    
    // Begin transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check sufficient balance
      const userResult = await client.query(
        'SELECT balance FROM users WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }
      
      const currentBalance = parseFloat(userResult.rows[0].balance);
      
      if (currentBalance < bet_amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      
      // Calculate new balance
      const calculatedWinnings = parseFloat(winnings || 0);
      const newBalance = currentBalance - parseFloat(bet_amount) + calculatedWinnings;
      
      // Update user balance
      await client.query(
        'UPDATE users SET balance = $1 WHERE user_id = $2',
        [newBalance, userId]
      );
      
      // Record bet in history
      const betResult = await client.query(
        'INSERT INTO bet_history (user_id, bet_amount, multiplier, crash_point, winnings, cashout_trigger) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [userId, bet_amount, multiplier, crash_point, calculatedWinnings, cashout_trigger || 'manual']
      );
      
      await client.query('COMMIT');
      
      res.status(201).json({
        message: 'Bet placed successfully',
        bet: betResult.rows[0],
        newBalance
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Place bet error:', error);
    res.status(500).json({ error: 'Server error placing bet' });
  }
});

// Add funds to user balance (simplified for demo)
app.post('/api/deposit', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    
    // Update balance
    const result = await pool.query(
      'UPDATE users SET balance = balance + $1 WHERE user_id = $2 RETURNING user_id, username, balance',
      [amount, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      message: 'Deposit successful',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Server error processing deposit' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});