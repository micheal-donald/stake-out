const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Socket.io authentication middleware
async function authenticateSocketToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'stakeoutbet_jwt_secret');
    
    // Verify the user exists and has an active session
    const result = await pool.query(
      'SELECT u.user_id, u.username, u.balance FROM users u JOIN sessions s ON u.user_id = s.user_id WHERE s.session_token = $1 AND s.expires_at > NOW()',
      [token]
    );
    
    if (result.rows.length === 0) {
      throw new Error('User not found or session expired');
    }
    
    return {
      userId: decoded.userId,
      username: result.rows[0].username,
      balance: result.rows[0].balance
    };
  } catch (error) {
    console.error('Socket auth error:', error);
    throw error;
  }
}

module.exports = { authenticateSocketToken };