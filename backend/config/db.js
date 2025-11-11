const { Pool } = require('pg');
const logger = require('./logger');
require('dotenv').config();

// Validate required environment variables
if (!process.env.DATABASE_URL) {
  logger.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Add connection timeout
  connectionTimeoutMillis: 5000,
  // Add idle timeout
  idleTimeoutMillis: 10000,
  // Add max connections
  max: 10,
});

// Test the database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    logger.error('Database connection failed:', err.message);
    // Don't exit here as it might be a timing issue during startup
  } else {
    logger.info('Database connection successful');
  }
});

// Handle connection errors
pool.on('error', (err) => {
  logger.error('Unexpected database error:', err.message);
  logger.error('Database error stack:', err.stack);
});

module.exports = pool;