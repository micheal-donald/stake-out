/**
 * Enhanced Database Migration Runner
 *
 * Comprehensive migration system for the StakeOut Bet application.
 * Supports multiple migrations, rollbacks, and status tracking.
 *
 * Usage:
 *   node migration-runner.js migrate    # Run all pending migrations
 *   node migration-runner.js rollback   # Rollback last migration
 *   node migration-runner.js status     # Show migration status
 *   node migration-runner.js create <name> # Create new migration
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');

// Use backend's node_modules for dependencies
const backendPath = path.resolve(__dirname, '../backend');
const { Pool } = require(path.join(backendPath, 'node_modules', 'pg'));
require(path.join(backendPath, 'node_modules', 'dotenv')).config({
  path: path.resolve(backendPath, '.env')
});

/**
 * Enhanced Migration Runner
 */
class MigrationRunner {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });

    this.migrationsDir = path.join(__dirname, 'migrations');
    this.migrationTableCreated = false;
  }

  /**
   * Ensure migrations tracking table exists
   *
   * @private
   */
  async ensureMigrationsTable() {
    if (this.migrationTableCreated) return;

    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          rollback_script TEXT,
          checksum VARCHAR(64)
        );

        CREATE INDEX IF NOT EXISTS idx_migrations_filename ON migrations(filename);
        CREATE INDEX IF NOT EXISTS idx_migrations_applied_at ON migrations(applied_at);
      `);

      this.migrationTableCreated = true;
      console.log('✓ Migrations table ready');
    } finally {
      client.release();
    }
  }

  /**
   * Get list of migration files
   *
   * @returns {Promise<Array>} List of migration files
   * @private
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsDir);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort((a, b) => {
          // Prioritize base migrations (without numeric prefix) over numbered migrations
          const aIsNumbered = /^\d+_/.test(a);
          const bIsNumbered = /^\d+_/.test(b);

          if (!aIsNumbered && bIsNumbered) return -1; // a comes first
          if (aIsNumbered && !bIsNumbered) return 1;  // b comes first

          // Both are same type, sort alphabetically
          return a.localeCompare(b);
        });
    } catch (error) {
      console.error('Error reading migrations directory:', error);
      return [];
    }
  }

  /**
   * Get applied migrations from database
   *
   * @returns {Promise<Array>} List of applied migration filenames
   * @private
   */
  async getAppliedMigrations() {
    await this.ensureMigrationsTable();

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT filename FROM migrations ORDER BY applied_at'
      );
      return result.rows.map(row => row.filename);
    } finally {
      client.release();
    }
  }

  /**
   * Calculate file checksum for integrity checking
   *
   * @param {string} content - File content
   * @returns {string} SHA-256 checksum
   * @private
   */
  calculateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Parse migration file for rollback script
   *
   * @param {string} content - Migration file content
   * @returns {Object} Parsed migration with rollback
   * @private
   */
  parseMigration(content) {
    const rollbackMarker = '-- ROLLBACK:';
    const parts = content.split(rollbackMarker);

    return {
      upScript: parts[0].trim(),
      downScript: parts[1] ? parts[1].trim() : null
    };
  }

  /**
   * Run a single migration
   *
   * @param {string} filename - Migration filename
   * @param {string} content - Migration content
   * @private
   */
  async runMigration(filename, content) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { upScript, downScript } = this.parseMigration(content);
      const checksum = this.calculateChecksum(content);

      console.log(`  🔄 Applying ${filename}...`);

      // Execute the migration
      await client.query(upScript);

      // Record the migration
      await client.query(
        `INSERT INTO migrations (filename, rollback_script, checksum)
         VALUES ($1, $2, $3)
         ON CONFLICT (filename) DO UPDATE SET
           applied_at = CURRENT_TIMESTAMP,
           rollback_script = $2,
           checksum = $3`,
        [filename, downScript, checksum]
      );

      await client.query('COMMIT');
      console.log(`  ✅ Applied ${filename}`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Failed to apply ${filename}: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Run all pending migrations
   */
  async migrate() {
    console.log('🚀 Starting database migrations...\n');

    try {
      const migrationFiles = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();

      const pendingMigrations = migrationFiles.filter(
        file => !appliedMigrations.includes(file)
      );

      if (pendingMigrations.length === 0) {
        console.log('✅ No pending migrations found.\n');
        return;
      }

      console.log(`📋 Found ${pendingMigrations.length} pending migration(s):\n`);

      for (const filename of pendingMigrations) {
        const migrationPath = path.join(this.migrationsDir, filename);
        const content = await fs.readFile(migrationPath, 'utf8');

        await this.runMigration(filename, content);
      }

      console.log(`\n🎉 Successfully applied ${pendingMigrations.length} migration(s)!\n`);

    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Rollback the last migration
   */
  async rollback() {
    console.log('🔄 Rolling back last migration...\n');

    const client = await this.pool.connect();
    try {
      await this.ensureMigrationsTable();

      // Get the last applied migration
      const result = await client.query(
        `SELECT filename, rollback_script
         FROM migrations
         ORDER BY applied_at DESC
         LIMIT 1`
      );

      if (result.rows.length === 0) {
        console.log('✅ No migrations to rollback.\n');
        return;
      }

      const migration = result.rows[0];

      if (!migration.rollback_script) {
        throw new Error(`No rollback script found for ${migration.filename}`);
      }

      await client.query('BEGIN');

      console.log(`  🔄 Rolling back ${migration.filename}...`);

      // Execute rollback script
      await client.query(migration.rollback_script);

      // Remove migration record
      await client.query(
        'DELETE FROM migrations WHERE filename = $1',
        [migration.filename]
      );

      await client.query('COMMIT');
      console.log(`  ✅ Rolled back ${migration.filename}\n`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Rollback failed:', error.message);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  /**
   * Show migration status
   */
  async status() {
    console.log('📊 Migration Status:\n');

    try {
      const migrationFiles = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();

      if (migrationFiles.length === 0) {
        console.log('  📝 No migration files found.\n');
        return;
      }

      console.log('Migration files:');
      for (const filename of migrationFiles) {
        const isApplied = appliedMigrations.includes(filename);
        const status = isApplied ? '✅ Applied' : '⏳ Pending';
        console.log(`  ${status}  ${filename}`);
      }

      const pendingCount = migrationFiles.length - appliedMigrations.length;
      console.log(`\nSummary:`);
      console.log(`  📄 Total migrations: ${migrationFiles.length}`);
      console.log(`  ✅ Applied: ${appliedMigrations.length}`);
      console.log(`  ⏳ Pending: ${pendingCount}\n`);

    } catch (error) {
      console.error('❌ Failed to get status:', error.message);
      process.exit(1);
    }
  }

  /**
   * Create a new migration file
   *
   * @param {string} name - Migration name
   */
  async create(name) {
    if (!name) {
      console.error('❌ Migration name is required');
      console.log('Usage: node migration-runner.js create <migration_name>');
      process.exit(1);
    }

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `${timestamp}_${name.replace(/\s+/g, '_').toLowerCase()}.sql`;
    const migrationPath = path.join(this.migrationsDir, filename);

    const template = `-- Migration: ${name}
