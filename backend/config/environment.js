/**
 * Environment Configuration Manager
 * Handles environment-specific configuration and validation
 */

require('dotenv').config();

class EnvironmentConfig {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  loadConfiguration() {
    return {
      // Application
      app: {
        name: 'StakeOut Bet API',
        version: process.env.npm_package_version || '1.0.0',
        env: this.env,
        port: parseInt(process.env.PORT) || 4000,
        host: process.env.HOST || 'localhost',
        frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
      },

      // Database
      database: {
        url: process.env.DATABASE_URL,
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        name: process.env.DB_NAME || 'stakeoutbet',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: this.env === 'production' ? true : (process.env.DB_SSL === 'true'),
        pool: {
          min: parseInt(process.env.DB_POOL_MIN) || (this.env === 'production' ? 5 : 2),
          max: parseInt(process.env.DB_POOL_MAX) || (this.env === 'production' ? 20 : 10)
        }
      },

      // Authentication & Security
      auth: {
        jwtSecret: process.env.JWT_SECRET,
        jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || (this.env === 'production' ? 14 : 12),
        sessionSecret: process.env.SESSION_SECRET
      },

      // M-Pesa Legacy Configuration
      mpesa: {
        consumerKey: process.env.MPESA_CONSUMER_KEY,
        consumerSecret: process.env.MPESA_CONSUMER_SECRET,
        businessShortcode: process.env.MPESA_BUSINESS_SHORTCODE,
        passkey: process.env.MPESA_PASSKEY,
        callbackUrl: process.env.MPESA_CALLBACK_URL,
        environment: process.env.MPESA_ENVIRONMENT || 'sandbox',
        baseUrl: process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke'
      },

      // Payment Module Configuration
      paymentModule: {
        url: process.env.PAYMENT_MODULE_URL || 'http://localhost:3001',
        apiKey: process.env.PAYMENT_MODULE_API_KEY,
        timeout: parseInt(process.env.PAYMENT_MODULE_TIMEOUT) || 30000,
        retries: parseInt(process.env.PAYMENT_MODULE_RETRIES) || 3,
        usePaymentModule: process.env.USE_PAYMENT_MODULE !== 'false',
        fallbackToLegacy: process.env.FALLBACK_TO_LEGACY !== 'false'
      },

      // Redis Configuration
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0
      },

      // Logging Configuration
      logging: {
        level: process.env.LOG_LEVEL || (this.env === 'production' ? 'warn' : 'info'),
        file: process.env.LOG_FILE || 'logs/app.log',
        maxSize: process.env.LOG_MAX_SIZE || '10m',
        maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
      },

      // Rate Limiting
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || (this.env === 'production' ? 50 : 100),
        message: process.env.RATE_LIMIT_MESSAGE || 'Too many requests, please try again later'
      },

