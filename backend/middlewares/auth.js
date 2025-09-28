const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const authenticateToken = async (req, res, next) => {
  // First check for token in cookie
  let token = req.cookies.token;
  
  // If not in cookie, check for Bearer token (for backward compatibility)
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    // Check if session exists in database (to handle logout cases)
    try {
      const sessionResult = await pool.query(
        'SELECT * FROM sessions WHERE user_id = $1 AND session_token = $2',
        [user.userId, token]
      );
      
      if (sessionResult.rows.length === 0) {
        return res.status(401).json({ error: 'Authentication failed. Please log in again.' });
      }
      
      // Check if session has expired
      const now = new Date();
      if (new Date(sessionResult.rows[0].expires_at) < now) {
        // Remove expired session
        await pool.query('DELETE FROM sessions WHERE session_token = $1', [token]);
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
      }
      
      req.user = user;
      next();
    } catch (dbError) {
      console.error('Database error during authentication:', dbError);
      return res.status(500).json({ error: 'Authentication error' });
    }
  });
};

module.exports = { authenticateToken };