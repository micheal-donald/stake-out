const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');
const router = express.Router();

// Get Bet History
router.get('/history', authenticateToken, async (req, res) => {
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

// Place a bet
router.post('/place', authenticateToken, async (req, res) => {
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

module.exports = router;