/**
 * Sentry Error Monitoring Configuration
 *
 * Centralizes error tracking and performance monitoring for production
 */

const Sentry = require('@sentry/node');
const logger = require('./logger');

/**
 * Initialize Sentry
 * Should be called as early as possible in the application
 */
function initSentry(app) {
  // Only initialize if DSN is provided and not in test environment
  if (!process.env.SENTRY_DSN) {
    logger.warn('Sentry DSN not configured. Error monitoring disabled.');
    return false;
  }

  if (process.env.NODE_ENV === 'test') {
    logger.info('Sentry disabled in test environment');
    return false;
  }

  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.npm_package_version || '1.0.0',

      // Performance monitoring
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in production, 100% in dev

      // Integrations
      integrations: [
        // Express integration
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ app }),
        // Additional context
        new Sentry.Integrations.OnUncaughtException({
          onFatalError: (err) => {
            logger.error('Fatal error caught by Sentry:', { error: err.message, stack: err.stack });
            process.exit(1);
          }
        }),
        new Sentry.Integrations.OnUnhandledRejection({ mode: 'warn' })
      ],

      // Before send hook - sanitize sensitive data
      beforeSend(event, hint) {
        // Remove sensitive data
        if (event.request) {
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
          }
        }

        // Remove password fields from extra data
        if (event.extra) {
          ['password', 'password_hash', 'token', 'secret'].forEach(field => {
            if (event.extra[field]) {
              event.extra[field] = '[Filtered]';
            }
          });
        }

        return event;
      },

      // Ignore certain errors
      ignoreErrors: [
        // Browser/network errors
        'NetworkError',
        'Network request failed',
        // Expected errors
        'CSRF_INVALID',
        'CSRF_MISSING',
        'RATE_LIMIT_EXCEEDED'
      ]
    });

    logger.info('Sentry error monitoring initialized', {
      environment: process.env.NODE_ENV,
      release: process.env.npm_package_version
    });

    return true;
  } catch (error) {
    logger.error('Failed to initialize Sentry:', { error: error.message });
    return false;
  }
}

/**
 * Request handler middleware (must be first)
 */
const requestHandler = () => {
  if (process.env.SENTRY_DSN) {
    return Sentry.Handlers.requestHandler();
  }
  return (req, res, next) => next();
};

/**
 * Tracing middleware (after request handler)
 */
const tracingHandler = () => {
  if (process.env.SENTRY_DSN) {
    return Sentry.Handlers.tracingHandler();
  }
  return (req, res, next) => next();
};

/**
 * Error handler middleware (must be after all controllers)
 */
const errorHandler = () => {
  if (process.env.SENTRY_DSN) {
    return Sentry.Handlers.errorHandler({
      shouldHandleError(error) {
        // Send all errors except 4xx client errors
        if (error.status && error.status < 500) {
          return false;
        }
        return true;
      }
    });
  }
  return (err, req, res, next) => next(err);
};

/**
 * Capture exception manually
 */
function captureException(error, context = {}) {
  if (!process.env.SENTRY_DSN) {
    logger.error('Sentry not configured, error not captured:', {
      error: error.message,
      stack: error.stack,
      context
    });
    return null;
  }

  return Sentry.captureException(error, {
    extra: context
  });
}

/**
 * Capture message manually
 */
function captureMessage(message, level = 'info', context = {}) {
  if (!process.env.SENTRY_DSN) {
    logger.log(level, message, context);
    return null;
  }

  return Sentry.captureMessage(message, {
    level,
    extra: context
  });
}

/**
 * Set user context for error tracking
 */
function setUser(user) {
  if (process.env.SENTRY_DSN && user) {
    Sentry.setUser({
      id: user.userId || user.user_id,
      username: user.username,
      email: user.email
    });
  }
}

/**
 * Clear user context
 */
function clearUser() {
  if (process.env.SENTRY_DSN) {
    Sentry.setUser(null);
  }
}

/**
 * Add breadcrumb for debugging
 */
function addBreadcrumb(message, category, level = 'info', data = {}) {
  if (process.env.SENTRY_DSN) {
    Sentry.addBreadcrumb({
      message,
      category,
      level,
      data
    });
  }
}

/**
 * Close Sentry client (for graceful shutdown)
 */
async function close(timeout = 2000) {
  if (process.env.SENTRY_DSN) {
    logger.info('Closing Sentry client...');
    await Sentry.close(timeout);
    logger.info('Sentry client closed');
  }
}

module.exports = {
  initSentry,
  requestHandler,
  tracingHandler,
  errorHandler,
  captureException,
  captureMessage,
  setUser,
  clearUser,
  addBreadcrumb,
  close,
  Sentry // Export raw Sentry for advanced usage
};