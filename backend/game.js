// backend/game.js - The core game engine

const crypto = require('crypto');
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

class GameServer {
  constructor(io) {
    // Socket.io instance
    this.io = io;
    
    // Game state
    this.gameState = 'waiting'; // 'waiting', 'running', 'crashed'
    this.countdown = 5;
    this.multiplier = 1.00;
    this.crashPoint = 0;
    this.gameStartTime = null;
    this.gameId = null;
    this.lastUpdateTime = null;
    
    // Game hash for provable fairness
    this.currentGameHash = null;
    this.previousGameSeed = null;
    this.previousGameHash = null;
    
    // Active bets for current game
    this.activeBets = new Map(); // userId -> bet data
    
    // Game loop interval
    this.timerInterval = null;
    this.updateInterval = null;
    
    // Initialize the game
    this.initGame();
  }
  
  async initGame() {
    try {
      // Generate the next game's crash point and hash
      await this.generateNextGame();
      
      // Start the countdown
      this.startCountdown();
    } catch (error) {
      console.error('Game initialization error:', error);
      // Retry initialization after a short delay
      setTimeout(() => this.initGame(), 5000);
    }
  }
  
  async generateNextGame() {
    try {
      // Generate a secure random seed for this game
      const seed = crypto.randomBytes(16).toString('hex');
      
      // Calculate crash point using the seed
      // This is deterministic: same seed always gives same crash point
      const hash = crypto.createHash('sha256').update(seed).digest('hex');
      
      // Convert first 8 chars of hash to a number between 0 and 1
      const hashFloat = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
      
      // Apply the house edge (1%) and calculate the crash point
      // Formula: 99 / (1 - R) where R is the random value between 0-1
      // This creates an exponential distribution with a house edge
      const houseEdgeModifier = 0.99; // 1% house edge
      const e = Math.floor(100 * houseEdgeModifier / (1 - hashFloat));
      
      // Limit the maximum crash point (optional)
      const maxCrashPoint = 1000.00;
      const crashPoint = Math.min(e / 100, maxCrashPoint);
      
      // Store the crash point and create a hash commitment
      // We reveal the seed after the game ends to prove fairness
      this.crashPoint = parseFloat(crashPoint.toFixed(2));
      this.previousGameSeed = this.currentGameSeed;
      this.previousGameHash = this.currentGameHash;
      this.currentGameSeed = seed;
      this.currentGameHash = hash;
      
      // Create a new game record in the database
      const result = await pool.query(
        `INSERT INTO game_rounds (crash_point, hash_seed, hash_result) 
         VALUES ($1, $2, $3) RETURNING game_id`,
        [this.crashPoint, seed, hash]
      );
      
      this.gameId = result.rows[0].game_id;
      
      console.log(`Created game ${this.gameId} with crash point ${this.crashPoint}x`);
    } catch (error) {
      console.error('Error generating game:', error);
      throw error;
    }
  }
  
  startCountdown() {
    this.gameState = 'waiting';
    this.countdown = 5;
    this.multiplier = 1.00;
    this.activeBets = new Map();
    
    // Notify clients about the new game round
    this.broadcastGameState();
    
    // Start countdown timer
    this.timerInterval = setInterval(() => {
      this.countdown -= 1;
      
      // Broadcast updated countdown
      this.broadcastGameState();
      
      if (this.countdown <= 0) {
        clearInterval(this.timerInterval);
        this.startGame();
      }
    }, 1000);
  }
  
  startGame() {
    try {
      // Update game state
      this.gameState = 'running';
      this.multiplier = 1.00;
      this.gameStartTime = Date.now();
      this.lastUpdateTime = this.gameStartTime;
      
      // Notify clients that the game has started
      this.broadcastGameState();
      
      // Lock in all active bets
      this.lockBets();
      
      // Start the game loop
      this.updateInterval = setInterval(() => this.updateGameState(), 50); // 20 updates per second
      
      console.log(`Game ${this.gameId} started. Will crash at ${this.crashPoint}x`);
    } catch (error) {
      console.error('Error starting game:', error);
      this.handleGameError();
    }
  }
  
  updateGameState() {
    try {
      const currentTime = Date.now();
      const elapsedSeconds = (currentTime - this.gameStartTime) / 1000;
      
      // Calculate the new multiplier using the same formula as the client used
      // This ensures consistency with what players expect
      const newMultiplier = parseFloat(Math.pow(1.0316, elapsedSeconds).toFixed(2));
      
      // Check if we've reached the crash point
      if (newMultiplier >= this.crashPoint) {
        this.crash();
        return;
      }
      
      // Only update if the multiplier has changed
      // (reduces unnecessary broadcasts)
      if (newMultiplier > this.multiplier) {
        this.multiplier = newMultiplier;
        
        // We don't need to broadcast on every update (to reduce load)
        // Instead broadcast:
        // 1. Every 100ms for multipliers < 2x
        // 2. Every 250ms for multipliers 2x-10x
        // 3. Every 500ms for multipliers >10x
        const timeSinceLastUpdate = currentTime - this.lastUpdateTime;
        let shouldUpdate = false;
        
        if (newMultiplier < 2 && timeSinceLastUpdate >= 100) shouldUpdate = true;
        else if (newMultiplier < 10 && timeSinceLastUpdate >= 250) shouldUpdate = true;
        else if (timeSinceLastUpdate >= 500) shouldUpdate = true;
        
        if (shouldUpdate) {
          this.broadcastGameState();
          this.lastUpdateTime = currentTime;
        }
        
        // Process any automatic cashouts
        this.processAutoCashouts();
      }
    } catch (error) {
      console.error('Error in game update:', error);
      this.handleGameError();
    }
  }
  