-- Description: TODO - Add description here
-- Author: StakeOut Development Team
-- Date: ${new Date().toISOString().split('T')[0]}

-- Add your migration SQL here
-- Example:
-- CREATE TABLE example_table (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- ROLLBACK:
-- Add rollback SQL here (optional but recommended)
-- Example:
-- DROP TABLE IF EXISTS example_table;
`;

    try {
      await fs.writeFile(migrationPath, template);
      console.log(`✅ Created migration file: ${filename}`);
      console.log(`📁 Location: ${migrationPath}`);
      console.log('\n📝 Edit the file to add your migration SQL and rollback commands.\n');
    } catch (error) {
      console.error('❌ Failed to create migration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Validate all migrations for syntax errors
   */
  async validate() {
    console.log('🔍 Validating migrations...\n');

    try {
      const migrationFiles = await this.getMigrationFiles();
      let hasErrors = false;

      for (const filename of migrationFiles) {
        const migrationPath = path.join(this.migrationsDir, filename);
        const content = await fs.readFile(migrationPath, 'utf8');

        try {
          const { upScript, downScript } = this.parseMigration(content);

          // Basic validation
          if (upScript.trim().length === 0) {
            console.log(`  ❌ ${filename}: Empty migration script`);
            hasErrors = true;
          } else {
            console.log(`  ✅ ${filename}: Valid`);
          }

          if (downScript && downScript.trim().length === 0) {
            console.log(`  ⚠️  ${filename}: Empty rollback script`);
          }

        } catch (error) {
          console.log(`  ❌ ${filename}: Parse error - ${error.message}`);
          hasErrors = true;
        }
      }

      if (hasErrors) {
        console.log('\n❌ Validation failed. Please fix the errors above.\n');
        process.exit(1);
      } else {
        console.log('\n✅ All migrations are valid!\n');
      }

    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

/**
 * Main execution function
 */
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  const runner = new MigrationRunner();

  try {
    switch (command) {
      case 'migrate':
        await runner.migrate();
        break;

      case 'rollback':
        await runner.rollback();
        break;

      case 'status':
        await runner.status();
        break;

      case 'create':
        await runner.create(arg);
        break;

      case 'validate':
        await runner.validate();
        break;

      default:
        console.log('🔧 Database Migration Runner\n');
        console.log('Usage:');
        console.log('  node migration-runner.js migrate           # Run all pending migrations');
        console.log('  node migration-runner.js rollback          # Rollback last migration');
        console.log('  node migration-runner.js status            # Show migration status');
        console.log('  node migration-runner.js create <name>     # Create new migration');
        console.log('  node migration-runner.js validate          # Validate migration files');
        console.log('');
        process.exit(1);
    }
  } finally {
    await runner.close();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = MigrationRunner;