// models/GameRound.js
const pool = require('../config/db');

const GameRound = {
  /**
   * Create a new game round record (pending).
   * @param {Object} data
   * @param {number} data.crashPoint
   * @param {string} data.hashSeed
   * @param {string} data.hashResult
   * @returns {Promise<Object>} inserted row ({ game_id, created_at, … })
   */
  async create({ crashPoint, hashSeed, hashResult }) {
    const { rows } = await pool.query(
      `INSERT INTO game_rounds
         (crash_point, hash_seed, hash_result)
       VALUES ($1, $2, $3)
       RETURNING game_id, crash_point, hash_result, created_at`,
      [crashPoint, hashSeed, hashResult]
    );
    return rows[0];
  },

  /**
   * Mark this round as started.
   * @param {number} gameId
   */
  async markStarted(gameId) {
    await pool.query(
      `UPDATE game_rounds
          SET status = 'running',
              started_at = NOW()
        WHERE game_id = $1`,
      [gameId]
    );
  },

  /**
   * Mark this round as completed (crashed).
   * @param {number}   gameId
   * @param {string}   revealedSeed
   * @param {string}   status        // e.g. 'completed' or 'cancelled'
   */
  async markCompleted(gameId, revealedSeed, status = 'completed') {
    await pool.query(
      `UPDATE game_rounds
          SET status = $1,
              completed_at = NOW(),
              revealed_seed = $2
        WHERE game_id = $3`,
      [status, revealedSeed, gameId]
    );
  },

  /**
   * Load one round by ID.
   * @param {number} gameId
   * @returns {Promise<Object|null>}
   */
  async findById(gameId) {
    const { rows } = await pool.query(
      `SELECT * FROM game_rounds WHERE game_id = $1`,
      [gameId]
    );
    return rows[0] || null;
  },

  /**
   * Fetch last N completed rounds (for history).
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async fetchRecent(limit = 10) {
    const { rows } = await pool.query(
      `SELECT game_id, crash_point, completed_at, revealed_seed
         FROM game_rounds
        WHERE status = 'completed'
        ORDER BY completed_at DESC
        LIMIT $1`,
      [limit]
    );
    return rows;
  }
};

module.exports = GameRound;