  async crash() {
    try {
      // Stop the game loop
      clearInterval(this.updateInterval);
      
      // Update game state
      this.gameState = 'crashed';
      
      // Broadcast the crash
      this.broadcastGameState();
      
      // Process game completion in the database
      await this.completeGame();
      
      // Start a new round after a short delay
      setTimeout(() => this.initGame(), 3000);
      
      console.log(`Game ${this.gameId} crashed at ${this.crashPoint}x`);
    } catch (error) {
      console.error('Error processing crash:', error);
      setTimeout(() => this.initGame(), 5000);
    }
  }
  
  async completeGame() {
    try {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Mark all remaining active bets as losses
        for (const [userId, bet] of this.activeBets.entries()) {
          await client.query(
            `INSERT INTO bet_history (user_id, game_id, bet_amount, multiplier, crash_point, winnings, cashout_trigger)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, this.gameId, bet.amount, 0, this.crashPoint, 0, 'none']
          );
        }
        
        // Update game record to completed
        await client.query(
          `UPDATE game_rounds SET 
           completed_at = NOW(),
           status = 'completed',
           revealed_seed = $1
           WHERE game_id = $2`,
          [this.currentGameSeed, this.gameId]
        );
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error completing game:', error);
      throw error;
    }
  }
  
  handleGameError() {
    // Stop all intervals
    clearInterval(this.timerInterval);
    clearInterval(this.updateInterval);
    
    // Refund all active bets
    this.refundAllBets();
    
    // Restart the game system
    setTimeout(() => this.initGame(), 5000);
  }
  
  async refundAllBets() {
    try {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        for (const [userId, bet] of this.activeBets.entries()) {
          // Refund the bet amount to user balance
          await client.query(
            'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
            [bet.amount, userId]
          );
          
          // Record the refunded bet
          await client.query(
            `INSERT INTO bet_history (user_id, game_id, bet_amount, multiplier, crash_point, winnings, cashout_trigger)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, this.gameId, bet.amount, 0, 0, bet.amount, 'refunded']
          );
        }
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error refunding bets:', error);
    }
  }
  
  async placeBet(userId, amount, autoCashoutAt, autoCashoutAmount) {
    if (this.gameState !== 'waiting') {
      return { success: false, error: 'Betting is closed for this round' };
    }
    
    if (this.activeBets.has(userId)) {
      return { success: false, error: 'You already have an active bet for this round' };
    }
    
    if (amount <= 0) {
      return { success: false, error: 'Bet amount must be greater than zero' };
    }
    
    try {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Check user balance
        const userResult = await client.query(
          'SELECT balance FROM users WHERE user_id = $1 FOR UPDATE',
          [userId]
        );
        
        if (userResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return { success: false, error: 'User not found' };
        }
        
        const balance = parseFloat(userResult.rows[0].balance);
        
        if (balance < amount) {
          await client.query('ROLLBACK');
          return { success: false, error: 'Insufficient balance' };
        }
        
        // Deduct bet amount from balance
        await client.query(
          'UPDATE users SET balance = balance - $1 WHERE user_id = $2',
          [amount, userId]
        );
        
        await client.query('COMMIT');
        
        // Add to active bets
        this.activeBets.set(userId, {
          amount,
          autoCashoutAt: autoCashoutAt || 0,
          autoCashoutAmount: autoCashoutAmount || 0,
          userId,
          placedAt: new Date()
        });
        
        return { 
          success: true, 
          message: 'Bet placed successfully',
          balance: balance - amount
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error placing bet:', error);
      return { success: false, error: 'Server error placing bet' };
    }
  }
  
  async cashOut(userId) {
    if (this.gameState !== 'running') {
      return { success: false, error: 'Game is not running' };
    }
    
    if (!this.activeBets.has(userId)) {
      return { success: false, error: 'No active bet found' };
    }
    
    try {
      // Get the user's bet
      const bet = this.activeBets.get(userId);
      
      // Calculate winnings
      const winnings = parseFloat((bet.amount * this.multiplier).toFixed(2));
      
      // Process the cashout in the database
      const result = await this.processCashout(userId, bet.amount, this.multiplier, winnings, 'manual');
      
      if (result.success) {
        // Remove from active bets
        this.activeBets.delete(userId);
        
        // Notify the specific user about their cashout
        this.io.to(`user-${userId}`).emit('cashout_result', {
          success: true,
          amount: bet.amount,
          multiplier: this.multiplier,
          winnings,
          newBalance: result.newBalance
        });
        
        // Broadcast the cashout to all users (for UI updates)
        this.io.emit('user_cashout', {
          userId,
          multiplier: this.multiplier
        });
        
        return { success: true, winnings, multiplier: this.multiplier };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Error processing cashout:', error);
      return { success: false, error: 'Server error processing cashout' };
    }
  }
  
  async processCashout(userId, betAmount, atMultiplier, winnings, trigger) {
    try {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Get user for balance update
        const userResult = await client.query(
          'SELECT balance FROM users WHERE user_id = $1 FOR UPDATE',
          [userId]
        );
        
        if (userResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return { success: false, error: 'User not found' };
        }
        
        const currentBalance = parseFloat(userResult.rows[0].balance);
        const newBalance = currentBalance + winnings;
        
        // Update user balance
        await client.query(
          'UPDATE users SET balance = $1 WHERE user_id = $2',
          [newBalance, userId]
        );
        
        // Record bet in history
        await client.query(
          `INSERT INTO bet_history (user_id, game_id, bet_amount, multiplier, crash_point, winnings, cashout_trigger) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, this.gameId, betAmount, atMultiplier, this.crashPoint, winnings, trigger]
        );
        
        await client.query('COMMIT');
        
        return { success: true, newBalance };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Database error during cashout:', error);
      return { success: false, error: 'Server error processing cashout' };
    }
  }
  
  processAutoCashouts() {
    // Check each active bet for auto-cashout conditions
    for (const [userId, bet] of this.activeBets.entries()) {
      // Check multiplier-based auto cashout
      if (bet.autoCashoutAt > 0 && this.multiplier >= bet.autoCashoutAt) {
        const winnings = parseFloat((bet.amount * this.multiplier).toFixed(2));
        this.processCashout(userId, bet.amount, this.multiplier, winnings, 'auto_multiplier')
          .then(result => {
            if (result.success) {
              // Remove from active bets
              this.activeBets.delete(userId);
              
              // Notify the user
              this.io.to(`user-${userId}`).emit('cashout_result', {
                success: true,
                amount: bet.amount,
                multiplier: this.multiplier,
                winnings,
                newBalance: result.newBalance,
                trigger: 'auto_multiplier'
              });
              
              // Broadcast the cashout
              this.io.emit('user_cashout', {
                userId, 
                multiplier: this.multiplier
              });
            }
          })
          .catch(error => console.error('Auto cashout error:', error));
      }
      
      // Check amount-based auto cashout
      if (bet.autoCashoutAmount > 0) {
        const potentialWinnings = bet.amount * this.multiplier;
        if (potentialWinnings >= bet.autoCashoutAmount) {
          const winnings = parseFloat(potentialWinnings.toFixed(2));
          this.processCashout(userId, bet.amount, this.multiplier, winnings, 'auto_amount')
            .then(result => {
              if (result.success) {
                // Remove from active bets
                this.activeBets.delete(userId);
                
                // Notify the user
                this.io.to(`user-${userId}`).emit('cashout_result', {
                  success: true,
                  amount: bet.amount,
                  multiplier: this.multiplier,
                  winnings,
                  newBalance: result.newBalance,
                  trigger: 'auto_amount'
                });
                
                // Broadcast the cashout
                this.io.emit('user_cashout', {
                  userId, 
                  multiplier: this.multiplier
                });
              }
            })
            .catch(error => console.error('Auto cashout error:', error));
        }
      }
    }
  }
  
  lockBets() {
    // Once the game starts, no more bets can be placed
    // This is just a timestamp to confirm when betting was closed
    console.log(`Game ${this.gameId} - Betting locked at ${new Date().toISOString()}`);
  }
  
  broadcastGameState() {
    // Send the current game state to all connected clients
    this.io.emit('game_state', {
      gameId: this.gameId,
      state: this.gameState,
      countdown: this.countdown,
      multiplier: this.multiplier,
      timestamp: Date.now(),
      activePlayers: this.activeBets.size,
      previousGameSeed: this.previousGameSeed,
      previousGameHash: this.previousGameHash,
      currentGameHash: this.currentGameHash
    });
  }
  
  // Allow clients to get the current state immediately on connection
  getGameState() {
    return {
      gameId: this.gameId,
      state: this.gameState,
      countdown: this.countdown,
      multiplier: this.multiplier,
      timestamp: Date.now(),
      activePlayers: this.activeBets.size,
      previousGameSeed: this.previousGameSeed,
      previousGameHash: this.previousGameHash,
      currentGameHash: this.currentGameHash
    };
  }
  
  // Check if a user has an active bet in the current game
  hasActiveBet(userId) {
    return this.activeBets.has(userId);
  }
  
  // Get the active bet for a user
  getActiveBet(userId) {
    return this.activeBets.get(userId) || null;
  }
}

module.exports = GameServer;