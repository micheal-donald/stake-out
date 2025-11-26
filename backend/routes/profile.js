const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');
const router = express.Router();

// Get User Profile
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Get user data
    const userResult = await pool.query(
      'SELECT user_id, username, email, balance, account_status, created_at FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user settings
    const settingsResult = await pool.query(
      'SELECT auto_cashout_multiplier, auto_cashout_amount FROM user_settings WHERE user_id = $1',
      [req.user.userId]
    );

    // Get bet summary
    const betSummaryResult = await pool.query(
      `SELECT
        COUNT(*) as total_bets,
        COALESCE(SUM(CASE WHEN cashed_out = true THEN payout ELSE 0 END), 0) as total_winnings
       FROM bet_history
       WHERE user_id = $1`,
      [req.user.userId]
    );

    res.json({
      user: userResult.rows[0],
      settings: settingsResult.rows[0] || { auto_cashout_multiplier: 0, auto_cashout_amount: 0 },
      betSummary: betSummaryResult.rows[0] || { total_bets: 0, total_winnings: 0 }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Server error while fetching profile' });
  }
});

// Update User Profile
router.put('/', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await pool.query(
      'UPDATE users SET email = $1 WHERE user_id = $2 RETURNING user_id, username, email, balance, account_status, created_at',
      [email, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Server error while updating profile' });
  }
});

// Change Password
router.put('/change-password', authenticateToken, async (req, res) => {
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
    
    // Hash new password with configurable rounds from environment
    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const salt = await bcrypt.genSalt(bcryptRounds);
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

// Add funds to user balance
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
    
    res.json({
      message: 'Deposit successful',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Server error processing deposit' });
  }
});

module.exports = router;