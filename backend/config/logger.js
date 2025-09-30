/**
 * Winston Logger Configuration
 *
 * Provides structured logging with multiple transports and log levels
 * Includes daily log rotation and separate error logging
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors for console output
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Determine log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'info';
};

// Custom format for log messages
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Custom format for console output (prettier)
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}` +
              (info.stack ? `\n${info.stack}` : '')
  )
);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
require('fs').mkdirSync(logsDir, { recursive: true });

// Define transports
const transports = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format: consoleFormat,
  })
);

// File transport for all logs (with rotation) - production only
if (process.env.NODE_ENV === 'production') {
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: format,
    })
  );
}

// File transport for errors only (with rotation)
transports.push(
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    level: 'error',
    format: format,
  })
);

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Create a stream for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

/**
 * Helper methods for contextual logging
 */

// Log with user context
logger.logWithUser = (level, message, userId, meta = {}) => {
  logger.log(level, message, { userId, ...meta });
};

// Log request details
logger.logRequest = (req, message, meta = {}) => {
  logger.http(message, {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.user?.userId,
    ...meta
  });
};

// Log error with full context
logger.logError = (error, req = null, meta = {}) => {
  const errorData = {
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...meta
  };

  if (req) {
    errorData.request = {
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      userId: req.user?.userId,
      body: req.body,
      params: req.params,
      query: req.query
    };
  }

  logger.error('Application Error', errorData);
};

// Log game events
logger.logGameEvent = (event, gameId, meta = {}) => {
  logger.info(`Game Event: ${event}`, {
    event,
    gameId,
    timestamp: new Date().toISOString(),
    ...meta
  });
};

// Log payment events
logger.logPayment = (event, userId, amount, meta = {}) => {
  logger.info(`Payment Event: ${event}`, {
    event,
    userId,
    amount,
    timestamp: new Date().toISOString(),
    ...meta
  });
};

// Log security events
logger.logSecurity = (event, userId = null, meta = {}) => {
  logger.warn(`Security Event: ${event}`, {
    event,
    userId,
    timestamp: new Date().toISOString(),
    ...meta
  });
};

// Log admin actions
logger.logAdmin = (action, adminUserId, targetType, targetId, meta = {}) => {
  logger.info(`Admin Action: ${action}`, {
    action,
    adminUserId,
    targetType,
    targetId,
    timestamp: new Date().toISOString(),
    ...meta
  });
};

module.exports = logger;