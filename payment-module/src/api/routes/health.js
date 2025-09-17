/**
 * Health Check Routes
 *
 * Provides comprehensive health monitoring endpoints for the payment module.
 * These endpoints are designed for load balancers, monitoring systems,
 * and operational teams to assess system health and readiness.
 *
 * Key Features:
 * - Basic health check (liveness probe)
 * - Detailed readiness probe
 * - System metrics and statistics
 * - Database connectivity check
 * - Payment provider status
 * - Performance metrics
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const express = require('express');
const router = express.Router();
const { dbConnection } = require('../../database/connection');
const { providerFactory } = require('../../providers/ProviderFactory');
const { MigrationManager } = require('../../database/migrate');
const logger = require('../../utils/logger');

/**
 * @swagger
 * components:
 *   schemas:
 *     HealthStatus:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [healthy, unhealthy, degraded]
 *           description: Overall health status
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: Health check timestamp
 *         uptime:
 *           type: number
 *           description: System uptime in seconds
 *         version:
 *           type: string
 *           description: Application version
 *
 *     DetailedHealth:
 *       allOf:
 *         - $ref: '#/components/schemas/HealthStatus'
 *         - type: object
 *           properties:
 *             services:
 *               type: object
 *               properties:
 *                 database:
 *                   $ref: '#/components/schemas/ServiceHealth'
 *                 providers:
 *                   $ref: '#/components/schemas/ServiceHealth'
 *                 migrations:
 *                   $ref: '#/components/schemas/ServiceHealth'
 *             metrics:
 *               $ref: '#/components/schemas/SystemMetrics'
 *
 *     ServiceHealth:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [healthy, unhealthy, degraded]
 *         message:
 *           type: string
 *           description: Status description
 *         responseTime:
 *           type: number
 *           description: Service response time in milliseconds
 *         details:
 *           type: object
 *           description: Service-specific health details
 *
 *     SystemMetrics:
 *       type: object
 *       properties:
 *         memory:
 *           type: object
 *           properties:
 *             used:
 *               type: number
 *               description: Used memory in bytes
 *             total:
 *               type: number
 *               description: Total memory in bytes
 *             usage:
 *               type: number
 *               description: Memory usage percentage
 *         cpu:
 *           type: object
 *           properties:
 *             user:
 *               type: number
 *               description: User CPU time in microseconds
 *             system:
 *               type: number
 *               description: System CPU time in microseconds
 *         process:
 *           type: object
 *           properties:
 *             pid:
 *               type: number
 *               description: Process ID
 *             nodeVersion:
 *               type: string
 *               description: Node.js version
 *             platform:
 *               type: string
 *               description: Operating system platform
 */

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     description: |
 *       Simple health check endpoint that returns basic status information.
 *       This endpoint is designed for load balancer health checks and
 *       basic monitoring systems. Returns 200 if system is operational.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthStatus'
 *       503:
 *         description: System is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthStatus'
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();

  try {
    // Basic health indicators
    const isHealthy = await performBasicHealthChecks();
    const responseTime = Date.now() - startTime;

    const healthStatus = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      responseTime
    };

    // Return appropriate status code
    const statusCode = isHealthy ? 200 : 503;

    logger.debug('Basic health check completed', {
      status: healthStatus.status,
      responseTime: healthStatus.responseTime,
      requestId: req.requestId
    });

    res.status(statusCode).json(healthStatus);

  } catch (error) {
    logger.error('Health check failed', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      error: error.message,
      responseTime: Date.now() - startTime
    });
  }
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness probe
 *     description: |
 *       Comprehensive readiness check that verifies all system components
 *       are ready to accept traffic. Includes database connectivity,
 *       payment provider status, and migration status.
 *
 *       This endpoint should be used by orchestration systems (like Kubernetes)
 *       to determine if the service is ready to receive requests.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: System is ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DetailedHealth'
 *       503:
 *         description: System is not ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DetailedHealth'
 */
