/**
 * Payment Module Logger
 *
 * Centralized logging configuration for the payment module using Winston.
 * Provides structured logging with different levels and formats for
 * development and production environments.
 *
 * Features:
 * - Structured JSON logging for production
 * - Human-readable console logging for development
 * - Automatic log rotation and archival
 * - Sensitive data masking for security
 * - Performance tracking capabilities
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom format for masking sensitive information
 */
const maskSensitiveData = winston.format((info) => {
  const sensitiveFields = [
    'password',
    'token',
    'key',
    'secret',
    'authorization',
    'phoneNumber',
    'phone',
    'email',
    'passkey',
    'consumerSecret',
    'accessToken'
  ];

  const maskValue = (obj, path = '') => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item, index) => maskValue(item, `${path}[${index}]`));
    }

    const masked = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const currentPath = path ? `${path}.${key}` : key;

      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        // Mask sensitive data
        if (typeof value === 'string') {
          if (value.length <= 4) {
            masked[key] = '***';
          } else if (lowerKey.includes('phone')) {
            // Show last 4 digits of phone numbers
            masked[key] = '*'.repeat(value.length - 4) + value.slice(-4);
          } else if (lowerKey.includes('email')) {
            // Show domain part of email
            const [local, domain] = value.split('@');
            masked[key] = `${local.charAt(0)}***@${domain}`;
          } else {
            // Show first 4 characters for other sensitive fields
            masked[key] = value.substring(0, 4) + '*'.repeat(Math.max(0, value.length - 4));
          }
        } else {
          masked[key] = '[REDACTED]';
        }
      } else {
        masked[key] = maskValue(value, currentPath);
      }
    }

    return masked;
  };

  // Mask sensitive data in the log message
  if (info.message && typeof info.message === 'object') {
    info.message = maskValue(info.message);
  }

  // Mask sensitive data in metadata
  Object.keys(info).forEach(key => {
    if (key !== 'level' && key !== 'timestamp' && key !== 'message') {
      info[key] = maskValue(info[key]);
    }
  });

  return info;
});

