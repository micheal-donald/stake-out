/**
 * Database Test Helpers
 * Utilities for database operations during testing
 */

const { Pool } = require('pg');

class TestDatabase {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) return;

    // In test environment, use mock pool instead of real connection
    this.pool = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      end: jest.fn().mockResolvedValue(),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: jest.fn()
      })
    };

    this.isConnected = true;
    console.log('Test database mock connected');
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      console.log('Test database disconnected');
    }
  }

  async query(text, params) {
    if (!this.isConnected) {
      await this.connect();
    }
    return this.pool.query(text, params);
  }

  // Clean up test data
  async cleanup() {
    if (!this.isConnected) return;

    try {
      // Clean up in reverse dependency order
      await this.query('DELETE FROM bet_history WHERE 1=1');
      await this.query('DELETE FROM game_rounds WHERE 1=1');
      await this.query('DELETE FROM transactions WHERE 1=1');
      await this.query('DELETE FROM mpesa_transactions WHERE 1=1');
      await this.query("DELETE FROM users WHERE email LIKE '%test%'");
      console.log('Test data cleaned up');
    } catch (error) {
      console.error('Test cleanup failed:', error.message);
      throw error;
    }
  }

  // Create test user
  async createTestUser(userData = {}) {
    const defaultUser = {
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password_hash: '$2b$10$test.hash.for.testing.only',
      balance: 1000
    };

    const user = { ...defaultUser, ...userData };

    const result = await this.query(
      `INSERT INTO users (username, email, password_hash, balance)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id, username, email, balance`,
      [user.username, user.email, user.password_hash, user.balance]
    );

    return result.rows[0];
  }

  // Create test game
  async createTestGame(gameData = {}) {
    const defaultGame = {
      crash_point: 2.50,
      seed: 'test-seed-123',
      hash: 'test-hash-456',
      status: 'completed',
      started_at: new Date(),
      ended_at: new Date()
    };

    const game = { ...defaultGame, ...gameData };

    const result = await this.query(
      `INSERT INTO game_rounds (crash_point, seed, hash, status, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING game_id, crash_point, seed, hash, status`,
      [game.crash_point, game.seed, game.hash, game.status, game.started_at, game.ended_at]
    );

    return result.rows[0];
  }

  // Create test bet
  async createTestBet(userId, gameId, betData = {}) {
    const defaultBet = {
      amount: 100,
      cash_out_multiplier: null,
      cash_out_amount: null,
      placed_at: new Date()
    };

    const bet = { ...defaultBet, ...betData };

    const result = await this.query(
      `INSERT INTO bet_history (user_id, game_id, amount, cash_out_multiplier, cash_out_amount, placed_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING bet_id, user_id, game_id, amount`,
      [userId, gameId, bet.amount, bet.cash_out_multiplier, bet.cash_out_amount, bet.placed_at]
    );

    return result.rows[0];
  }

  // Get test user by email
  async getUserByEmail(email) {
    const result = await this.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  // Update user balance
  async updateUserBalance(userId, newBalance) {
    const result = await this.query(
      'UPDATE users SET balance = $2 WHERE user_id = $1 RETURNING *',
      [userId, newBalance]
    );
    return result.rows[0];
  }
}

// Export singleton instance
const testDb = new TestDatabase();

module.exports = testDb;