router.get('/ready', async (req, res) => {
  const startTime = Date.now();

  try {
    // Comprehensive readiness checks
    const healthChecks = await Promise.allSettled([
      checkDatabaseHealth(),
      checkProvidersHealth(),
      checkMigrationsHealth()
    ]);

    const [dbHealth, providersHealth, migrationsHealth] = healthChecks.map(
      result => result.status === 'fulfilled' ? result.value : {
        status: 'unhealthy',
        message: result.reason?.message || 'Service check failed',
        responseTime: 0,
        details: { error: result.reason?.message }
      }
    );

    const services = {
      database: dbHealth,
      providers: providersHealth,
      migrations: migrationsHealth
    };

    // Determine overall health
    const serviceStatuses = Object.values(services).map(s => s.status);
    const hasUnhealthy = serviceStatuses.includes('unhealthy');
    const hasDegraded = serviceStatuses.includes('degraded');

    const overallStatus = hasUnhealthy ? 'unhealthy' :
                         hasDegraded ? 'degraded' : 'healthy';

    const healthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      responseTime: Date.now() - startTime,
      services,
      metrics: getSystemMetrics()
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 503;

    logger.info('Readiness check completed', {
      status: overallStatus,
      services: Object.fromEntries(
        Object.entries(services).map(([k, v]) => [k, v.status])
      ),
      responseTime: healthResponse.responseTime,
      requestId: req.requestId
    });

    res.status(statusCode).json(healthResponse);

  } catch (error) {
    logger.error('Readiness check failed', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      error: error.message,
      responseTime: Date.now() - startTime,
      services: {},
      metrics: getSystemMetrics()
    });
  }
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness probe
 *     description: |
 *       Simple liveness check that indicates if the application process
 *       is running and responsive. This endpoint should always return
 *       200 unless the process is completely unresponsive.
 *
 *       Used by orchestration systems to determine if a service instance
 *       should be restarted.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Service is alive and responsive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alive:
 *                   type: boolean
 *                   example: true
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 pid:
 *                   type: number
 *                   description: Process ID
 *                 uptime:
 *                   type: number
 *                   description: Process uptime in seconds
 */
router.get('/live', (req, res) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: process.uptime()
  });
});

/**
 * @swagger
 * /health/metrics:
 *   get:
 *     summary: System metrics
 *     description: |
 *       Detailed system performance metrics including memory usage,
 *       CPU utilization, and process information. Useful for
 *       monitoring and alerting systems.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: System metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SystemMetrics'
 *                 - type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     uptime:
 *                       type: number
 *                       description: System uptime in seconds
 *                     loadAverage:
 *                       type: array
 *                       items:
 *                         type: number
 *                       description: System load averages (1, 5, 15 minutes)
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ...getSystemMetrics(),
      loadAverage: require('os').loadavg(),
      database: await getDatabaseMetrics(),
      providers: await getProviderMetrics()
    };

    logger.debug('System metrics retrieved', {
      memoryUsage: metrics.memory.usage,
      uptime: metrics.uptime,
      requestId: req.requestId
    });

    res.json(metrics);

  } catch (error) {
    logger.error('Failed to retrieve system metrics', {
      error: error.message,
      requestId: req.requestId
    });

    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Perform basic health checks
 *
 * @async
 * @returns {Promise<boolean>} True if system is healthy
 */
async function performBasicHealthChecks() {
  try {
    // Check if database connection exists
    if (!dbConnection.isConnected) {
      return false;
    }

    // Quick database connectivity test
    await dbConnection.query('SELECT 1', [], { timeout: 5000 });

    return true;
  } catch (error) {
    logger.warn('Basic health check failed', { error: error.message });
    return false;
  }
}

/**
 * Check database health with detailed diagnostics
 *
 * @async
 * @returns {Promise<Object>} Database health status
 */
