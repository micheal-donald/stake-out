const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');
const router = express.Router();

// Update User Settings
router.put('/', authenticateToken, async (req, res) => {
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

module.exports = router;