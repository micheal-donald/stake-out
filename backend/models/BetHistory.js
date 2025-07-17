// models/BetHistory.js
const pool = require('../config/db');

/**
 * Model for the bet_history table.
 * Columns (see init.sql):
 *  - bet_id SERIAL PRIMARY KEY
 *  - user_id INTEGER REFERENCES users(user_id)
 *  - game_id INTEGER REFERENCES game_rounds(game_id)
 *  - bet_amount DECIMAL(10,2) NOT NULL
 *  - multiplier DECIMAL(10,2) NOT NULL
 *  - crash_point DECIMAL(10,2) NOT NULL
 *  - winnings DECIMAL(12,2)
 *  - cashout_trigger VARCHAR(20) CHECK (...)
 *  - created_at TIMESTAMP DEFAULT NOW()
 */
const BetHistory = {
  /**
   * Record a new bet or cashout in history.
   * @param {Object} data
   * @param {number} data.userId
   * @param {number} data.gameId
   * @param {number} data.betAmount
   * @param {number} data.multiplier   - multiplier at cashout (0 if lost)
   * @param {number} data.crashPoint   - the round’s crash point
   * @param {number} data.winnings     - amount won (0 if lost)
   * @param {string} data.cashoutTrigger - 'manual'|'auto_multiplier'|'auto_amount'|'none'|'refunded'
   * @returns {Promise<Object>} inserted row with bet_id and created_at
   */
  async create({
    userId,
    gameId,
    betAmount,
    multiplier,
    crashPoint,
    winnings,
    cashoutTrigger
  }) {
    const { rows } = await pool.query(
      `INSERT INTO bet_history
         (user_id, game_id, bet_amount, multiplier, crash_point, winnings, cashout_trigger)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING bet_id, created_at`,
      [userId, gameId, betAmount, multiplier, crashPoint, winnings, cashoutTrigger]
    );
    return rows[0];
  },

  /**
   * Fetch a single user’s paginated bet history.
   * Joins to game_rounds to pull in the round’s crash_point.
   * @param {number} userId
   * @param {number} limit  rows per page
   * @param {number} offset zero-based offset
   * @returns {Promise<{bets:Array, totalCount:number}>}
   */
  async fetchByUser(userId, limit = 10, offset = 0) {
    const client = await pool.connect();
    try {
      const betsRes = await client.query(
        `SELECT 
           bh.bet_id, bh.game_id, bh.bet_amount, bh.multiplier, bh.crash_point, 
           bh.winnings, bh.cashout_trigger, bh.created_at,
           gr.crash_point AS round_crash_point
         FROM bet_history bh
         JOIN game_rounds gr ON bh.game_id = gr.game_id
         WHERE bh.user_id = $1
         ORDER BY bh.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      const countRes = await client.query(
        `SELECT COUNT(*) AS count
           FROM bet_history
          WHERE user_id = $1`,
        [userId]
      );
      return {
        bets: betsRes.rows,
        totalCount: parseInt(countRes.rows[0].count, 10)
      };
    } finally {
      client.release();
    }
  },

  /**
   * Fetch all bets for a given game round.
   * Useful for round-ending logic or admin views.
   * @param {number} gameId
   * @returns {Promise<Array>}
   */
  async fetchByGame(gameId) {
    const { rows } = await pool.query(
      `SELECT 
         bet_id, user_id, bet_amount, multiplier, crash_point, winnings, cashout_trigger, created_at
       FROM bet_history
       WHERE game_id = $1
       ORDER BY created_at ASC`,
      [gameId]
    );
    return rows;
  }
};

module.exports = BetHistory;
// This module provides methods to interact with the bet_history table in the database.