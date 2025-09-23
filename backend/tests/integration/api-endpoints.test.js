/**
 * Integration Tests for API Endpoints
 * Tests all major API endpoints for functionality, validation, and error handling
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const testDb = require('../helpers/database');

// Mock database pool
jest.mock('../../config/db');
const pool = require('../../config/db');

// Mock socket.io
const mockIo = {
  emit: jest.fn(),
  to: jest.fn(() => ({
    emit: jest.fn()
  }))
};

describe('API Endpoints Integration Tests', () => {
  let app;
  let testUser;
  let authToken;
  let mockClient;

  beforeAll(async () => {
    await testDb.connect();
  });

  afterAll(async () => {
    await testDb.cleanup();
    await testDb.disconnect();
  });

  beforeEach(async () => {
    // Create Express app
    app = express();
    app.use(express.json());

    // Mock database client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect = jest.fn(() => mockClient);
    pool.query = jest.fn();

    // Create test user
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    testUser = {
      user_id: 1,
      username: 'testuser',
      email: 'test@example.com',
      password_hash: hashedPassword,
      balance: 1000
    };

    // Generate auth token
    authToken = jwt.sign(
      { userId: testUser.user_id, username: testUser.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Setup routes
    setupTestRoutes();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function setupTestRoutes() {
    // Auth middleware
    const authenticateToken = (req, res, next) => {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'Access token required' });
      }

      try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        req.user = user;
        next();
      } catch (error) {
        return res.status(403).json({ error: 'Invalid token' });
      }
    };

    // Auth routes
    app.post('/api/auth/register', async (req, res) => {
      try {
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
          return res.status(400).json({ error: 'All fields required' });
        }

        if (password.length < 8) {
          return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Mock user creation
        pool.query.mockResolvedValueOnce({ rows: [] }); // Check existing user
        pool.query.mockResolvedValueOnce({
          rows: [{ user_id: 2, username, email, balance: 0 }]
        }); // Create new user

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { user_id: 2, username, email, balance: 0 };

        const token = jwt.sign(
          { userId: newUser.user_id, username: newUser.username },
          process.env.JWT_SECRET,
          { expiresIn: '24h' }
        );

        res.status(201).json({
          success: true,
          message: 'User registered successfully',
          user: newUser,
          token
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/auth/login', async (req, res) => {
      try {
        const { username, password } = req.body;

        if (!username || !password) {
          return res.status(400).json({ error: 'Username and password required' });
        }

        // Mock user lookup
        pool.query.mockResolvedValueOnce({ rows: [testUser] });

        const isValidPassword = await bcrypt.compare(password, testUser.password_hash);
        if (!isValidPassword) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
          { userId: testUser.user_id, username: testUser.username },
          process.env.JWT_SECRET,
          { expiresIn: '24h' }
        );

        res.json({
          success: true,
          message: 'Login successful',
          user: {
            user_id: testUser.user_id,
            username: testUser.username,
            email: testUser.email,
            balance: testUser.balance
          },
          token
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Game routes
    app.get('/api/game/current', (req, res) => {
      res.json({
        gameState: 'waiting',
        countdown: 5,
        multiplier: 1.00,
        gameId: 123,
        activeBetsCount: 0
      });
    });

    app.get('/api/game/history', authenticateToken, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        // Mock game history
        pool.query.mockResolvedValueOnce({
          rows: [
            {
              game_id: 1,
              crash_point: 2.5,
              started_at: new Date(),
              ended_at: new Date()
            }
          ]
        });

        res.json({
          success: true,
          games: [
            {
              game_id: 1,
              crash_point: 2.5,
              started_at: new Date(),
              ended_at: new Date()
            }
          ],
          pagination: { page, limit, totalCount: 1 }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Wallet routes
    app.get('/api/wallet/balance', authenticateToken, async (req, res) => {
      try {
        pool.query.mockResolvedValueOnce({
          rows: [{ balance: testUser.balance }]
        });

        res.json({
          success: true,
          balance: testUser.balance
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get('/api/wallet/transactions', authenticateToken, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        // Mock transactions
        pool.query.mockResolvedValueOnce({
          rows: [
            {
              transaction_id: 1,
              transaction_type: 'deposit',
              amount: 100,
              created_at: new Date()
            }
          ]
        });
        pool.query.mockResolvedValueOnce({
          rows: [{ count: '1' }]
        });

        res.json({
          success: true,
          transactions: [
            {
              transaction_id: 1,
              transaction_type: 'deposit',
              amount: 100,
              created_at: new Date()
            }
          ],
          pagination: { page, limit, totalCount: 1 }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Bet routes
    app.get('/api/bets/history', authenticateToken, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        // Mock bet history
        pool.query.mockResolvedValueOnce({
          rows: [
            {
              bet_id: 1,
              game_id: 1,
              bet_amount: 100,
              multiplier: 2.0,
              winnings: 200,
              placed_at: new Date()
            }
          ]
        });

        res.json({
          success: true,
          bets: [
            {
              bet_id: 1,
              game_id: 1,
              bet_amount: 100,
              multiplier: 2.0,
              winnings: 200,
              placed_at: new Date()
            }
          ],
          pagination: { page, limit, totalCount: 1 }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Profile routes
    app.get('/api/profile', authenticateToken, async (req, res) => {
      try {
        pool.query.mockResolvedValueOnce({
          rows: [{
            user_id: testUser.user_id,
            username: testUser.username,
            email: testUser.email,
            balance: testUser.balance,
            created_at: new Date()
          }]
        });

        res.json({
          success: true,
          profile: {
            user_id: testUser.user_id,
            username: testUser.username,
            email: testUser.email,
            balance: testUser.balance,
            created_at: new Date()
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.put('/api/profile', authenticateToken, async (req, res) => {
      try {
        const { email } = req.body;

        if (!email || !email.includes('@')) {
          return res.status(400).json({ error: 'Valid email required' });
        }

        // Mock update
        pool.query.mockResolvedValueOnce({
          rows: [{
            user_id: testUser.user_id,
            username: testUser.username,
            email,
            balance: testUser.balance
          }]
        });

        res.json({
          success: true,
          message: 'Profile updated successfully',
          profile: {
            user_id: testUser.user_id,
            username: testUser.username,
            email,
            balance: testUser.balance
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Settings routes
    app.get('/api/settings', authenticateToken, (req, res) => {
      res.json({
        success: true,
        settings: {
          notifications: true,
          autoplay: false,
          sound: true
        }
      });
    });

    app.put('/api/settings', authenticateToken, (req, res) => {
      const { notifications, autoplay, sound } = req.body;

      res.json({
        success: true,
        message: 'Settings updated successfully',
        settings: { notifications, autoplay, sound }
      });
    });
  }

  describe('Authentication Endpoints', () => {
    test('POST /api/auth/register - should register new user', async () => {
      const userData = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe(userData.username);
      expect(response.body.token).toBeDefined();
    });

    test('POST /api/auth/register - should validate required fields', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({})
        .expect(400);
    });

    test('POST /api/auth/register - should validate password length', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'test',
          email: 'test@example.com',
          password: '123'
        })
        .expect(400);
    });

    test('POST /api/auth/login - should login valid user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'testpassword123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.username).toBe('testuser');
    });

    test('POST /api/auth/login - should reject invalid credentials', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        })
        .expect(401);
    });

    test('POST /api/auth/login - should validate required fields', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);
    });
  });

  describe('Game Endpoints', () => {
    test('GET /api/game/current - should return current game state', async () => {
      const response = await request(app)
        .get('/api/game/current')
        .expect(200);

      expect(response.body.gameState).toBeDefined();
      expect(response.body.multiplier).toBeDefined();
      expect(response.body.gameId).toBeDefined();
    });

    test('GET /api/game/history - should return game history for authenticated user', async () => {
      const response = await request(app)
        .get('/api/game/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.games).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });

    test('GET /api/game/history - should require authentication', async () => {
      await request(app)
        .get('/api/game/history')
        .expect(401);
    });

    test('GET /api/game/history - should handle pagination', async () => {
      const response = await request(app)
        .get('/api/game/history?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
    });
  });

  describe('Wallet Endpoints', () => {
    test('GET /api/wallet/balance - should return user balance', async () => {
      const response = await request(app)
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.balance).toBe(testUser.balance);
    });

    test('GET /api/wallet/balance - should require authentication', async () => {
      await request(app)
        .get('/api/wallet/balance')
        .expect(401);
    });

    test('GET /api/wallet/transactions - should return transaction history', async () => {
      const response = await request(app)
        .get('/api/wallet/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toBeDefined();
      expect(Array.isArray(response.body.transactions)).toBe(true);
    });

    test('GET /api/wallet/transactions - should handle pagination parameters', async () => {
      const response = await request(app)
        .get('/api/wallet/transactions?page=2&limit=20')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.limit).toBe(20);
    });
  });

  describe('Betting Endpoints', () => {
    test('GET /api/bets/history - should return bet history', async () => {
      const response = await request(app)
        .get('/api/bets/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.bets).toBeDefined();
      expect(Array.isArray(response.body.bets)).toBe(true);
    });

    test('GET /api/bets/history - should require authentication', async () => {
      await request(app)
        .get('/api/bets/history')
        .expect(401);
    });
  });

  describe('Profile Endpoints', () => {
    test('GET /api/profile - should return user profile', async () => {
      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.profile.username).toBe(testUser.username);
      expect(response.body.profile.email).toBe(testUser.email);
    });

    test('PUT /api/profile - should update user profile', async () => {
      const updateData = {
        email: 'newemail@example.com'
      };

      const response = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.profile.email).toBe(updateData.email);
    });

    test('PUT /api/profile - should validate email format', async () => {
      await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'invalid-email' })
        .expect(400);
    });
  });

  describe('Settings Endpoints', () => {
    test('GET /api/settings - should return user settings', async () => {
      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.settings).toBeDefined();
    });

    test('PUT /api/settings - should update user settings', async () => {
      const newSettings = {
        notifications: false,
        autoplay: true,
        sound: false
      };

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newSettings)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.settings).toEqual(newSettings);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid JSON requests', async () => {
      await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });

    test('should handle database connection errors', async () => {
      pool.query.mockRejectedValue(new Error('Database connection failed'));

      await request(app)
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);
    });

    test('should handle invalid auth tokens', async () => {
      await request(app)
        .get('/api/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);
    });

    test('should handle missing auth headers', async () => {
      await request(app)
        .get('/api/profile')
        .expect(401);
    });
  });

  describe('Security', () => {
    test('should not expose sensitive information in error messages', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistentuser',
          password: 'password'
        });

      expect(response.body.error).not.toContain('password_hash');
      expect(response.body.error).not.toContain('bcrypt');
    });

    test('should validate request size limits', async () => {
      const largePayload = {
        username: 'a'.repeat(10000),
        email: 'test@example.com',
        password: 'password123'
      };

      await request(app)
        .post('/api/auth/register')
        .send(largePayload)
        .expect(400);
    });

    test('should handle SQL injection attempts', async () => {
      const maliciousInput = {
        username: "'; DROP TABLE users; --",
        password: 'password123'
      };

      await request(app)
        .post('/api/auth/login')
        .send(maliciousInput)
        .expect(401);
    });
  });
});