// Health check endpoint for backend service
// Used by Docker health checks and load balancers

const pool = require('./config/db');

async function healthCheck(req, res) {
  try {
    // Check database connection
    const dbCheck = await pool.query('SELECT 1 as healthy');
    
    // Check if game server is running (basic check)
    const status = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      database: dbCheck.rows.length > 0 ? 'connected' : 'disconnected',
      memory: process.memoryUsage(),
      pid: process.pid
    };
    
    res.status(200).json(status);
  } catch (error) {
    console.error('Health check failed:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      uptime: process.uptime(),
      pid: process.pid
    });
  }
}

module.exports = healthCheck;