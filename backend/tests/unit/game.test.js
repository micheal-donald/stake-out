/**
 * Unit Tests for Game Engine
 * Tests the core game logic and state management
 */

const GameServer = require('../../game');
const testDb = require('../helpers/database');

// Mock the database pool
jest.mock('../../config/db', () => ({
  query: jest.fn(),
  connect: jest.fn(() => ({
    query: jest.fn(),
    release: jest.fn()
  }))
}));

const pool = require('../../config/db');

// Mock Socket.IO
const mockIo = {
  emit: jest.fn(),
  to: jest.fn(() => ({
    emit: jest.fn()
  })),
  sockets: {
    emit: jest.fn()
  }
};

describe('GameServer', () => {
  let gameServer;
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock database client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(mockClient);

    // Mock successful game creation
    pool.query.mockResolvedValue({
      rows: [{ game_id: 1 }]
    });

    gameServer = new GameServer(mockIo);

    // Stop automatic initialization for controlled testing
    clearInterval(gameServer.timerInterval);
    clearInterval(gameServer.updateInterval);
  });

  afterEach(() => {
    if (gameServer) {
      clearInterval(gameServer.timerInterval);
      clearInterval(gameServer.updateInterval);
    }
  });

  describe('Game Initialization', () => {
    test('should initialize with correct default state', () => {
      expect(gameServer.gameState).toBe('waiting');
      expect(gameServer.countdown).toBe(7); // After startCountdown is called in initGame
      expect(gameServer.multiplier).toBe(1.00);
      expect(gameServer.crashPoint).toBeGreaterThan(0); // Set during initGame
      expect(gameServer.activeBets).toBeInstanceOf(Map);
      expect(gameServer.activeBets.size).toBe(0);
    });

    test('should have valid Socket.IO instance', () => {
      expect(gameServer.io).toBeDefined();
      expect(typeof gameServer.io.emit).toBe('function');
    });
  });

  describe('Crash Point Generation', () => {
    test('should generate valid crash points', async () => {
      await gameServer.generateNextGame();

      expect(gameServer.crashPoint).toBeGreaterThan(0);
      expect(gameServer.crashPoint).toBeLessThanOrEqual(1000);
      expect(typeof gameServer.crashPoint).toBe('number');
      expect(Number.isFinite(gameServer.crashPoint)).toBe(true);
    });

    test('should generate different crash points for different calls', async () => {
      const crashPoints = new Set();

      // Generate multiple crash points
      for (let i = 0; i < 10; i++) {
        await gameServer.generateNextGame();
        crashPoints.add(gameServer.crashPoint);
      }

      // Should have generated different values (very high probability)
      expect(crashPoints.size).toBeGreaterThan(1);
    });

    test('should create game record in database', async () => {
      await gameServer.generateNextGame();

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO game_rounds'),
        expect.arrayContaining([
          expect.any(Number), // crash_point
          expect.any(String), // hash_seed
          expect.any(String)  // hash_result
        ])
      );
    });

    test('should set game ID from database response', async () => {
      const mockGameId = 42;
      pool.query.mockResolvedValue({
        rows: [{ game_id: mockGameId }]
      });

      await gameServer.generateNextGame();

      expect(gameServer.gameId).toBe(mockGameId);
    });
  });

  describe('Game State Management', () => {
    test('should start countdown correctly', () => {
      gameServer.startCountdown();

      expect(gameServer.gameState).toBe('waiting');
      expect(gameServer.countdown).toBe(7);
      expect(gameServer.multiplier).toBe(1.00);
    });

    test('should calculate multiplier correctly during game', () => {
      // Set up game as running
      gameServer.gameState = 'running';
      gameServer.gameStartTime = Date.now() - 5000; // 5 seconds ago
      gameServer.lastUpdateTime = gameServer.gameStartTime;

      // Call the actual method that updates multiplier
      gameServer.updateGameState();

      expect(gameServer.multiplier).toBeGreaterThan(1.00);
      expect(typeof gameServer.multiplier).toBe('number');
      expect(Number.isFinite(gameServer.multiplier)).toBe(true);
    });

    test('should not update multiplier when game is not running', () => {
      gameServer.gameState = 'waiting';
      gameServer.multiplier = 1.00;

      // updateGameState shouldn't change multiplier when not running
      gameServer.updateGameState();

      expect(gameServer.multiplier).toBe(1.00);
    });
  });

  describe('Bet Management', () => {
    const userId = 123;
    const betAmount = 100;

    beforeEach(() => {
      gameServer.gameState = 'waiting';
      gameServer.gameId = 1;
    });

    test('should accept valid bet during waiting phase', async () => {
      // Mock successful balance deduction - need to mock both BEGIN and UPDATE
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ balance: 400 }] }) // UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      const result = await gameServer.placeBet(userId, betAmount);

      expect(result.success).toBe(true);
      expect(gameServer.activeBets.has(userId)).toBe(true);
      expect(gameServer.activeBets.get(userId).amount).toBe(betAmount);
    });

    test('should reject bet if user has insufficient balance', async () => {
      // Mock insufficient balance - UPDATE returns 0 rows
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // UPDATE fails
        .mockResolvedValueOnce({}); // ROLLBACK

      const result = await gameServer.placeBet(userId, betAmount);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient balance or user not found');
      expect(gameServer.activeBets.has(userId)).toBe(false);
    });

    test('should reject bet during running phase', async () => {
      gameServer.gameState = 'running';

      const result = await gameServer.placeBet(userId, betAmount);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Betting is closed for this round');
      expect(gameServer.activeBets.has(userId)).toBe(false);
    });

    test('should reject invalid bet amounts', async () => {
      const invalidAmounts = [0, -10, 0.5, 10001];

      for (const amount of invalidAmounts) {
        const result = await gameServer.placeBet(userId, amount);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Bet must be between');
      }
    });
  });

  describe('Cash Out Functionality', () => {
    const userId = 123;
    const betAmount = 100;

    beforeEach(async () => {
      // Set up game state
      gameServer.gameState = 'running';
      gameServer.gameId = 1;
      gameServer.multiplier = 2.5;

      // Manually add a bet to test cashout
      gameServer.activeBets.set(userId, {
        amount: betAmount,
        autoCashoutAt: 0,
        autoCashoutAmount: 0,
        placedAt: new Date()
      });
    });

    test('should successfully cash out active bet', async () => {
      // Mock the processCashout method to return success
      gameServer.processCashout = jest.fn().mockResolvedValue({
        success: true,
        newBalance: 650
      });

      const result = await gameServer.cashOut(userId);

      expect(result.success).toBe(true);
      expect(result.winnings).toBe(250); // 100 * 2.5
      expect(gameServer.activeBets.has(userId)).toBe(false);
    });

    test('should reject cash out if no active bet', async () => {
      const nonExistentUserId = 999;

      const result = await gameServer.cashOut(nonExistentUserId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active bet found');
    });

    test('should reject cash out when game is not running', async () => {
      gameServer.gameState = 'crashed';

      const result = await gameServer.cashOut(userId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Game is not running');
    });

    test('should calculate winnings correctly', async () => {
      // Mock processCashout for each test
      gameServer.processCashout = jest.fn().mockResolvedValue({
        success: true,
        newBalance: 1000
      });

      const testMultipliers = [1.5, 2.0, 3.5, 10.0];

      for (const multiplier of testMultipliers) {
        // Reset bet
        gameServer.activeBets.set(userId, { amount: betAmount });
        gameServer.multiplier = multiplier;

        const result = await gameServer.cashOut(userId);
        const expectedWinnings = betAmount * multiplier;

        expect(result.winnings).toBe(expectedWinnings);
      }
    });
  });

  describe('Game Completion', () => {
    beforeEach(() => {
      gameServer.gameId = 1;
      gameServer.crashPoint = 2.5;
    });

    test('should complete game and clear active bets', async () => {
      // Add some active bets
      gameServer.activeBets.set(123, { amount: 100 });
      gameServer.activeBets.set(456, { amount: 200 });

      // Mock database operations
      mockClient.query.mockResolvedValue({ rows: [] });

      await gameServer.completeGame();

      expect(gameServer.activeBets.size).toBe(0);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('should record losing bets in database', async () => {
      const userId = 123;
      const betAmount = 100;
      gameServer.activeBets.set(userId, { amount: betAmount });

      mockClient.query.mockResolvedValue({ rows: [] });

      await gameServer.completeGame();

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bet_history'),
        expect.arrayContaining([
          userId,
          gameServer.gameId,
          betAmount,
          0, // multiplier (loss)
          gameServer.crashPoint,
          0, // winnings
          'none'
        ])
      );
    });

    test('should handle database errors gracefully', async () => {
      gameServer.activeBets.set(123, { amount: 100 });

      // Mock database error
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(gameServer.completeGame()).rejects.toThrow('Database error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('Provable Fairness', () => {
    test('should generate consistent hash for same seed', async () => {
      // Mock crypto.randomBytes to return a fixed seed
      const crypto = require('crypto');
      const originalRandomBytes = crypto.randomBytes;
      crypto.randomBytes = jest.fn(() => Buffer.from('0123456789abcdef', 'hex'));

      await gameServer.generateNextGame();
      const firstHash = gameServer.currentGameHash;

      await gameServer.generateNextGame();
      const secondHash = gameServer.currentGameHash;

      // Same seed should produce same hash
      expect(firstHash).toBe(secondHash);

      // Restore original function
      crypto.randomBytes = originalRandomBytes;
    });

    test('should store previous game data for verification', async () => {
      const initialSeed = gameServer.currentGameSeed;
      const initialHash = gameServer.currentGameHash;

      await gameServer.generateNextGame();

      expect(gameServer.previousGameSeed).toBe(initialSeed);
      expect(gameServer.previousGameHash).toBe(initialHash);
    });
  });

  describe('Error Handling', () => {
    test('should handle game initialization errors', async () => {
      pool.query.mockRejectedValue(new Error('Database connection failed'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      try {
        await gameServer.generateNextGame();
      } catch (error) {
        expect(error.message).toContain('Database connection failed');
      }

      expect(consoleSpy).toHaveBeenCalledWith('Error generating game:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    test('should refund all bets on error', async () => {
      // Add active bets
      gameServer.activeBets.set(123, { amount: 100 });
      gameServer.activeBets.set(456, { amount: 200 });

      mockClient.query.mockResolvedValue({ rows: [] });

      await gameServer.refundAllBets();

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
        [100, 123]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
        [200, 456]
      );
    });
  });

  describe('Broadcasting', () => {
    test('should broadcast game state to all clients', () => {
      gameServer.broadcastGameState();

      expect(mockIo.emit).toHaveBeenCalledWith('game_state', {
        gameId: gameServer.gameId,
        state: gameServer.gameState,
        countdown: gameServer.countdown,
        multiplier: gameServer.multiplier,
        timestamp: expect.any(Number),
        activePlayers: gameServer.activeBets.size,
        previousGameSeed: gameServer.previousGameSeed,
        previousGameHash: gameServer.previousGameHash,
        currentGameHash: gameServer.currentGameHash
      });
    });

    test('should send specific notifications to users', async () => {
      const userId = 123;
      gameServer.activeBets.set(userId, { amount: 100 });
      gameServer.gameState = 'crashed';

      mockClient.query.mockResolvedValue({ rows: [] });

      await gameServer.completeGame();

      expect(mockIo.to).toHaveBeenCalledWith(`user-${userId}`);
    });
  });
});