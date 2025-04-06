const express = require('express');
const pool = require('../config/db');
const router = express.Router();

// Get Game History
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const result = await pool.query(
      `SELECT game_id, crash_point, completed_at, revealed_seed, hash_result 
       FROM game_rounds 
       WHERE status = 'completed' 
       ORDER BY completed_at DESC 
       LIMIT $1`,
      [limit]
    );
    
    res.json({ games: result.rows });
  } catch (error) {
    console.error('Game history error:', error);
    res.status(500).json({ error: 'Server error fetching game history' });
  }
});

// Verify Game Fairness
router.get('/verify/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const result = await pool.query(
      `SELECT game_id, crash_point, revealed_seed, hash_result 
       FROM game_rounds 
       WHERE game_id = $1 AND status = 'completed'`,
      [gameId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found or not completed' });
    }
    
    const game = result.rows[0];
    
    // Verify the hash matches the seed
    const crypto = require('crypto');
    const calculatedHash = crypto
      .createHash('sha256')
      .update(game.revealed_seed)
      .digest('hex');
    
    // Check if the stored hash matches our calculation
    const hashesMatch = calculatedHash === game.hash_result;
    
    res.json({
      game_id: game.game_id,
      crash_point: game.crash_point,
      seed: game.revealed_seed,
      stored_hash: game.hash_result,
      calculated_hash: calculatedHash,
      verified: hashesMatch
    });
  } catch (error) {
    console.error('Game verification error:', error);
    res.status(500).json({ error: 'Server error verifying game' });
  }
});

module.exports = router;