/**
 * Production format: JSON with timestamp and correlation ID
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  maskSensitiveData(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Development format: Human-readable with colors
 */
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  maskSensitiveData(),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]`;

    if (typeof message === 'string') {
      log += `: ${message}`;
    } else {
      log += `: ${JSON.stringify(message)}`;
    }

    // Add metadata if present
    const metaKeys = Object.keys(meta).filter(key =>
      !['timestamp', 'level', 'message'].includes(key)
    );

    if (metaKeys.length > 0) {
      const metaString = metaKeys.map(key => `${key}=${JSON.stringify(meta[key])}`).join(' ');
      log += ` | ${metaString}`;
    }

    return log;
  })
);

/**
 * Create logger configuration based on environment
 */
const createLogger = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

  const transports = [];

  // Console transport (always present)
  transports.push(
    new winston.transports.Console({
      level: logLevel,
      format: isProduction ? productionFormat : developmentFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );

  // File transports (production and when LOG_FILE is specified)
  if (isProduction || process.env.LOG_FILE) {
    const logFile = process.env.LOG_FILE || path.join(logsDir, 'payment-module.log');
    const errorLogFile = path.join(logsDir, 'payment-module-error.log');

    // Combined log file
    transports.push(
      new winston.transports.File({
        filename: logFile,
        level: logLevel,
        format: productionFormat,
        maxsize: 20 * 1024 * 1024, // 20MB
        maxFiles: 14, // Keep 14 files (2 weeks)
        tailable: true,
        handleExceptions: true,
        handleRejections: true
      })
    );

    // Error log file
    transports.push(
      new winston.transports.File({
        filename: errorLogFile,
        level: 'error',
        format: productionFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 30, // Keep 30 files (1 month)
        tailable: true,
        handleExceptions: true,
        handleRejections: true
      })
    );
  }

  return winston.createLogger({
    level: logLevel,
    transports,
    exitOnError: false,
    defaultMeta: {
      service: 'payment-module',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      instanceId: process.env.INSTANCE_ID || require('os').hostname(),
      pid: process.pid
    }
  });
};

// Create the logger instance
const logger = createLogger();

/**
 * Create a child logger with additional context
 *
 * @param {Object} context - Additional context to include in all log messages
 * @returns {winston.Logger} Child logger with context
 */
logger.child = (context) => {
  return logger.child(context);
};

/**
 * Log payment operation start
 *
 * @param {string} operation - Operation name
 * @param {Object} context - Operation context
 * @returns {Object} Context with start time for timing
 */
logger.startOperation = (operation, context = {}) => {
  const operationContext = {
    operation,
    operationId: require('crypto').randomUUID(),
    startTime: Date.now(),
    ...context
  };

  logger.info('Operation started', operationContext);

  return operationContext;
};

/**
 * Log payment operation completion
 *
 * @param {Object} operationContext - Context from startOperation
 * @param {boolean} success - Whether operation was successful
 * @param {Object} result - Operation result
 */
logger.endOperation = (operationContext, success, result = {}) => {
  const duration = Date.now() - operationContext.startTime;

  logger.info('Operation completed', {
    ...operationContext,
    success,
    duration,
    result: success ? result : { error: result.message || result }
  });
};

/**
 * Log payment transaction event
 *
 * @param {string} transactionId - Transaction ID
 * @param {string} event - Event type
 * @param {Object} data - Event data
 */
logger.transaction = (transactionId, event, data = {}) => {
  logger.info('Transaction event', {
    transactionId,
    event,
    eventTime: new Date().toISOString(),
    ...data
  });
};

/**
 * Log API request/response
 *
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {number} status - Response status
 * @param {number} duration - Request duration in ms
 * @param {Object} metadata - Additional metadata
 */
logger.api = (method, url, status, duration, metadata = {}) => {
  const level = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info';

  logger[level]('API request', {
    type: 'api_request',
    method,
    url: url.replace(/\/\d+/g, '/:id'), // Sanitize IDs from URL
    status,
    duration,
    ...metadata
  });
};

/**
 * Log security event
 *
 * @param {string} event - Security event type
 * @param {Object} context - Event context
 * @param {string} severity - Event severity (low, medium, high, critical)
 */
logger.security = (event, context = {}, severity = 'medium') => {
  logger.warn('Security event', {
    type: 'security_event',
    event,
    severity,
    timestamp: new Date().toISOString(),
    ...context
  });
};

/**
 * Log performance metrics
 *
 * @param {string} metric - Metric name
 * @param {number} value - Metric value
 * @param {string} unit - Metric unit (ms, bytes, count, etc.)
 * @param {Object} tags - Additional tags
 */
logger.metric = (metric, value, unit = 'count', tags = {}) => {
  logger.info('Performance metric', {
    type: 'metric',
    metric,
    value,
    unit,
    tags,
    timestamp: Date.now()
  });
};

/**
 * Create a correlation ID for request tracking
 *
 * @returns {string} Correlation ID
 */
logger.createCorrelationId = () => {
  return require('crypto').randomUUID();
};

/**
 * Express middleware for request logging
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
logger.middleware = (req, res, next) => {
  const startTime = Date.now();
  const correlationId = req.headers['x-correlation-id'] || logger.createCorrelationId();

  // Add correlation ID to request
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  // Create request logger
  req.log = logger.child({ correlationId });

  // Log request start
  req.log.info('Request started', {
    method: req.method,
    url: req.url,
    userAgent: req.get('user-agent'),
    ip: req.ip,
    contentLength: req.get('content-length')
  });

  // Log response when finished
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;

    req.log.api(
      req.method,
      req.url,
      res.statusCode,
      duration,
      {
        contentLength: Buffer.byteLength(data || ''),
        correlationId
      }
    );

    return originalSend.call(this, data);
  };

  next();
};

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    type: 'uncaught_exception',
    error: error.message,
    stack: error.stack
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    type: 'unhandled_rejection',
    reason: reason?.message || reason,
    stack: reason?.stack
  });
});

module.exports = logger;