async function checkDatabaseHealth() {
  const startTime = Date.now();

  try {
    // Test basic connectivity
    await dbConnection.query('SELECT 1', [], { timeout: 10000 });

    // Test transaction capability
    const transaction = await dbConnection.beginTransaction();
    await transaction.query('SELECT NOW()');
    await transaction.rollback();

    const responseTime = Date.now() - startTime;

    // Check connection pool status
    const poolStatus = dbConnection.getPoolStatus();
    const isHealthy = poolStatus.totalConnections > 0 &&
                     poolStatus.idleConnections >= 0 &&
                     responseTime < 5000; // 5 second threshold

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      message: isHealthy ? 'Database is responsive' : 'Database response is slow',
      responseTime,
      details: {
        connected: dbConnection.isConnected,
        ...poolStatus,
        maxResponseTime: 5000
      }
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Database connectivity failed: ${error.message}`,
      responseTime: Date.now() - startTime,
      details: {
        connected: false,
        error: error.code || error.message
      }
    };
  }
}

/**
 * Check payment providers health
 *
 * @async
 * @returns {Promise<Object>} Providers health status
 */
async function checkProvidersHealth() {
  const startTime = Date.now();

  try {
    if (!providerFactory.isInitialized) {
      return {
        status: 'unhealthy',
        message: 'Provider factory not initialized',
        responseTime: Date.now() - startTime,
        details: { initialized: false }
      };
    }

    const healthStatus = await providerFactory.getHealthStatus();
    const responseTime = Date.now() - startTime;

    const isHealthy = healthStatus.healthyPercentage > 50; // At least 50% providers healthy
    const isDegraded = healthStatus.healthyPercentage > 0 && healthStatus.healthyPercentage <= 50;

    return {
      status: isHealthy ? 'healthy' : isDegraded ? 'degraded' : 'unhealthy',
      message: `${healthStatus.healthyProviders}/${healthStatus.totalProviders} providers healthy`,
      responseTime,
      details: {
        totalProviders: healthStatus.totalProviders,
        healthyProviders: healthStatus.healthyProviders,
        healthyPercentage: healthStatus.healthyPercentage,
        providerStatuses: healthStatus.providers
      }
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Provider health check failed: ${error.message}`,
      responseTime: Date.now() - startTime,
      details: { error: error.message }
    };
  }
}

/**
 * Check database migrations health
 *
 * @async
 * @returns {Promise<Object>} Migrations health status
 */
async function checkMigrationsHealth() {
  const startTime = Date.now();

  try {
    const migrationManager = new MigrationManager();
    const status = await migrationManager.getStatus();
    const responseTime = Date.now() - startTime;

    const isHealthy = status.isUpToDate;

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      message: isHealthy
        ? 'All migrations applied'
        : `${status.pending} pending migrations`,
      responseTime,
      details: {
        total: status.total,
        executed: status.executed,
        pending: status.pending,
        isUpToDate: status.isUpToDate,
        lastMigration: status.lastMigration
      }
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Migration check failed: ${error.message}`,
      responseTime: Date.now() - startTime,
      details: { error: error.message }
    };
  }
}

/**
 * Get system performance metrics
 *
 * @returns {Object} System metrics
 */
function getSystemMetrics() {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  return {
    memory: {
      used: memoryUsage.heapUsed,
      total: memoryUsage.heapTotal,
      usage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
      external: memoryUsage.external,
      rss: memoryUsage.rss
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime()
    }
  };
}

/**
 * Get database-specific metrics
 *
 * @async
 * @returns {Promise<Object>} Database metrics
 */
async function getDatabaseMetrics() {
  try {
    const poolStatus = dbConnection.getPoolStatus();

    // Get database-specific metrics
    const dbStats = await dbConnection.query(`
      SELECT
        COUNT(*) as transaction_count,
        MIN(created_at) as earliest_transaction,
        MAX(created_at) as latest_transaction
      FROM transactions
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    return {
      ...poolStatus,
      transactionsLast24h: parseInt(dbStats.rows[0]?.transaction_count || 0),
      earliestTransaction: dbStats.rows[0]?.earliest_transaction,
      latestTransaction: dbStats.rows[0]?.latest_transaction
    };

  } catch (error) {
    logger.warn('Failed to get database metrics', { error: error.message });
    return {
      error: 'Database metrics unavailable',
      message: error.message
    };
  }
}

/**
 * Get provider-specific metrics
 *
 * @async
 * @returns {Promise<Object>} Provider metrics
 */
async function getProviderMetrics() {
  try {
    if (!providerFactory.isInitialized) {
      return { error: 'Provider factory not initialized' };
    }

    const capabilities = providerFactory.getProviderCapabilities();
    const enabledProviders = providerFactory.getEnabledProviders();

    return {
      totalProviders: capabilities.length,
      enabledProviders: enabledProviders.length,
      availableProviders: capabilities.filter(p => p.isAvailable).length,
      implementedProviders: capabilities.filter(p => p.isImplemented).length,
      providerList: enabledProviders
    };

  } catch (error) {
    logger.warn('Failed to get provider metrics', { error: error.message });
    return {
      error: 'Provider metrics unavailable',
      message: error.message
    };
  }
}

module.exports = router;