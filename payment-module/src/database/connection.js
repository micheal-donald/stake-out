/**
 * Database Connection Manager
 *
 * Manages PostgreSQL database connections with connection pooling,
 * health monitoring, and graceful error handling. Supports both
 * standalone and shared database configurations.
 *
 * Features:
 * - Connection pooling with configurable limits
 * - Automatic reconnection with exponential backoff
 * - Health check monitoring
 * - Transaction management
 * - Query performance tracking
 * - Connection lifecycle logging
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { Pool, Client } = require('pg');
const logger = require('../utils/logger');

/**
 * Database connection configuration
 */
const DB_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  min: parseInt(process.env.DATABASE_POOL_MIN) || 2,
  max: parseInt(process.env.DATABASE_POOL_MAX) || 20,
  idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT) || 10000,
  statement_timeout: parseInt(process.env.DATABASE_STATEMENT_TIMEOUT) || 30000,
  query_timeout: parseInt(process.env.DATABASE_QUERY_TIMEOUT) || 10000,
  application_name: process.env.DATABASE_APP_NAME || 'payment-module',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

/**
 * Validate database configuration
 */
if (!DB_CONFIG.connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

/**
 * Database Connection Pool
 */
class DatabaseConnection {
  constructor(config = DB_CONFIG) {
    this.config = config;
    this.pool = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 1000; // Start with 1 second
    this.healthCheckInterval = null;
    this.queryCount = 0;
    this.errorCount = 0;
  }

  /**
   * Initialize database connection pool
   *
   * @async
   * @returns {Promise<boolean>} True if connection successful
   */
  async connect() {
    try {
      logger.info('Initializing database connection pool', {
        host: this.extractHostFromConnectionString(),
        database: this.extractDatabaseFromConnectionString(),
        poolMin: this.config.min,
        poolMax: this.config.max,
        ssl: !!this.config.ssl
      });

      this.pool = new Pool(this.config);

      // Set up event handlers
      this.setupEventHandlers();

      // Test connection
      await this.testConnection();

      this.isConnected = true;
      this.connectionAttempts = 0;

      // Start health check monitoring
      this.startHealthCheck();

      logger.info('Database connection pool initialized successfully', {
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount,
        waitingClients: this.pool.waitingCount
      });

      return true;

    } catch (error) {
      logger.error('Failed to initialize database connection', {
        error: error.message,
        code: error.code,
        attempt: this.connectionAttempts + 1
      });

      throw error;
    }
  }

  /**
   * Set up pool event handlers for monitoring
   *
   * @private
   */
  setupEventHandlers() {
    // Connection established
    this.pool.on('connect', (client) => {
      logger.debug('New database client connected', {
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount
      });
    });

    // Connection error
    this.pool.on('error', (error, client) => {
      logger.error('Database pool error', {
        error: error.message,
        code: error.code,
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount
      });

      this.errorCount++;
      this.isConnected = false;

      // Attempt reconnection
      this.handleConnectionError(error);
    });

    // Client removed from pool
    this.pool.on('remove', (client) => {
      logger.debug('Database client removed from pool', {
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount
      });
    });

    // Handle process termination
    process.on('SIGINT', () => this.disconnect());
    process.on('SIGTERM', () => this.disconnect());
  }

  /**
   * Test database connection
   *
   * @private
   * @async
   * @returns {Promise<boolean>} True if connection test passes
   */
  async testConnection() {
    const client = await this.pool.connect();

    try {
      const result = await client.query('SELECT NOW() as current_time, version() as db_version');
      const { current_time, db_version } = result.rows[0];

      logger.info('Database connection test successful', {
        serverTime: current_time,
        version: db_version.split(' ')[0] + ' ' + db_version.split(' ')[1]
      });

      return true;

    } finally {
      client.release();
    }
  }

  /**
   * Start health check monitoring
   *
   * @private
   */
  startHealthCheck() {
    const interval = parseInt(process.env.DATABASE_HEALTH_CHECK_INTERVAL) || 30000;

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.testConnection();

        if (!this.isConnected) {
          this.isConnected = true;
          logger.info('Database connection restored');
        }

      } catch (error) {
        if (this.isConnected) {
          this.isConnected = false;
          logger.error('Database health check failed', {
            error: error.message,
            code: error.code
          });
        }
      }
    }, interval);
  }

  /**
   * Handle connection errors with retry logic
   *
   * @private
   * @param {Error} error - Connection error
   */
  async handleConnectionError(error) {
    this.connectionAttempts++;

    if (this.connectionAttempts >= this.maxRetries) {
      logger.error('Max database reconnection attempts reached', {
        attempts: this.connectionAttempts,
        maxRetries: this.maxRetries
      });
      return;
    }

    const delay = this.retryDelay * Math.pow(2, this.connectionAttempts - 1);

    logger.warn('Attempting database reconnection', {
      attempt: this.connectionAttempts,
      delayMs: delay,
      error: error.message
    });

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (reconnectError) {
        logger.error('Database reconnection failed', {
          error: reconnectError.message,
          attempt: this.connectionAttempts
        });
      }
    }, delay);
  }

  /**
   * Execute a query with performance tracking
   *
   * @param {string} text - SQL query text
   * @param {Array} params - Query parameters
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Query result
   */
  async query(text, params = [], options = {}) {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected');
    }

    const queryId = require('crypto').randomUUID();
    const startTime = Date.now();

    try {
      this.queryCount++;

      logger.debug('Executing database query', {
        queryId,
        query: text.replace(/\$\d+/g, '?'), // Replace params for logging
        paramCount: params.length,
        timeout: options.timeout || this.config.query_timeout
      });

      const result = await this.pool.query(text, params);
      const duration = Date.now() - startTime;

      logger.debug('Database query completed', {
        queryId,
        duration,
        rowCount: result.rowCount,
        command: result.command
      });

      // Log slow queries
      if (duration > 1000) {
        logger.warn('Slow database query detected', {
          queryId,
          duration,
          query: text.substring(0, 100) + '...',
          rowCount: result.rowCount
        });
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.errorCount++;

      logger.error('Database query failed', {
        queryId,
        duration,
        error: error.message,
        code: error.code,
        query: text.substring(0, 100) + '...',
        paramCount: params.length
      });

      throw error;
    }
  }

  /**
   * Begin a database transaction
   *
   * @returns {Promise<DatabaseTransaction>} Transaction object
   */
  async beginTransaction() {
    const client = await this.pool.connect();
    const transaction = new DatabaseTransaction(client);
    await transaction.begin();
    return transaction;
  }

  /**
   * Execute multiple queries in a transaction
   *
   * @param {Function} callback - Callback function with transaction client
   * @returns {Promise<*>} Callback result
   */
  async transaction(callback) {
    const transaction = await this.beginTransaction();

    try {
      const result = await callback(transaction);
      await transaction.commit();
      return result;

    } catch (error) {
      await transaction.rollback();
      throw error;

    } finally {
      transaction.release();
    }
  }

  /**
   * Get connection pool statistics
   *
   * @returns {Object} Pool statistics
   */
  getPoolStats() {
    if (!this.pool) {
      return null;
    }

    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingClients: this.pool.waitingCount,
      isConnected: this.isConnected,
      queryCount: this.queryCount,
      errorCount: this.errorCount,
      connectionAttempts: this.connectionAttempts
    };
  }

  /**
   * Get database health status
   *
   * @async
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const startTime = Date.now();
      await this.testConnection();
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        isConnected: this.isConnected,
        responseTime,
        poolStats: this.getPoolStats(),
        lastError: null
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        isConnected: false,
        responseTime: null,
        poolStats: this.getPoolStats(),
        lastError: {
          message: error.message,
          code: error.code,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Gracefully disconnect from database
   *
   * @async
   */
  async disconnect() {
    logger.info('Disconnecting from database');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.pool) {
      try {
        await this.pool.end();
        logger.info('Database connection pool closed');
      } catch (error) {
        logger.error('Error closing database pool', {
          error: error.message
        });
      }
    }

    this.isConnected = false;
  }

  /**
   * Extract host from connection string for logging
   *
   * @private
   * @returns {string} Database host
   */
  extractHostFromConnectionString() {
    try {
      const url = new URL(this.config.connectionString);
      return url.hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Extract database name from connection string for logging
   *
   * @private
   * @returns {string} Database name
   */
  extractDatabaseFromConnectionString() {
    try {
      const url = new URL(this.config.connectionString);
      return url.pathname.substring(1);
    } catch {
      return 'unknown';
    }
  }
}

/**
 * Database Transaction Wrapper
 */
class DatabaseTransaction {
  constructor(client) {
    this.client = client;
    this.isActive = false;
    this.transactionId = require('crypto').randomUUID();
    this.startTime = null;
  }

  /**
   * Begin transaction
   *
   * @async
   */
  async begin() {
    this.startTime = Date.now();
    await this.client.query('BEGIN');
    this.isActive = true;

    logger.debug('Database transaction started', {
      transactionId: this.transactionId
    });
  }

  /**
   * Execute query within transaction
   *
   * @param {string} text - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async query(text, params = []) {
    if (!this.isActive) {
      throw new Error('Transaction not active');
    }

    const queryId = require('crypto').randomUUID();
    const startTime = Date.now();

    try {
      logger.debug('Executing transaction query', {
        transactionId: this.transactionId,
        queryId,
        query: text.replace(/\$\d+/g, '?')
      });

      const result = await this.client.query(text, params);
      const duration = Date.now() - startTime;

      logger.debug('Transaction query completed', {
        transactionId: this.transactionId,
        queryId,
        duration,
        rowCount: result.rowCount
      });

      return result;

    } catch (error) {
      logger.error('Transaction query failed', {
        transactionId: this.transactionId,
        queryId,
        error: error.message,
        query: text.substring(0, 100) + '...'
      });

      throw error;
    }
  }

  /**
   * Commit transaction
   *
   * @async
   */
  async commit() {
    if (!this.isActive) {
      throw new Error('Transaction not active');
    }

    const duration = Date.now() - this.startTime;

    try {
      await this.client.query('COMMIT');
      this.isActive = false;

      logger.debug('Database transaction committed', {
        transactionId: this.transactionId,
        duration
      });

    } catch (error) {
      logger.error('Transaction commit failed', {
        transactionId: this.transactionId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Rollback transaction
   *
   * @async
   */
  async rollback() {
    if (!this.isActive) {
      return; // Already rolled back or committed
    }

    const duration = Date.now() - this.startTime;

    try {
      await this.client.query('ROLLBACK');
      this.isActive = false;

      logger.warn('Database transaction rolled back', {
        transactionId: this.transactionId,
        duration
      });

    } catch (error) {
      logger.error('Transaction rollback failed', {
        transactionId: this.transactionId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Release client back to pool
   */
  release() {
    if (this.isActive) {
      logger.warn('Releasing active transaction - auto-rollback', {
        transactionId: this.transactionId
      });

      // Auto-rollback if transaction still active
      this.client.query('ROLLBACK').catch(() => {
        // Ignore rollback errors during release
      });
    }

    this.client.release();

    logger.debug('Transaction client released', {
      transactionId: this.transactionId
    });
  }
}

// Create singleton instance
const dbConnection = new DatabaseConnection();

module.exports = {
  DatabaseConnection,
  DatabaseTransaction,
  dbConnection,

  // Export for testing and advanced usage
  DB_CONFIG
};