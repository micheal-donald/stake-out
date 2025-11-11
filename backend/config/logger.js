/**
 * Winston Logger Configuration
 *
 * Provides structured logging with multiple transports and log levels
 * Includes daily log rotation and separate error logging
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

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
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (err) {
  console.warn('Could not create logs directory:', err.message);
}

// Transports configuration
const transports = [
  // Console transport - always available
  new winston.transports.Console({
    format: consoleFormat,
    level: level(),
  }),
];

// Try to add file transports if possible
try {
  // Error file transport
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      level: 'error',
      maxFiles: '30d',
      format,
    })
  );

  // Only add application log in production if file system is available
  if (process.env.NODE_ENV === 'production') {
    transports.push(
      new DailyRotateFile({
        filename: path.join(logsDir, 'application-%DATE%.log'),
        maxFiles: '14d',
        format,
      })
    );
  }
} catch (err) {
  console.warn('Could not set up file logging transports:', err.message);
}

// Create the logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
  exitOnError: false, // Don't exit on logging errors
});

// Create a stream for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Simplified error logging method that works reliably
logger.logError = (error, request) => {
  logger.error({
    message: error.message,
    stack: error.stack,
    url: request ? request.originalUrl : undefined,
    method: request ? request.method : undefined,
    user: request && request.user ? request.user.userId : undefined,
  });
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