/**
 * Health API Routes Unit Tests
 *
 * Test suite for health monitoring endpoints including
 * basic health checks, readiness probes, and system metrics.
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const request = require('supertest');
const express = require('express');
const healthRoutes = require('../../../src/api/routes/health');
const { dbConnection } = require('../../../src/database/connection');
const { providerFactory } = require('../../../src/providers/ProviderFactory');
const { MigrationManager } = require('../../../src/database/migrate');

// Mock dependencies
jest.mock('../../../src/database/connection');
jest.mock('../../../src/providers/ProviderFactory');
jest.mock('../../../src/database/migrate');

describe('Health API Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use('/health', healthRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    test('should return healthy status when all systems are operational', async () => {
      // Mock healthy database
      dbConnection.isConnected = true;
      dbConnection.query = jest.fn().mockResolvedValue({ rows: [{ test: 1 }] });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('responseTime');
    });

    test('should return unhealthy status when database is disconnected', async () => {
      // Mock disconnected database
      dbConnection.isConnected = false;

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });

    test('should return unhealthy status when database query fails', async () => {
      // Mock database connection but failing query
      dbConnection.isConnected = true;
      dbConnection.query = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
    });

    test('should handle internal errors gracefully', async () => {
      // Mock unexpected error
      dbConnection.isConnected = true;
      dbConnection.query = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('responseTime');
    });

    test('should include response time in status', async () => {
      dbConnection.isConnected = true;
      dbConnection.query = jest.fn().mockResolvedValue({ rows: [{ test: 1 }] });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.responseTime).toBeGreaterThan(0);
      expect(typeof response.body.responseTime).toBe('number');
    });
  });

  describe('GET /health/ready', () => {
    test('should return ready status when all services are healthy', async () => {
      // Mock healthy database
      dbConnection.isConnected = true;
      dbConnection.query = jest.fn().mockResolvedValue({ rows: [{ test: 1 }] });
      dbConnection.beginTransaction = jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({}),
        rollback: jest.fn().mockResolvedValue({})
      });
      dbConnection.getPoolStatus = jest.fn().mockReturnValue({
        totalConnections: 5,
        idleConnections: 3,
        waitingCount: 0
      });

      // Mock healthy provider factory
      providerFactory.isInitialized = true;
      providerFactory.getHealthStatus = jest.fn().mockResolvedValue({
        totalProviders: 2,
        healthyProviders: 2,
        healthyPercentage: 100,
        providers: {
          mpesa: { healthy: true, initialized: true },
          stripe: { healthy: true, initialized: true }
        }
      });

      // Mock healthy migrations
      MigrationManager.mockImplementation(() => ({
        getStatus: jest.fn().mockResolvedValue({
          total: 5,
          executed: 5,
          pending: 0,
          isUpToDate: true,
          lastMigration: {
            migration_name: '005_latest_migration',
            executed_at: new Date().toISOString()
          }
        })
      }));

      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.services).toHaveProperty('database');
      expect(response.body.services).toHaveProperty('providers');
      expect(response.body.services).toHaveProperty('migrations');
      expect(response.body).toHaveProperty('metrics');
      expect(response.body.services.database.status).toBe('healthy');
      expect(response.body.services.providers.status).toBe('healthy');
      expect(response.body.services.migrations.status).toBe('healthy');
    });

    test('should return degraded status when some services have issues', async () => {
      // Mock slow database
      dbConnection.isConnected = true;
      dbConnection.query = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ rows: [{ test: 1 }] }), 6000))
      );
      dbConnection.beginTransaction = jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({}),
        rollback: jest.fn().mockResolvedValue({})
      });
      dbConnection.getPoolStatus = jest.fn().mockReturnValue({
        totalConnections: 5,
        idleConnections: 1,
        waitingCount: 0
      });

      // Mock partially healthy providers
      providerFactory.isInitialized = true;
      providerFactory.getHealthStatus = jest.fn().mockResolvedValue({
        totalProviders: 2,
        healthyProviders: 1,
        healthyPercentage: 50,
        providers: {
          mpesa: { healthy: true, initialized: true },
          stripe: { healthy: false, initialized: false }
        }
      });

      // Mock up-to-date migrations
      MigrationManager.mockImplementation(() => ({
        getStatus: jest.fn().mockResolvedValue({
          total: 5,
          executed: 5,
          pending: 0,
          isUpToDate: true
        })
      }));

      const response = await request(app)
        .get('/health/ready')
        .expect(503);

      expect(response.body.status).toBe('degraded');
      expect(response.body.services.providers.status).toBe('degraded');
    });

    test('should return unhealthy status when critical services fail', async () => {
      // Mock failed database
      dbConnection.isConnected = false;
      dbConnection.query = jest.fn().mockRejectedValue(new Error('Database down'));

      // Mock uninitialized provider factory
      providerFactory.isInitialized = false;

      // Mock pending migrations
      MigrationManager.mockImplementation(() => ({
        getStatus: jest.fn().mockResolvedValue({
          total: 5,
          executed: 3,
          pending: 2,
          isUpToDate: false
        })
      }));

      const response = await request(app)
        .get('/health/ready')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.database.status).toBe('unhealthy');
    });

    test('should handle service check failures gracefully', async () => {
      // Mock services that throw errors
      dbConnection.isConnected = true;
      dbConnection.query = jest.fn().mockRejectedValue(new Error('DB Error'));

      providerFactory.isInitialized = true;
      providerFactory.getHealthStatus = jest.fn().mockRejectedValue(new Error('Provider Error'));

      MigrationManager.mockImplementation(() => ({
        getStatus: jest.fn().mockRejectedValue(new Error('Migration Error'))
      }));

      const response = await request(app)
        .get('/health/ready')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.database.status).toBe('unhealthy');
      expect(response.body.services.providers.status).toBe('unhealthy');
      expect(response.body.services.migrations.status).toBe('unhealthy');
    });

    test('should include system metrics in response', async () => {
      // Mock minimal healthy state
      dbConnection.isConnected = true;
      dbConnection.query = jest.fn().mockResolvedValue({ rows: [{}] });
      dbConnection.beginTransaction = jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({}),
        rollback: jest.fn().mockResolvedValue({})
      });
      dbConnection.getPoolStatus = jest.fn().mockReturnValue({
        totalConnections: 1,
        idleConnections: 1
      });

      providerFactory.isInitialized = true;
      providerFactory.getHealthStatus = jest.fn().mockResolvedValue({
        totalProviders: 1,
        healthyProviders: 1,
        healthyPercentage: 100,
        providers: {}
      });

      MigrationManager.mockImplementation(() => ({
        getStatus: jest.fn().mockResolvedValue({
          isUpToDate: true,
          total: 1,
          executed: 1,
          pending: 0
        })
      }));

      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body.metrics).toHaveProperty('memory');
      expect(response.body.metrics).toHaveProperty('cpu');
      expect(response.body.metrics).toHaveProperty('process');
      expect(response.body.metrics.memory).toHaveProperty('used');
      expect(response.body.metrics.memory).toHaveProperty('total');
      expect(response.body.metrics.memory).toHaveProperty('usage');
    });
  });

  describe('GET /health/live', () => {
    test('should always return alive status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body.alive).toBe(true);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('pid');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.pid).toBe('number');
      expect(typeof response.body.uptime).toBe('number');
    });

    test('should return current process information', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body.pid).toBe(process.pid);
      expect(response.body.uptime).toBeGreaterThan(0);
    });
  });

  describe('GET /health/metrics', () => {
    test('should return system metrics successfully', async () => {
      // Mock database metrics
      dbConnection.getPoolStatus = jest.fn().mockReturnValue({
        totalConnections: 10,
        idleConnections: 5,
        waitingCount: 0
      });

      dbConnection.query = jest.fn().mockResolvedValue({
        rows: [{
          transaction_count: '150',
          earliest_transaction: new Date().toISOString(),
          latest_transaction: new Date().toISOString()
        }]
      });

      // Mock provider metrics
      providerFactory.isInitialized = true;
      providerFactory.getProviderCapabilities = jest.fn().mockReturnValue([
        { name: 'mpesa', isAvailable: true, isImplemented: true },
        { name: 'stripe', isAvailable: false, isImplemented: true }
      ]);
      providerFactory.getEnabledProviders = jest.fn().mockReturnValue(['mpesa']);

      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('cpu');
      expect(response.body).toHaveProperty('process');
      expect(response.body).toHaveProperty('loadAverage');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('providers');

      // Verify memory metrics structure
      expect(response.body.memory).toHaveProperty('used');
      expect(response.body.memory).toHaveProperty('total');
      expect(response.body.memory).toHaveProperty('usage');
      expect(response.body.memory).toHaveProperty('rss');

      // Verify database metrics
      expect(response.body.database).toHaveProperty('totalConnections');
      expect(response.body.database).toHaveProperty('transactionsLast24h');

      // Verify provider metrics
      expect(response.body.providers).toHaveProperty('totalProviders');
      expect(response.body.providers).toHaveProperty('enabledProviders');
    });

    test('should handle database metrics errors gracefully', async () => {
      // Mock database error
      dbConnection.getPoolStatus = jest.fn().mockImplementation(() => {
        throw new Error('Pool status error');
      });

      dbConnection.query = jest.fn().mockRejectedValue(new Error('Query error'));

      // Mock working provider metrics
      providerFactory.isInitialized = true;
      providerFactory.getProviderCapabilities = jest.fn().mockReturnValue([]);
      providerFactory.getEnabledProviders = jest.fn().mockReturnValue([]);

      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      expect(response.body.database).toHaveProperty('error');
      expect(response.body.database.error).toBe('Database metrics unavailable');
    });

    test('should handle provider metrics errors gracefully', async () => {
      // Mock working database metrics
      dbConnection.getPoolStatus = jest.fn().mockReturnValue({
        totalConnections: 5,
        idleConnections: 3
      });

      dbConnection.query = jest.fn().mockResolvedValue({
        rows: [{ transaction_count: '0' }]
      });

      // Mock provider error
      providerFactory.isInitialized = false;

      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      expect(response.body.providers).toHaveProperty('error');
      expect(response.body.providers.error).toBe('Provider metrics unavailable');
    });

    test('should handle complete metrics failure', async () => {
      // Mock all systems failing
      dbConnection.getPoolStatus = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      providerFactory.isInitialized = false;

      const response = await request(app)
        .get('/health/metrics')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Failed to retrieve metrics');
    });

    test('should include load average information', async () => {
      // Mock minimal working state
      dbConnection.getPoolStatus = jest.fn().mockReturnValue({});
      dbConnection.query = jest.fn().mockResolvedValue({ rows: [{}] });
      providerFactory.isInitialized = true;
      providerFactory.getProviderCapabilities = jest.fn().mockReturnValue([]);
      providerFactory.getEnabledProviders = jest.fn().mockReturnValue([]);

      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      expect(response.body.loadAverage).toBeInstanceOf(Array);
      expect(response.body.loadAverage).toHaveLength(3);
      response.body.loadAverage.forEach(load => {
        expect(typeof load).toBe('number');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle unexpected errors in health endpoint', async () => {
      // Force an error by mocking a critical function to throw
      const originalUptime = process.uptime;
      process.uptime = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body).toHaveProperty('error');

      // Restore original function
      process.uptime = originalUptime;
    });

    test('should handle memory usage calculation errors', async () => {
      // Mock process.memoryUsage to throw
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockImplementation(() => {
        throw new Error('Memory error');
      });

      // Mock minimal working database and providers
      dbConnection.getPoolStatus = jest.fn().mockReturnValue({});
      dbConnection.query = jest.fn().mockResolvedValue({ rows: [{}] });
      providerFactory.isInitialized = true;
      providerFactory.getProviderCapabilities = jest.fn().mockReturnValue([]);
      providerFactory.getEnabledProviders = jest.fn().mockReturnValue([]);

      const response = await request(app)
        .get('/health/metrics')
        .expect(500);

      expect(response.body).toHaveProperty('error');

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    test('should validate request IDs in error responses', async () => {
      // Add request ID middleware for testing
      const appWithRequestId = express();
      appWithRequestId.use((req, res, next) => {
        req.requestId = 'test-request-id';
        next();
      });
      appWithRequestId.use('/health', healthRoutes);

      // Force an error
      dbConnection.isConnected = true;
      dbConnection.query = jest.fn().mockRejectedValue(new Error('Test error'));

      const response = await request(appWithRequestId)
        .get('/health')
        .expect(503);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Response Format Validation', () => {
    test('should return consistent timestamp format', async () => {
      dbConnection.isConnected = true;
      dbConnection.query = jest.fn().mockResolvedValue({ rows: [{}] });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('should return numeric values for metrics', async () => {
      dbConnection.isConnected = true;
      dbConnection.query = jest.fn().mockResolvedValue({ rows: [{}] });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(typeof response.body.uptime).toBe('number');
      expect(typeof response.body.responseTime).toBe('number');
      expect(response.body.uptime).toBeGreaterThan(0);
      expect(response.body.responseTime).toBeGreaterThan(0);
    });

    test('should return proper boolean values', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(typeof response.body.alive).toBe('boolean');
      expect(response.body.alive).toBe(true);
    });
  });
});