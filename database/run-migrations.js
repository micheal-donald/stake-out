/**
 * Script to run database migrations
 * 
 * Usage: node run-migration.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Initialize PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  console.log('Starting database migration...');
  
  try {
    // Read migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', 'add_transactions_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    const client = await pool.connect();
    try {
      console.log('Executing migration script...');
      await client.query(migrationSQL);
      console.log('Migration completed successfully');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // Close pool
    await pool.end();
  }
}

// Run the migration
runMigration();