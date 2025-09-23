/**
 * Jest Test Setup
 * Global configuration for all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test_user:test_password@localhost:5432/test_stakeout_db';

// Set longer timeout for integration tests
jest.setTimeout(30000);

// Mock console methods during tests to reduce noise
global.console = {
  ...console,
  // Keep error and warn for debugging
  error: jest.fn(),
  warn: jest.fn(),
  // Mock info and log to reduce noise
  info: jest.fn(),
  log: jest.fn(),
};

// Global test utilities
global.testUtils = {
  // Helper to create test user data
  createTestUser: () => ({
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: 'testpassword123'
  }),

  // Helper to create test game data
  createTestGame: () => ({
    crashPoint: 2.50,
    seed: 'test-seed-123',
    hash: 'test-hash-456'
  }),

  // Helper to create test bet data
  createTestBet: (userId, gameId) => ({
    userId: userId || 1,
    gameId: gameId || 1,
    amount: 100,
    cashOutMultiplier: null,
    cashOutAmount: null
  })
};

// Mock external dependencies
jest.mock('socket.io', () => {
  const mockSocket = {
    emit: jest.fn(),
    on: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
    id: 'mock-socket-id'
  };

  return {
    Server: jest.fn(() => ({
      on: jest.fn(),
      emit: jest.fn(),
      sockets: {
        emit: jest.fn()
      }
    })),
    Socket: jest.fn(() => mockSocket)
  };
});

// Setup and teardown for each test file
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up any test data if needed
});