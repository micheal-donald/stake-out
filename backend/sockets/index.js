const pool = require('../config/db');
const { authenticateSocketToken } = require('../middlewares/socketAuth');

module.exports = function setupSocketHandlers(io, gameServer) {
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    let authenticatedUser = null;
    
    // Send current game state immediately on connection
    socket.emit('game_state', gameServer.getGameState());
    
    // Authenticate socket connection with JWT
    socket.on('authenticate', async (token) => {
      try {
        // Verify the JWT token
        const user = await authenticateSocketToken(token);
        authenticatedUser = user;
        
        // Join a user-specific room for targeted messages
        socket.join(`user-${user.userId}`);
        
        // Let the client know they're authenticated
        socket.emit('authenticated', {
          userId: user.userId,
          username: user.username,
          balance: user.balance
        });
        
        // If the user already has an active bet in the current game, send it
        if (gameServer.hasActiveBet(user.userId)) {
          const activeBet = gameServer.getActiveBet(user.userId);
          socket.emit('active_bet', activeBet);
        }
        
        console.log(`User ${user.userId} authenticated on socket ${socket.id}`);
      } catch (error) {
        console.error('Socket authentication error:', error);
        socket.emit('authentication_error', 'Invalid token or session expired');
      }
    });
    
    // Place bet event
    socket.on('place_bet', async ({ amount, autoCashoutAt, autoCashoutAmount }) => {
      if (!authenticatedUser) {
        socket.emit('bet_error', 'Not authenticated');
        return;
      }
      
      const userId = authenticatedUser.userId;
      const result = await gameServer.placeBet(userId, amount, autoCashoutAt, autoCashoutAmount);
      
      if (result.success) {
        socket.emit('bet_result', {
          success: true,
          message: result.message,
          balance: result.balance,
          bet: {
            amount,
            autoCashoutAt,
            autoCashoutAmount
          }
        });
      } else {
        socket.emit('bet_error', result.error);
      }
    });
    
    // Cash out event
    socket.on('cash_out', async () => {
      if (!authenticatedUser) {
        socket.emit('cashout_error', 'Not authenticated');
        return;
      }
      
      const userId = authenticatedUser.userId;
      const result = await gameServer.cashOut(userId);
      
      if (!result.success) {
        socket.emit('cashout_error', result.error);
      }
      // Successful cashouts are handled in the game server and emitted there
    });
    
    // Request game history
    socket.on('get_game_history', async (limit = 10) => {
      try {
        const result = await pool.query(
          `SELECT game_id, crash_point, completed_at, revealed_seed, hash_result 
           FROM game_rounds 
           WHERE status = 'completed' 
           ORDER BY completed_at DESC 
           LIMIT $1`,
          [limit]
        );
        
        socket.emit('game_history', { games: result.rows });
      } catch (error) {
        console.error('Error fetching game history:', error);
        socket.emit('error', 'Failed to fetch game history');
      }
    });
    
    // Request user bet history
    socket.on('get_bet_history', async ({ page = 1, limit = 10 }) => {
      if (!authenticatedUser) {
        socket.emit('error', 'Not authenticated');
        return;
      }
      
      try {
        const userId = authenticatedUser.userId;
        const offset = (page - 1) * limit;
        
        const result = await pool.query(
          `SELECT bh.*, gr.crash_point as game_crash_point
           FROM bet_history bh
           JOIN game_rounds gr ON bh.game_id = gr.game_id
           WHERE bh.user_id = $1 
           ORDER BY bh.created_at DESC 
           LIMIT $2 OFFSET $3`,
          [userId, limit, offset]
        );
        
        const countResult = await pool.query(
          'SELECT COUNT(*) FROM bet_history WHERE user_id = $1',
          [userId]
        );
        
        const totalCount = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalCount / limit);
        
        socket.emit('bet_history', {
          bets: result.rows,
          pagination: {
            currentPage: page,
            totalPages,
            totalCount,
            hasMore: page < totalPages
          }
        });
      } catch (error) {
        console.error('Error fetching bet history:', error);
        socket.emit('error', 'Failed to fetch bet history');
      }
    });
    
    // Verify game fairness
    socket.on('verify_game', async (gameId) => {
      try {
        const result = await pool.query(
          `SELECT game_id, crash_point, revealed_seed, hash_result 
           FROM game_rounds 
           WHERE game_id = $1 AND status = 'completed'`,
          [gameId]
        );
        
        if (result.rows.length === 0) {
          socket.emit('verification_result', { 
            error: 'Game not found or not completed' 
          });
          return;
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
        
        socket.emit('verification_result', {
          game_id: game.game_id,
          crash_point: game.crash_point,
          seed: game.revealed_seed,
          stored_hash: game.hash_result,
          calculated_hash: calculatedHash,
          verified: hashesMatch
        });
      } catch (error) {
        console.error('Game verification error:', error);
        socket.emit('verification_result', { error: 'Server error verifying game' });
      }
    });
    
    // Heartbeat to keep connection alive
    socket.on('heartbeat', () => {
      socket.emit('heartbeat_ack');
    });
    
    // Disconnect event
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
    
    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });
};