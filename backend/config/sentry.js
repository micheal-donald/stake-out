/**
 * Sentry Configuration
 * Error tracking and monitoring for the Battle Arena API
 */

const Sentry = require('@sentry/node');
const logger = require('./logger');

// Initialize Sentry only if DSN is provided
const initSentry = (app) => {
  if (process.env.SENTRY_DSN) {
    try {
      const integrations = [
        // Enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // Enable Express.js middleware tracing
        new Sentry.Integrations.Express({ app }),
      ];

      // Only add profiling integration if the package is available
      try {
        const { nodeProfilingIntegration } = require('@sentry/profiling-node');
        integrations.push(nodeProfilingIntegration());
      } catch (err) {
        logger.warn('Sentry profiling integration not available:', { error: err.message });
      }

      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        integrations,
        // Performance Monitoring
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
        // Set sampling rate for profiling - this is relative to tracesSampleRate
        profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
        // Environment context
        environment: process.env.NODE_ENV || 'development',
      });

      logger.info('Sentry initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Sentry:', { error: error.message });
      return false;
    }
  }

  logger.warn('Sentry DSN not provided, skipping initialization');
  return false;
};

/**
 * Request handler middleware (must be first)
 */
const requestHandler = () => {
  if (process.env.SENTRY_DSN) {
    return Sentry.Handlers.requestHandler ? Sentry.Handlers.requestHandler() : (req, res, next) => next();
  }
  return (req, res, next) => next();
};

/**
 * Tracing middleware (after request handler)
 */
const tracingHandler = () => {
  if (process.env.SENTRY_DSN) {
    return Sentry.Handlers.tracingHandler ? Sentry.Handlers.tracingHandler() : (req, res, next) => next();
  }
  return (req, res, next) => next();
};

/**
 * Error handler middleware (before custom error handlers)
 */
const errorHandler = () => {
  if (process.env.SENTRY_DSN) {
    return Sentry.Handlers.errorHandler ? Sentry.Handlers.errorHandler() : (err, req, res, next) => next(err);
  }
  return (err, req, res, next) => next(err);
};

/**
 * Capture exception and send to Sentry
 */
const captureException = (error, context = {}) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, context);
  }
};

/**
 * Capture message and send to Sentry
 */
const captureMessage = (message, level = 'info', context = {}) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureMessage(message, level, context);
  }
};

/**
 * Set user context in Sentry
 */
const setUser = (user) => {
  if (process.env.SENTRY_DSN) {
    Sentry.setUser(user);
  }
};

/**
 * Clear user context in Sentry
 */
const clearUser = () => {
  if (process.env.SENTRY_DSN) {
    Sentry.setUser(null);
  }
};

/**
 * Add breadcrumb for better error context
 */
const addBreadcrumb = (breadcrumb) => {
  if (process.env.SENTRY_DSN) {
    Sentry.addBreadcrumb(breadcrumb);
  }
};

/**
 * Close Sentry client gracefully
 */
const close = async (timeout = 2000) => {
  if (process.env.SENTRY_DSN) {
    try {
      await Sentry.close(timeout);
    } catch (error) {
      logger.error('Error closing Sentry:', { error: error.message });
    }
  }
};

module.exports = {
  initSentry,
  captureException,
  captureMessage,
  setUser,
  clearUser,
  addBreadcrumb,
  close,
  requestHandler,
  tracingHandler,
  errorHandler,
  Sentry // Export raw Sentry for advanced usage
};