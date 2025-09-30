const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Validate environment variables at startup
// This addresses the "Environment Variable Security - P0" task in the MVP TODO list
try {
  require('./scripts/validate-env');
} catch (error) {
  console.error('Environment validation failed:', error.message);
  process.exit(1);
}

// Import logger
const logger = require('./config/logger');

// Import and initialize Sentry (must be first)
const sentry = require('./config/sentry');

// Import security configurations
const {
  helmetConfig,
  apiLimiter,
  authLimiter,
  gameLimiter,
  paymentLimiter,
  adminLimiter,
  socketLimiter,
  enforceHTTPS
} = require('./config/security');

// Import CSRF protection
const { generateCsrfToken, validateCsrfToken, getCsrfToken } = require('./middlewares/csrf');

// Import routes
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const settingsRoutes = require('./routes/settings');
const betsRoutes = require('./routes/bets');
const gameRoutes = require('./routes/game');
const walletRoutes = require('./routes/wallet');

// Import socket handlers
const setupSocketHandlers = require('./sockets');

// Import the game server
const GameServer = require('./game');

//Imports for Mpesa
const mpesaRoutes = require('./routes/mpesa');
const webhooksRoutes = require('./routes/webhooks');

// Import AdminJS components
// TODO: Fix AdminJS imports (ESM compatibility issue)
// const { createAdminJS, createAdminRouter } = require('./admin/adminConfig');

// Initialize Express app
const app = express();

// Initialize Sentry (must be before any other middleware)
sentry.initSentry(app);

// Sentry request handler (must be first middleware)
app.use(sentry.requestHandler());
app.use(sentry.tracingHandler());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Security Middleware (after Sentry, before routes)
app.use(helmetConfig);
app.use(enforceHTTPS);

// Basic Middleware
app.use(express.json({ limit: '10mb' })); // Add limit to prevent payload attacks
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// CSRF Protection (after cookie parser, before routes)
app.use(generateCsrfToken);
app.use(validateCsrfToken);

// Health check route for production monitoring
const healthCheck = require('./server.health');
app.get('/health', healthCheck);

// Root route
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'StakeOut Bet API is running',
    version: '1.0.0'
  });
});

// CSRF token endpoint for SPA
app.get('/api/csrf-token', getCsrfToken);

// Apply general API rate limiting to all API routes
app.use('/api', apiLimiter);

// Socket token endpoint gets its own rate limiter (before authLimiter)
app.use('/api/socket-token', socketLimiter);

// Routes with specific rate limiters
app.use('/api', authLimiter, authRoutes); // Auth routes get strict limiting
app.use('/api/profile', profileRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/bet', gameLimiter, betsRoutes); // Game actions get specific limiting
app.use('/api/game', gameLimiter, gameRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/mpesa', paymentLimiter, mpesaRoutes); // Payment endpoints get strict limiting
app.use('/api/webhooks', webhooksRoutes); // No rate limit on webhooks (external callbacks)

// Initialize AdminJS with admin rate limiting
// TODO: Fix AdminJS initialization (ESM compatibility issue)
// const adminJs = createAdminJS();
// const adminRouter = createAdminRouter(adminJs);
// app.use(adminJs.options.rootPath, adminLimiter, adminRouter);

// Initialize the game server
const gameServer = new GameServer(io);

// Setup WebSocket handlers
setupSocketHandlers(io, gameServer);

// Sentry error handler (before custom error handler)
app.use(sentry.errorHandler());

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
  logger.logError(err, req);

  // Capture error in Sentry
  sentry.captureException(err, {
    user: req.user,
    method: req.method,
    url: req.originalUrl
  });

  // Don't expose stack trace in production
  const errorResponse = {
    error: process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred'
      : err.message,
    code: err.code || 'INTERNAL_SERVER_ERROR'
  };

  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
  }

  res.status(err.status || 500).json(errorResponse);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
    path: req.path
  });
});

// Start server
const PORT = process.env.PORT || 4000;
const serverInstance = server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info('Battle Arena API started successfully');
  // logger.info(`AdminJS available at http://localhost:${PORT}${adminJs.options.rootPath}`);
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.warn(`${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  serverInstance.close(() => {
    logger.info('HTTP server closed');
  });

  // Close Socket.IO connections
  io.close(() => {
    logger.info('Socket.IO connections closed');
  });

  // Close Sentry client
  await sentry.close().catch(err => logger.error('Error closing Sentry:', err));

  // Give active requests 10 seconds to complete
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', { error: err.message, stack: err.stack });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', { reason, promise: promise.toString() });
  gracefulShutdown('UNHANDLED_REJECTION');
});