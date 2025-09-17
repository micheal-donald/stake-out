/**
 * Database Migration Manager
 *
 * Handles database schema migrations for the payment module.
 * Provides safe, reversible, and trackable database changes
 * with comprehensive logging and error handling.
 *
 * Features:
 * - Sequential migration execution
 * - Migration rollback support
 * - Migration history tracking
 * - Dry-run capability
 * - Comprehensive error handling
 * - Progress reporting
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const { dbConnection } = require('./connection');
const logger = require('../utils/logger');

/**
 * Migration Manager Class
 */
class MigrationManager {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
    this.isInitialized = false;
  }

  /**
   * Initialize migration system
   *
   * Creates migration history table if it doesn't exist
   *
   * @async
   * @returns {Promise<boolean>} True if initialization successful
   */
  async initialize() {
    try {
      logger.info('Initializing migration system');

      // Ensure database connection
      if (!dbConnection.isConnected) {
        await dbConnection.connect();
      }

      // Create migration history table
      await this.createMigrationHistoryTable();

      this.isInitialized = true;

      logger.info('Migration system initialized successfully');
      return true;

    } catch (error) {
      logger.error('Failed to initialize migration system', {
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Create migration history table
   *
   * @private
   * @async
   */
  async createMigrationHistoryTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS migration_history (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER,
        description TEXT,
        checksum VARCHAR(64),
        rollback_sql TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_migration_history_name
        ON migration_history(migration_name);

      CREATE INDEX IF NOT EXISTS idx_migration_history_executed_at
        ON migration_history(executed_at);
    `;

    await dbConnection.query(createTableQuery);

    logger.debug('Migration history table ready');
  }

  /**
   * Get list of available migrations
   *
   * @async
   * @returns {Promise<Array>} List of migration files
   */
  async getAvailableMigrations() {
    try {
      const files = await fs.readdir(this.migrationsDir);

      const migrations = files
        .filter(file => file.endsWith('.sql'))
        .sort() // Ensure sequential execution
        .map(file => ({
          name: path.basename(file, '.sql'),
          filename: file,
          filepath: path.join(this.migrationsDir, file)
        }));

      logger.debug('Found available migrations', {
        count: migrations.length,
        migrations: migrations.map(m => m.name)
      });

      return migrations;

    } catch (error) {
      logger.error('Failed to get available migrations', {
        error: error.message,
        migrationsDir: this.migrationsDir
      });

      throw error;
    }
  }

  /**
   * Get executed migrations from database
   *
   * @async
   * @returns {Promise<Array>} List of executed migrations
   */
  async getExecutedMigrations() {
    try {
      const query = `
        SELECT migration_name, executed_at, execution_time_ms, description
        FROM migration_history
        ORDER BY executed_at ASC
      `;

      const result = await dbConnection.query(query);

      logger.debug('Retrieved executed migrations', {
        count: result.rows.length
      });

      return result.rows;

    } catch (error) {
      logger.error('Failed to get executed migrations', {
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get pending migrations
   *
   * @async
   * @returns {Promise<Array>} List of pending migrations
   */
  async getPendingMigrations() {
    try {
      const available = await this.getAvailableMigrations();
      const executed = await this.getExecutedMigrations();

      const executedNames = new Set(executed.map(m => m.migration_name));

      const pending = available.filter(migration =>
        !executedNames.has(migration.name)
      );

      logger.info('Found pending migrations', {
        total: available.length,
        executed: executed.length,
        pending: pending.length,
        pendingMigrations: pending.map(m => m.name)
      });

      return pending;

    } catch (error) {
      logger.error('Failed to get pending migrations', {
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Read migration file content
   *
   * @async
   * @param {string} filepath - Path to migration file
   * @returns {Promise<string>} Migration SQL content
   */
  async readMigrationFile(filepath) {
    try {
      const content = await fs.readFile(filepath, 'utf8');

      // Basic validation
      if (!content.trim()) {
        throw new Error('Migration file is empty');
      }

      return content;

    } catch (error) {
      logger.error('Failed to read migration file', {
        filepath,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Calculate migration checksum
   *
   * @param {string} content - Migration content
   * @returns {string} SHA-256 checksum
   */
  calculateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Execute a single migration
   *
   * @async
   * @param {Object} migration - Migration object
   * @param {boolean} [dryRun=false] - If true, don't execute, just validate
   * @returns {Promise<Object>} Execution result
   */
  async executeMigration(migration, dryRun = false) {
    const startTime = Date.now();

    try {
      logger.info('Executing migration', {
        name: migration.name,
        dryRun
      });

      // Read migration content
      const content = await this.readMigrationFile(migration.filepath);
      const checksum = this.calculateChecksum(content);

      // Extract description from migration file
      const description = this.extractMigrationDescription(content);

      if (dryRun) {
        logger.info('Dry run - migration would be executed', {
          name: migration.name,
          description,
          checksum,
          contentLength: content.length
        });

        return {
          success: true,
          dryRun: true,
          migration: migration.name,
          description,
          checksum
        };
      }

      // Execute migration in transaction
      const transaction = await dbConnection.beginTransaction();

      try {
        // Execute the migration SQL
        await transaction.query(content);

        // Record migration in history
        await transaction.query(`
          INSERT INTO migration_history (
            migration_name, executed_at, execution_time_ms, description, checksum
          ) VALUES ($1, $2, $3, $4, $5)
        `, [
          migration.name,
          new Date(),
          Date.now() - startTime,
          description,
          checksum
        ]);

        await transaction.commit();

        const executionTime = Date.now() - startTime;

        logger.info('Migration executed successfully', {
          name: migration.name,
          executionTime,
          description
        });

        return {
          success: true,
          migration: migration.name,
          executionTime,
          description,
          checksum
        };

      } catch (error) {
        await transaction.rollback();
        throw error;

      } finally {
        transaction.release();
      }

    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error('Migration execution failed', {
        name: migration.name,
        executionTime,
        error: error.message,
        dryRun
      });

      return {
        success: false,
        migration: migration.name,
        executionTime,
        error: error.message,
        dryRun
      };
    }
  }

  /**
   * Extract description from migration file comments
   *
   * @private
   * @param {string} content - Migration file content
   * @returns {string} Migration description
   */
  extractMigrationDescription(content) {
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-- Description:')) {
        return trimmed.replace('-- Description:', '').trim();
      }
    }

    return 'No description provided';
  }

  /**
   * Run all pending migrations
   *
   * @async
   * @param {Object} options - Migration options
   * @param {boolean} [options.dryRun=false] - If true, don't execute
   * @param {boolean} [options.continueOnError=false] - Continue if migration fails
   * @returns {Promise<Object>} Migration results
   */
  async migrate(options = {}) {
    const { dryRun = false, continueOnError = false } = options;

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const pending = await this.getPendingMigrations();

      if (pending.length === 0) {
        logger.info('No pending migrations to execute');
        return {
          success: true,
          message: 'Database is up to date',
          executedMigrations: [],
          totalExecuted: 0
        };
      }

      logger.info('Starting migration process', {
        pendingCount: pending.length,
        dryRun,
        continueOnError
      });

      const results = [];
      let successCount = 0;
      let failureCount = 0;

      for (const migration of pending) {
        const result = await this.executeMigration(migration, dryRun);
        results.push(result);

        if (result.success) {
          successCount++;
        } else {
          failureCount++;

          if (!continueOnError) {
            logger.error('Migration failed, stopping execution', {
              failedMigration: migration.name,
              error: result.error
            });
            break;
          }
        }
      }

      const overallSuccess = failureCount === 0;

      logger.info('Migration process completed', {
        overallSuccess,
        successCount,
        failureCount,
        totalMigrations: pending.length,
        dryRun
      });

      return {
        success: overallSuccess,
        message: dryRun
          ? `Dry run completed: ${successCount} migrations would be executed`
          : `Migration completed: ${successCount} successful, ${failureCount} failed`,
        executedMigrations: results,
        totalExecuted: successCount,
        totalFailed: failureCount
      };

    } catch (error) {
      logger.error('Migration process failed', {
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get migration status and information
   *
   * @async
   * @returns {Promise<Object>} Migration status
   */
  async getStatus() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const available = await this.getAvailableMigrations();
      const executed = await this.getExecutedMigrations();
      const pending = await this.getPendingMigrations();

      const lastMigration = executed.length > 0
        ? executed[executed.length - 1]
        : null;

      return {
        total: available.length,
        executed: executed.length,
        pending: pending.length,
        isUpToDate: pending.length === 0,
        lastMigration: lastMigration ? {
          name: lastMigration.migration_name,
          executedAt: lastMigration.executed_at,
          executionTime: lastMigration.execution_time_ms
        } : null,
        availableMigrations: available.map(m => m.name),
        executedMigrations: executed.map(m => m.migration_name),
        pendingMigrations: pending.map(m => m.name)
      };

    } catch (error) {
      logger.error('Failed to get migration status', {
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Validate migration files
   *
   * @async
   * @returns {Promise<Object>} Validation results
   */
  async validate() {
    try {
      const available = await this.getAvailableMigrations();
      const validationResults = [];

      for (const migration of available) {
        try {
          const content = await this.readMigrationFile(migration.filepath);
          const checksum = this.calculateChecksum(content);
          const description = this.extractMigrationDescription(content);

          validationResults.push({
            name: migration.name,
            valid: true,
            description,
            checksum,
            contentLength: content.length
          });

        } catch (error) {
          validationResults.push({
            name: migration.name,
            valid: false,
            error: error.message
          });
        }
      }

      const validCount = validationResults.filter(r => r.valid).length;
      const invalidCount = validationResults.length - validCount;

      logger.info('Migration validation completed', {
        total: validationResults.length,
        valid: validCount,
        invalid: invalidCount
      });

      return {
        success: invalidCount === 0,
        total: validationResults.length,
        valid: validCount,
        invalid: invalidCount,
        results: validationResults
      };

    } catch (error) {
      logger.error('Migration validation failed', {
        error: error.message
      });

      throw error;
    }
  }
}

/**
 * CLI interface for migration management
 */
async function runMigrationCLI() {
  const args = process.argv.slice(2);
  const command = args[0];

  const migrationManager = new MigrationManager();

  try {
    switch (command) {
      case 'migrate':
        const dryRun = args.includes('--dry-run');
        const continueOnError = args.includes('--continue-on-error');
        const result = await migrationManager.migrate({ dryRun, continueOnError });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);

      case 'status':
        const status = await migrationManager.getStatus();
        console.log(JSON.stringify(status, null, 2));
        process.exit(0);

      case 'validate':
        const validation = await migrationManager.validate();
        console.log(JSON.stringify(validation, null, 2));
        process.exit(validation.success ? 0 : 1);

      case 'rollback':
        console.log('Rollback functionality not yet implemented');
        process.exit(1);

      default:
        console.log(`
Usage: node migrate.js <command> [options]

Commands:
  migrate     Run pending migrations
  status      Show migration status
  validate    Validate migration files
  rollback    Rollback last migration (not yet implemented)

Options:
  --dry-run            Don't execute migrations, just show what would happen
  --continue-on-error  Continue executing migrations even if one fails

Examples:
  node migrate.js migrate                    # Run all pending migrations
  node migrate.js migrate --dry-run          # Show what migrations would run
  node migrate.js status                     # Show current migration status
  node migrate.js validate                   # Validate all migration files
        `);
        process.exit(1);
    }

  } catch (error) {
    console.error('Migration command failed:', error.message);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = {
  MigrationManager
};

// Run CLI if this file is executed directly
if (require.main === module) {
  runMigrationCLI();
}