      // CORS Configuration
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: process.env.CORS_CREDENTIALS !== 'false'
      },

      // Health Check Configuration
      healthCheck: {
        interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
        timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000
      },

      // Game Configuration
      game: {
        minBet: parseInt(process.env.GAME_MIN_BET) || 10,
        maxBet: parseInt(process.env.GAME_MAX_BET) || (this.env === 'production' ? 50000 : 10000),
        houseEdge: parseFloat(process.env.GAME_HOUSE_EDGE) || 0.01,
        maxMultiplier: parseInt(process.env.GAME_MAX_MULTIPLIER) || 1000
      },

      // Monitoring & Analytics
      monitoring: {
        sentryDsn: process.env.SENTRY_DSN,
        datadogApiKey: process.env.DATADOG_API_KEY,
        newRelicLicenseKey: process.env.NEW_RELIC_LICENSE_KEY
      },

      // Feature Flags
      features: {
        enableRegistration: process.env.ENABLE_REGISTRATION !== 'false',
        enableDeposits: process.env.ENABLE_DEPOSITS !== 'false',
        enableWithdrawals: process.env.ENABLE_WITHDRAWALS !== 'false',
        enableAutoBetting: process.env.ENABLE_AUTO_BETTING !== 'false',
        maintenanceMode: process.env.MAINTENANCE_MODE === 'true'
      },

      // Security
      security: {
        helmetEnabled: process.env.HELMET_ENABLED !== 'false',
        contentSecurityPolicy: process.env.HELMET_CONTENT_SECURITY_POLICY !== 'false',
        hsts: process.env.HELMET_HSTS !== 'false'
      },

      // API Configuration
      api: {
        version: process.env.API_VERSION || 'v1',
        rateLimit: parseInt(process.env.API_RATE_LIMIT) || (this.env === 'production' ? 500 : 1000),
        timeout: parseInt(process.env.API_TIMEOUT) || (this.env === 'production' ? 15000 : 30000)
      }
    };
  }

  validateConfiguration() {
    const requiredConfigs = {
      'JWT_SECRET': this.config.auth.jwtSecret,
      'DATABASE_URL': this.config.database.url
    };

    // In production, require additional configs
    if (this.env === 'production') {
      Object.assign(requiredConfigs, {
        'SESSION_SECRET': this.config.auth.sessionSecret,
        'MPESA_CONSUMER_KEY': this.config.mpesa.consumerKey,
        'MPESA_CONSUMER_SECRET': this.config.mpesa.consumerSecret,
        'PAYMENT_MODULE_API_KEY': this.config.paymentModule.apiKey
      });
    }

    const missingConfigs = Object.entries(requiredConfigs)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingConfigs.length > 0) {
      throw new Error(`Missing required environment variables: ${missingConfigs.join(', ')}`);
    }

    // Validate specific values
    this.validateSpecificConfigs();
  }

  validateSpecificConfigs() {
    // Validate JWT secret length
    if (this.config.auth.jwtSecret && this.config.auth.jwtSecret.length < 32) {
      console.warn('WARNING: JWT_SECRET should be at least 32 characters long for security');
    }

    // Validate port range
    if (this.config.app.port < 1000 || this.config.app.port > 65535) {
      throw new Error('PORT must be between 1000 and 65535');
    }

    // Validate bcrypt rounds
    if (this.config.auth.bcryptRounds < 10 || this.config.auth.bcryptRounds > 15) {
      console.warn('WARNING: BCRYPT_ROUNDS should be between 10 and 15');
    }

    // Validate game configuration
    if (this.config.game.minBet >= this.config.game.maxBet) {
      throw new Error('GAME_MIN_BET must be less than GAME_MAX_BET');
    }

    if (this.config.game.houseEdge < 0 || this.config.game.houseEdge > 0.1) {
      throw new Error('GAME_HOUSE_EDGE must be between 0 and 0.1 (10%)');
    }
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj && obj[key], this.config);
  }

  isDevelopment() {
    return this.env === 'development';
  }

  isProduction() {
    return this.env === 'production';
  }

  isTest() {
    return this.env === 'test';
  }

  // Get environment-specific database URL
  getDatabaseUrl() {
    if (this.config.database.url) {
      return this.config.database.url;
    }

    const { host, port, name, user, password } = this.config.database;
    return `postgresql://${user}:${password}@${host}:${port}/${name}`;
  }

  // Get full configuration object
  getAll() {
    return { ...this.config };
  }

  // Print configuration (excluding sensitive data)
  printConfig() {
    const safePrint = (obj, prefix = '') => {
      const sensitive = ['secret', 'password', 'key', 'token', 'dsn'];

      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix + key;

        if (typeof value === 'object' && value !== null) {
          safePrint(value, `${fullKey}.`);
        } else {
          const isSensitive = sensitive.some(s => fullKey.toLowerCase().includes(s));
          const displayValue = isSensitive ? '***HIDDEN***' : value;
          console.log(`${fullKey}: ${displayValue}`);
        }
      }
    };

    console.log('\n=== Environment Configuration ===');
    safePrint(this.config);
    console.log('================================\n');
  }
}

// Export singleton instance
module.exports = new EnvironmentConfig();