const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { authenticateToken } = require('../middlewares/auth');

// Connect to PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * @route   GET /api/wallet/balance
 * @desc    Get user's current balance
 * @access  Private
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(
      'SELECT balance FROM users WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      balance: parseFloat(result.rows[0].balance)
    });
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ error: 'Server error fetching balance' });
  }
});

/**
 * @route   POST /api/wallet/deposit
 * @desc    Add funds to user balance
 * @access  Private
 */
router.post('/deposit', authenticateToken, async (req, res) => {
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
    
    // Record transaction history
    await pool.query(
      'INSERT INTO transactions (user_id, transaction_type, amount, status) VALUES ($1, $2, $3, $4)',
      [userId, 'deposit', amount, 'completed']
    );
    
    res.json({
      message: 'Deposit successful',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Server error processing deposit' });
  }
});

/**
 * @route   POST /api/wallet/withdraw
 * @desc    Withdraw funds from user balance
 * @access  Private
 */
router.post('/withdraw', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
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
      
      if (currentBalance < amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      
      // Update balance
      const result = await client.query(
        'UPDATE users SET balance = balance - $1 WHERE user_id = $2 RETURNING user_id, username, balance',
        [amount, userId]
      );
      
      // Record transaction history
      await client.query(
        'INSERT INTO transactions (user_id, transaction_type, amount, status) VALUES ($1, $2, $3, $4)',
        [userId, 'withdrawal', amount, 'completed']
      );
      
      await client.query('COMMIT');
      
      res.json({
        message: 'Withdrawal successful',
        user: result.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ error: 'Server error processing withdrawal' });
  }
});

/**
 * @route   GET /api/wallet/transactions
 * @desc    Get transaction history for a user
 * @access  Private
 */
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get transactions from the table
    const result = await pool.query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    
    // Get total count for pagination
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM transactions WHERE user_id = $1',
      [userId]
    );
    
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);
    
    res.json({
      transactions: result.rows,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasMore: page < totalPages
      }
    });
  } catch (error) {
    console.error('Transaction history error:', error);
    res.status(500).json({ error: 'Server error fetching transaction history' });
  }
});

module.exports = router;