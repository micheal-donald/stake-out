/**
 * Payment Module Express Server
 *
 * Standalone Express server providing payment processing capabilities
 * through a comprehensive RESTful API. This server can operate
 * independently or be integrated into existing applications.
 *
 * Key Features:
 * - RESTful API with OpenAPI documentation
 * - Comprehensive middleware stack
 * - Payment provider abstraction
 * - Real-time webhook handling
 * - Health monitoring and metrics
 * - Graceful shutdown handling
 * - Production-ready logging
 * - Security hardening
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { dbConnection } = require('./database/connection');
const { providerFactory } = require('./providers/ProviderFactory');
const logger = require('./utils/logger');
const PaymentError = require('./errors/PaymentError');

// Route imports
const paymentRoutes = require('./api/routes/payments');
const healthRoutes = require('./api/routes/health');
const webhookRoutes = require('./api/routes/webhooks');

class PaymentServer {
  constructor(config = {}) {
    this.app = express();
    this.server = null;
    this.isShuttingDown = false;
    this.config = {
      port: config.port || process.env.PORT || 3737,
      host: config.host || process.env.HOST || '0.0.0.0',
      env: config.env || process.env.NODE_ENV || 'development',
      corsOrigins: config.corsOrigins || process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      trustProxy: config.trustProxy || process.env.TRUST_PROXY === 'true',
      rateLimiting: config.rateLimiting !== false,
      compression: config.compression !== false,
      swagger: config.swagger !== false,
      ...config
    };

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Configure Express middleware stack
   *
   * @private
   */
  setupMiddleware() {
    // Trust proxy for production deployments
    if (this.config.trustProxy) {
      this.app.set('trust proxy', 1);
    }

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: this.config.env === 'production',
      crossOriginEmbedderPolicy: false // Allow Swagger UI to work
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression middleware
    if (this.config.compression) {
      this.app.use(compression());
    }

    // Request logging
    const logFormat = this.config.env === 'production'
      ? 'combined'
      : 'dev';

    this.app.use(morgan(logFormat, {
      stream: {
        write: (message) => logger.info(message.trim(), { component: 'http' })
      }
    }));

    // Rate limiting
    if (this.config.rateLimiting) {
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          logger.warn('Rate limit exceeded', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path
          });

          res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.round(req.rateLimit.resetTime / 1000)
          });
        }
      });

      this.app.use('/api/', limiter);
    }

    // Body parsing middleware
    this.app.use(express.json({
      limit: '10mb',
      verify: (req, res, buf, encoding) => {
        // Store raw body for webhook signature validation
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request ID middleware for tracing
    this.app.use((req, res, next) => {
      req.requestId = require('crypto').randomUUID();
      res.set('X-Request-ID', req.requestId);
      next();
    });

    // Request context middleware
    this.app.use((req, res, next) => {
      req.context = {
        requestId: req.requestId,
        timestamp: new Date(),
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        method: req.method,
        path: req.path
      };

      logger.debug('Request received', {
        ...req.context,
        headers: this.sanitizeHeaders(req.headers)
      });

      next();
    });
  }

  /**
   * Configure API routes
   *
   * @private
   */
  setupRoutes() {
    // Health check endpoint (before rate limiting)
    this.app.use('/health', healthRoutes);

    // API documentation
    if (this.config.swagger) {
      this.setupSwagger();
    }

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'StakeOut Payment Module',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        documentation: this.config.swagger ? '/api-docs' : 'disabled',
        health: '/health'
      });
    });

    // API routes
    this.app.use('/api/payments', paymentRoutes);
    this.app.use('/api/webhooks', webhookRoutes);

    // Catch-all route for undefined endpoints
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });
    });
  }

  /**
   * Setup Swagger API documentation
   *
   * @private
   */
  setupSwagger() {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'StakeOut Payment Module API',
          version: '1.0.0',
          description: `
            Comprehensive payment processing API supporting multiple payment providers.

            ## Authentication
            Most endpoints require JWT authentication. Include the token in the Authorization header:
            \`Authorization: Bearer <your-jwt-token>\`

            ## Rate Limiting
            API requests are rate limited to prevent abuse. Current limits:
            - 100 requests per 15 minutes per IP address
            - Additional limits may apply to specific endpoints

            ## Error Handling
            All errors follow a consistent format with error codes and detailed messages.

            ## Webhooks
            Payment providers send webhooks to update transaction statuses.
            Webhook endpoints are secured and don't require authentication.
          `,
          contact: {
            name: 'StakeOut Development Team',
            email: 'dev@stakeout.bet'
          }
        },
        servers: [
          {
            url: `http://localhost:${this.config.port}`,
            description: 'Development server'
          },
          {
            url: 'https://api.stakeout.bet/payments',
            description: 'Production server'
          }
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          }
        },
        security: [
          {
            bearerAuth: []
          }
        ]
      },
      apis: [
        './src/api/routes/*.js',
        './src/api/middleware/*.js',
        './src/errors/PaymentError.js'
      ]
    };

    const specs = swaggerJsdoc(swaggerOptions);

    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Payment Module API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
        tryItOutEnabled: true
      }
    }));

    logger.info('Swagger API documentation available at /api-docs');
  }

  /**
   * Setup error handling middleware
   *
   * @private
   */
  setupErrorHandling() {
    // Payment error handler
    this.app.use((error, req, res, next) => {
      if (error instanceof PaymentError) {
        const statusCode = this.getHttpStatusFromPaymentError(error);

        logger.error('Payment error occurred', {
          requestId: req.requestId,
          error: error.message,
          code: error.code,
          type: error.type,
          details: error.details,
          stack: this.config.env === 'development' ? error.stack : undefined
        });

        return res.status(statusCode).json({
          error: error.type,
          message: error.message,
          code: error.code,
          details: error.details,
          requestId: req.requestId,
          timestamp: new Date().toISOString()
        });
      }

      next(error);
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      const statusCode = error.statusCode || error.status || 500;
      const isDevelopment = this.config.env === 'development';

      logger.error('Unhandled error', {
        requestId: req.requestId,
        error: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(statusCode).json({
        error: statusCode >= 500 ? 'Internal Server Error' : 'Bad Request',
        message: isDevelopment ? error.message : 'An unexpected error occurred',
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        ...(isDevelopment && { stack: error.stack })
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise.toString()
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.fatal('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });

      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle termination signals
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, starting graceful shutdown');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      logger.info('Received SIGINT, starting graceful shutdown');
      this.gracefulShutdown('SIGINT');
    });
  }

  /**
   * Map PaymentError to HTTP status codes
   *
   * @private
   * @param {PaymentError} error - Payment error instance
   * @returns {number} HTTP status code
   */
  getHttpStatusFromPaymentError(error) {
    const statusMap = {
      'VALIDATION_ERROR': 400,
      'AUTHENTICATION_ERROR': 401,
      'AUTHORIZATION_ERROR': 403,
      'NOT_FOUND': 404,
      'DUPLICATE_TRANSACTION': 409,
      'INSUFFICIENT_FUNDS': 402,
      'PAYMENT_FAILED': 402,
      'PROVIDER_ERROR': 502,
      'NETWORK_ERROR': 502,
      'TIMEOUT_ERROR': 504,
      'RATE_LIMIT_ERROR': 429,
      'INTERNAL_ERROR': 500
    };

    return statusMap[error.type] || 500;
  }

  /**
   * Sanitize request headers for logging
   *
   * @private
   * @param {Object} headers - Request headers
   * @returns {Object} Sanitized headers
   */
  sanitizeHeaders(headers) {
    const sanitized = { ...headers };

    // Remove sensitive headers
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token'
    ];

    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Initialize the payment server
   *
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      logger.info('Initializing payment server', {
        env: this.config.env,
        port: this.config.port,
        host: this.config.host
      });

      // Initialize database connection
      logger.info('Connecting to database');
      await dbConnection.connect();

      // Test database connection
      await dbConnection.query('SELECT 1');
      logger.info('Database connection established');

      // Initialize payment provider factory
      logger.info('Initializing payment providers');
      const providerConfig = this.loadProviderConfig();
      await providerFactory.initialize(providerConfig);

      logger.info('Payment providers initialized', {
        enabledProviders: providerFactory.getEnabledProviders()
      });

      logger.info('Payment server initialization completed');

    } catch (error) {
      logger.fatal('Failed to initialize payment server', {
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Load payment provider configuration
   *
   * @private
   * @returns {Object} Provider configuration
   */
  loadProviderConfig() {
    return {
      providers: {
        mpesa: {
          enabled: process.env.MPESA_ENABLED !== 'false',
          consumerKey: process.env.MPESA_CONSUMER_KEY,
          consumerSecret: process.env.MPESA_CONSUMER_SECRET,
          shortcode: process.env.MPESA_SHORTCODE,
          passkey: process.env.MPESA_PASSKEY,
          callbackUrl: process.env.MPESA_CALLBACK_URL,
          environment: process.env.MPESA_ENVIRONMENT || 'sandbox'
        }
        // Additional providers can be configured here
      },
      global: {
        timeout: parseInt(process.env.PAYMENT_TIMEOUT) || 30000,
        retryAttempts: parseInt(process.env.PAYMENT_RETRY_ATTEMPTS) || 3,
        webhookSecret: process.env.WEBHOOK_SECRET
      }
    };
  }

  /**
   * Start the Express server
   *
   * @async
   * @returns {Promise<void>}
   */
  async start() {
    try {
      await this.initialize();

      this.server = this.app.listen(this.config.port, this.config.host, () => {
        logger.info('Payment server started successfully', {
          port: this.config.port,
          host: this.config.host,
          env: this.config.env,
          processId: process.pid,
          nodeVersion: process.version,
          memoryUsage: process.memoryUsage(),
          swagger: this.config.swagger ? `http://${this.config.host}:${this.config.port}/api-docs` : 'disabled'
        });
      });

      // Handle server errors
      this.server.on('error', (error) => {
        logger.error('Server error', {
          error: error.message,
          code: error.code,
          stack: error.stack
        });

        if (error.code === 'EADDRINUSE') {
          logger.fatal(`Port ${this.config.port} is already in use`);
          process.exit(1);
        }
      });

      // Handle server connections
      this.server.on('connection', (socket) => {
        socket.on('error', (error) => {
          logger.warn('Socket error', {
            error: error.message,
            remote: socket.remoteAddress
          });
        });
      });

    } catch (error) {
      logger.fatal('Failed to start payment server', {
        error: error.message,
        stack: error.stack
      });

      process.exit(1);
    }
  }

  /**
   * Graceful server shutdown
   *
   * @async
   * @param {string} signal - Shutdown signal
   */
  async gracefulShutdown(signal) {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress, forcing exit');
      process.exit(1);
    }

    this.isShuttingDown = true;

    logger.info('Starting graceful shutdown', { signal });

    // Set shutdown timeout
    const shutdownTimeout = setTimeout(() => {
      logger.warn('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 30000); // 30 second timeout

    try {
      // Stop accepting new connections
      if (this.server) {
        logger.info('Closing HTTP server');
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info('HTTP server closed');
      }

      // Shutdown payment providers
      if (providerFactory.isInitialized) {
        logger.info('Shutting down payment providers');
        await providerFactory.shutdown();
        logger.info('Payment providers shutdown complete');
      }

      // Close database connections
      if (dbConnection.isConnected) {
        logger.info('Closing database connections');
        await dbConnection.close();
        logger.info('Database connections closed');
      }

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed');
      process.exit(0);

    } catch (error) {
      logger.error('Error during graceful shutdown', {
        error: error.message,
        stack: error.stack
      });

      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  }

  /**
   * Get server instance for testing
   *
   * @returns {Express} Express app instance
   */
  getApp() {
    return this.app;
  }

  /**
   * Get server metrics
   *
   * @returns {Object} Server metrics
   */
  getMetrics() {
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      version: process.version,
      platform: process.platform,
      pid: process.pid,
      env: this.config.env,
      connections: this.server ? this.server.connections : 0,
      timestamp: new Date().toISOString()
    };
  }
}

// Create and export server instance
const server = new PaymentServer();

// Start server if this file is run directly
if (require.main === module) {
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = {
  PaymentServer,
  server
};