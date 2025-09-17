/**
 * Payment Provider Factory
 *
 * Factory class for creating and managing payment provider instances.
 * Implements the Factory Pattern to provide a centralized way to
 * instantiate and configure payment providers based on configuration.
 *
 * Key Features:
 * - Dynamic provider instantiation
 * - Configuration validation and management
 * - Provider capability discovery
 * - Singleton pattern for provider instances
 * - Comprehensive error handling
 * - Provider health monitoring
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const MpesaProvider = require('./mpesa/MpesaProvider');
const PaymentError = require('../errors/PaymentError');
const logger = require('../utils/logger');

/**
 * Available payment providers registry
 */
const PROVIDER_REGISTRY = {
  mpesa: {
    class: MpesaProvider,
    displayName: 'M-Pesa',
    type: 'mobile_money',
    supportedCurrencies: ['KES'],
    supportedMethods: ['mobile_money'],
    requiredConfig: ['consumerKey', 'consumerSecret', 'shortcode', 'passkey', 'callbackUrl'],
    description: 'Safaricom M-Pesa mobile money service'
  },
  // Future providers can be added here
  stripe: {
    class: null, // To be implemented
    displayName: 'Stripe',
    type: 'card_payment',
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'KES'],
    supportedMethods: ['card', 'bank_transfer'],
    requiredConfig: ['secretKey', 'publishableKey', 'webhookSecret'],
    description: 'Stripe payment processing service'
  },
  paypal: {
    class: null, // To be implemented
    displayName: 'PayPal',
    type: 'digital_wallet',
    supportedCurrencies: ['USD', 'EUR', 'GBP'],
    supportedMethods: ['paypal_wallet', 'card'],
    requiredConfig: ['clientId', 'clientSecret', 'webhookId'],
    description: 'PayPal digital wallet service'
  }
};

/**
 * Payment Provider Factory Class
 */
class ProviderFactory {
  constructor() {
    this.providerInstances = new Map();
    this.providerConfigs = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the provider factory with configuration
   *
   * @async
   * @param {Object} config - Provider configurations
   * @param {Object} config.providers - Provider-specific configurations
   * @param {Object} [config.global] - Global configuration options
   * @returns {Promise<boolean>} True if initialization successful
   */
  async initialize(config) {
    try {
      logger.info('Initializing payment provider factory');

      if (!config || !config.providers) {
        throw new Error('Provider configuration is required');
      }

      // Store configurations
      this.globalConfig = config.global || {};

      // Validate and store provider configurations
      for (const [providerName, providerConfig] of Object.entries(config.providers)) {
        await this.validateProviderConfig(providerName, providerConfig);
        this.providerConfigs.set(providerName, providerConfig);
      }

      // Initialize enabled providers
      await this.initializeProviders();

      this.isInitialized = true;

      logger.info('Payment provider factory initialized successfully', {
        enabledProviders: Array.from(this.providerInstances.keys()),
        totalProviders: this.providerConfigs.size
      });

      return true;

    } catch (error) {
      logger.error('Failed to initialize provider factory', {
        error: error.message
      });

      throw PaymentError.wrap(error, 'INTERNAL_ERROR', 'FACTORY_INITIALIZATION_FAILED');
    }
  }

  /**
   * Validate provider configuration
   *
   * @private
   * @async
   * @param {string} providerName - Provider name
   * @param {Object} config - Provider configuration
   * @throws {PaymentError} If configuration is invalid
   */
  async validateProviderConfig(providerName, config) {
    if (!PROVIDER_REGISTRY[providerName]) {
      throw PaymentError.validationError(
        `Unknown payment provider: ${providerName}`,
        'provider',
        providerName
      );
    }

    const providerInfo = PROVIDER_REGISTRY[providerName];

    // Check if provider class is available
    if (!providerInfo.class) {
      logger.warn('Provider class not implemented', {
        provider: providerName,
        status: 'not_implemented'
      });
      return; // Skip validation for unimplemented providers
    }

    // Validate required configuration fields
    const missingFields = providerInfo.requiredConfig.filter(
      field => !config[field]
    );

    if (missingFields.length > 0) {
      throw PaymentError.validationError(
        `Missing required configuration for ${providerName}: ${missingFields.join(', ')}`,
        'configuration',
        { provider: providerName, missing: missingFields }
      );
    }

    logger.debug('Provider configuration validated', {
      provider: providerName,
      hasRequiredFields: true,
      configFields: Object.keys(config).filter(key => !key.toLowerCase().includes('secret'))
    });
  }

  /**
   * Initialize all configured providers
   *
   * @private
   * @async
   */
  async initializeProviders() {
    for (const [providerName, config] of this.providerConfigs) {
      try {
        const providerInfo = PROVIDER_REGISTRY[providerName];

        // Skip unimplemented providers
        if (!providerInfo.class) {
          logger.info('Skipping unimplemented provider', {
            provider: providerName,
            status: 'not_implemented'
          });
          continue;
        }

        // Check if provider is enabled
        if (config.enabled === false) {
          logger.info('Skipping disabled provider', {
            provider: providerName,
            status: 'disabled'
          });
          continue;
        }

        // Create provider instance
        const providerInstance = await this.createProviderInstance(providerName, config);

        // Initialize provider
        await providerInstance.initialize();

        this.providerInstances.set(providerName, providerInstance);

        logger.info('Provider initialized successfully', {
          provider: providerName,
          type: providerInfo.type,
          supportedCurrencies: providerInfo.supportedCurrencies
        });

      } catch (error) {
        logger.error('Failed to initialize provider', {
          provider: providerName,
          error: error.message
        });

        // Don't throw here - continue with other providers
        // Individual provider failures shouldn't break the entire factory
      }
    }
  }

  /**
   * Create a provider instance
   *
   * @private
   * @async
   * @param {string} providerName - Provider name
   * @param {Object} config - Provider configuration
   * @returns {Promise<PaymentProvider>} Provider instance
   */
  async createProviderInstance(providerName, config) {
    const providerInfo = PROVIDER_REGISTRY[providerName];

    if (!providerInfo.class) {
      throw PaymentError.validationError(
        `Provider ${providerName} is not implemented`,
        'provider',
        providerName
      );
    }

    // Merge global config with provider-specific config
    const mergedConfig = {
      ...this.globalConfig,
      ...config,
      name: providerName,
      displayName: providerInfo.displayName,
      type: providerInfo.type
    };

    return new providerInfo.class(mergedConfig);
  }

  /**
   * Get provider instance by name
   *
   * @param {string} providerName - Provider name
   * @returns {PaymentProvider} Provider instance
   * @throws {PaymentError} If provider not found or not initialized
   */
  getProvider(providerName) {
    if (!this.isInitialized) {
      throw PaymentError.validationError(
        'Provider factory not initialized',
        'factory',
        'not_initialized'
      );
    }

    const provider = this.providerInstances.get(providerName);

    if (!provider) {
      // Check if provider exists in registry but not initialized
      if (PROVIDER_REGISTRY[providerName]) {
        throw PaymentError.validationError(
          `Provider ${providerName} is not available or not initialized`,
          'provider',
          providerName
        );
      }

      throw PaymentError.validationError(
        `Unknown payment provider: ${providerName}`,
        'provider',
        providerName
      );
    }

    return provider;
  }

  /**
   * Get all available provider instances
   *
   * @returns {Map<string, PaymentProvider>} Map of provider instances
   */
  getAllProviders() {
    return new Map(this.providerInstances);
  }

  /**
   * Get enabled provider names
   *
   * @returns {string[]} Array of enabled provider names
   */
  getEnabledProviders() {
    return Array.from(this.providerInstances.keys());
  }

  /**
   * Check if provider is available
   *
   * @param {string} providerName - Provider name
   * @returns {boolean} True if provider is available
   */
  isProviderAvailable(providerName) {
    return this.providerInstances.has(providerName);
  }

  /**
   * Get provider capabilities and information
   *
   * @param {string} [providerName] - Specific provider name, or all if omitted
   * @returns {Object|Array} Provider capabilities
   */
  getProviderCapabilities(providerName = null) {
    if (providerName) {
      const providerInfo = PROVIDER_REGISTRY[providerName];
      const isAvailable = this.isProviderAvailable(providerName);

      if (!providerInfo) {
        throw PaymentError.validationError(
          `Unknown payment provider: ${providerName}`,
          'provider',
          providerName
        );
      }

      return {
        name: providerName,
        displayName: providerInfo.displayName,
        type: providerInfo.type,
        supportedCurrencies: providerInfo.supportedCurrencies,
        supportedMethods: providerInfo.supportedMethods,
        description: providerInfo.description,
        isAvailable,
        isImplemented: !!providerInfo.class
      };
    }

    // Return all providers
    return Object.keys(PROVIDER_REGISTRY).map(name =>
      this.getProviderCapabilities(name)
    );
  }

  /**
   * Get providers supporting specific currency
   *
   * @param {string} currency - Currency code (e.g., 'KES', 'USD')
   * @returns {string[]} Array of provider names supporting the currency
   */
  getProvidersByCurrency(currency) {
    const supportingProviders = [];

    for (const [providerName, providerInfo] of Object.entries(PROVIDER_REGISTRY)) {
      if (providerInfo.supportedCurrencies.includes(currency) &&
          this.isProviderAvailable(providerName)) {
        supportingProviders.push(providerName);
      }
    }

    return supportingProviders;
  }

  /**
   * Get providers supporting specific payment method
   *
   * @param {string} method - Payment method (e.g., 'mobile_money', 'card')
   * @returns {string[]} Array of provider names supporting the method
   */
  getProvidersByMethod(method) {
    const supportingProviders = [];

    for (const [providerName, providerInfo] of Object.entries(PROVIDER_REGISTRY)) {
      if (providerInfo.supportedMethods.includes(method) &&
          this.isProviderAvailable(providerName)) {
        supportingProviders.push(providerName);
      }
    }

    return supportingProviders;
  }

  /**
   * Find best provider for payment requirements
   *
   * @param {Object} requirements - Payment requirements
   * @param {string} requirements.currency - Required currency
   * @param {string} [requirements.method] - Preferred payment method
   * @param {number} [requirements.amount] - Payment amount
   * @returns {string|null} Best provider name or null if none suitable
   */
  findBestProvider(requirements) {
    const { currency, method, amount } = requirements;

    // Get providers supporting the currency
    let candidates = this.getProvidersByCurrency(currency);

    if (candidates.length === 0) {
      logger.warn('No providers support required currency', { currency });
      return null;
    }

    // Filter by payment method if specified
    if (method) {
      const methodProviders = this.getProvidersByMethod(method);
      candidates = candidates.filter(provider => methodProviders.includes(provider));

      if (candidates.length === 0) {
        logger.warn('No providers support required payment method', {
          currency,
          method
        });
        return null;
      }
    }

    // Filter by amount limits if specified
    if (amount) {
      candidates = candidates.filter(providerName => {
        const provider = this.getProvider(providerName);
        // This would require implementing amount validation in providers
        // For now, we'll skip this filter
        return true;
      });
    }

    // For now, return the first suitable provider
    // In the future, this could implement more sophisticated selection logic
    // based on fees, success rates, processing times, etc.
    const selectedProvider = candidates[0];

    logger.debug('Selected provider for requirements', {
      requirements,
      selectedProvider,
      candidatesConsidered: candidates.length
    });

    return selectedProvider;
  }

  /**
   * Get factory health status
   *
   * @async
   * @returns {Promise<Object>} Factory health information
   */
  async getHealthStatus() {
    try {
      const providerStatuses = {};
      let healthyProviders = 0;
      let totalProviders = 0;

      for (const [providerName, provider] of this.providerInstances) {
        totalProviders++;

        try {
          // This assumes providers implement a health check method
          // For now, we'll just check if they're initialized
          const isHealthy = provider.isInitialized();

          providerStatuses[providerName] = {
            healthy: isHealthy,
            initialized: isHealthy,
            lastCheck: new Date().toISOString()
          };

          if (isHealthy) {
            healthyProviders++;
          }

        } catch (error) {
          providerStatuses[providerName] = {
            healthy: false,
            initialized: false,
            error: error.message,
            lastCheck: new Date().toISOString()
          };
        }
      }

      return {
        factoryInitialized: this.isInitialized,
        totalProviders,
        healthyProviders,
        healthyPercentage: totalProviders > 0 ? (healthyProviders / totalProviders) * 100 : 0,
        providers: providerStatuses,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get factory health status', {
        error: error.message
      });

      return {
        factoryInitialized: this.isInitialized,
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Shutdown all providers gracefully
   *
   * @async
   */
  async shutdown() {
    logger.info('Shutting down payment provider factory');

    const shutdownPromises = Array.from(this.providerInstances.values()).map(
      async (provider) => {
        try {
          if (typeof provider.shutdown === 'function') {
            await provider.shutdown();
          }
        } catch (error) {
          logger.error('Error shutting down provider', {
            provider: provider.getProviderName(),
            error: error.message
          });
        }
      }
    );

    await Promise.allSettled(shutdownPromises);

    this.providerInstances.clear();
    this.providerConfigs.clear();
    this.isInitialized = false;

    logger.info('Payment provider factory shutdown complete');
  }
}

// Create singleton instance
const providerFactory = new ProviderFactory();

module.exports = {
  ProviderFactory,
  providerFactory,
  PROVIDER_REGISTRY
};