# Migration Guide: Transitioning to Standalone Payment Module

## 📋 **Overview**

This guide provides step-by-step instructions for migrating from the integrated payment system to the standalone payment module. The migration is designed to be gradual and safe, minimizing downtime and risk.

## 🎯 **Migration Objectives**

- **Zero Downtime**: Maintain payment processing during migration
- **Data Integrity**: Preserve all existing transaction data
- **Backward Compatibility**: Ensure existing integrations continue working
- **Rollback Safety**: Ability to revert changes if needed

## 📊 **Current System Analysis**

### **Existing Components to Migrate**
```
Current System:
├── backend/routes/mpesa.js          → payment-module/src/api/routes/
├── backend/services/mpesa.js        → payment-module/src/providers/mpesa/
├── backend/routes/wallet.js         → [Update to use payment module]
├── database tables:
│   ├── transactions                 → [Extend schema]
│   └── mpesa_transactions          → payment_details
└── Frontend integrations           → [Update API calls]
```

### **Dependencies Analysis**
- **Database**: PostgreSQL with existing transaction tables
- **Authentication**: JWT-based auth middleware
- **Configuration**: Environment variables for M-Pesa
- **External APIs**: M-Pesa STK Push and callbacks

## 🗺️ **Migration Roadmap**

### **Phase 1: Preparation & Setup (Week 1)**
- [ ] Audit current payment flows
- [ ] Backup existing data
- [ ] Set up payment module development environment
- [ ] Create migration scripts

### **Phase 2: Module Development (Week 2-3)**
- [ ] Implement payment module core functionality
- [ ] Migrate M-Pesa provider logic
- [ ] Create database schema extensions
- [ ] Implement API compatibility layer

### **Phase 3: Testing & Validation (Week 3-4)**
- [ ] Unit and integration testing
- [ ] Data migration validation
- [ ] Performance testing
- [ ] Security audit

### **Phase 4: Gradual Rollout (Week 4-5)**
- [ ] Deploy payment module alongside existing system
- [ ] Route test transactions to new module
- [ ] Monitor performance and errors
- [ ] Full production rollout

### **Phase 5: Cleanup (Week 5-6)**
- [ ] Remove old payment code
- [ ] Update documentation
- [ ] Performance optimization
- [ ] Team training

## 🔧 **Step-by-Step Migration Process**

### **Step 1: Environment Setup**

#### **1.1 Create Migration Branch**
```bash
# Start from current development state
git checkout -b migration/payment-module-integration

# Ensure clean working directory
git status
```

#### **1.2 Set Up Payment Module**
```bash
# Navigate to payment module directory
cd payment-module

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
```

#### **1.3 Configure Environment Variables**
```env
# Add to .env file
PAYMENT_MODULE_PORT=3001
PAYMENT_MODULE_DATABASE_URL=${DATABASE_URL}
PAYMENT_MODULE_JWT_SECRET=${JWT_SECRET}

# M-Pesa configuration (copy from main app)
MPESA_CONSUMER_KEY=${MPESA_CONSUMER_KEY}
MPESA_CONSUMER_SECRET=${MPESA_CONSUMER_SECRET}
MPESA_SHORTCODE=${MPESA_SHORTCODE}
MPESA_PASSKEY=${MPESA_PASSKEY}
MPESA_CALLBACK_URL=${MPESA_CALLBACK_URL}
```

### **Step 2: Database Migration**

#### **2.1 Create Schema Extension Script**
```sql
-- migration/001_extend_payment_schema.sql

-- Add new columns to existing transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS
  provider_type VARCHAR(50) DEFAULT 'mpesa',
  currency VARCHAR(3) DEFAULT 'KES',
  metadata JSONB DEFAULT '{}',
  external_reference VARCHAR(255);

-- Create payment_details table for provider-specific data
CREATE TABLE IF NOT EXISTS payment_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  provider_name VARCHAR(50) NOT NULL DEFAULT 'mpesa',
  provider_data JSONB NOT NULL DEFAULT '{}',
  external_reference VARCHAR(255),
  callback_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(transaction_id, provider_name)
);

-- Migrate existing mpesa_transactions data
INSERT INTO payment_details (
  transaction_id,
  provider_name,
  provider_data,
  external_reference,
  callback_data,
  created_at,
  updated_at
)
SELECT
  transaction_id,
  'mpesa' as provider_name,
  json_build_object(
    'checkout_request_id', checkout_request_id,
    'phone_number', phone_number,
    'stk_status', stk_status,
    'result_desc', result_desc,
    'mpesa_receipt_number', mpesa_receipt_number,
    'transaction_date', transaction_date,
    'result_code', result_code
  ) as provider_data,
  checkout_request_id as external_reference,
  raw_callback as callback_data,
  created_at,
  updated_at
FROM mpesa_transactions
ON CONFLICT (transaction_id, provider_name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_details_transaction
  ON payment_details(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_details_provider
  ON payment_details(provider_name);
CREATE INDEX IF NOT EXISTS idx_payment_details_external_ref
  ON payment_details(external_reference);

-- Update transactions with provider type
UPDATE transactions SET provider_type = 'mpesa'
WHERE transaction_type = 'deposit' AND provider_type IS NULL;
```

#### **2.2 Execute Migration**
```bash
# Run migration script
psql $DATABASE_URL -f migration/001_extend_payment_schema.sql

# Verify migration success
psql $DATABASE_URL -c "
SELECT
  (SELECT COUNT(*) FROM payment_details) as payment_details_count,
  (SELECT COUNT(*) FROM mpesa_transactions) as mpesa_transactions_count;
"
```

### **Step 3: Code Migration**

#### **3.1 Extract M-Pesa Provider**
```bash
# Create comprehensive M-Pesa provider from existing service
# This preserves all existing functionality with enhanced structure
```

Create `/payment-module/src/providers/mpesa/MpesaProvider.js`:
```javascript
/**
 * M-Pesa Payment Provider
 *
 * Migrated from: backend/services/mpesa.js
 *
 * This class handles all M-Pesa payment operations including:
 * - STK Push initiation
 * - Payment status queries
 * - Callback processing
 * - Transaction management
 *
 * @class MpesaProvider
 * @implements {PaymentProvider}
 */

const axios = require('axios');
const moment = require('moment');
const crypto = require('crypto');
const { PaymentProvider } = require('../PaymentProvider');
const logger = require('../../utils/logger');

class MpesaProvider extends PaymentProvider {
  /**
   * Initialize M-Pesa provider with configuration
   * @param {Object} config - M-Pesa configuration object
   * @param {string} config.consumerKey - M-Pesa consumer key
   * @param {string} config.consumerSecret - M-Pesa consumer secret
   * @param {string} config.shortcode - M-Pesa business shortcode
   * @param {string} config.passkey - M-Pesa passkey
   * @param {string} config.callbackUrl - Webhook callback URL
   * @param {string} config.baseUrl - M-Pesa API base URL
   */
  constructor(config) {
    super();
    this.consumerKey = config.consumerKey;
    this.consumerSecret = config.consumerSecret;
    this.shortcode = config.shortcode;
    this.passkey = config.passkey;
    this.callbackUrl = config.callbackUrl;
    this.baseUrl = config.baseUrl || 'https://sandbox.safaricom.co.ke';
    this.accessToken = null;
    this.tokenExpiry = null;

    // Validate required configuration
    this.validateConfig();
  }

  /**
   * Validate that all required configuration is present
   * @private
   */
  validateConfig() {
    const required = ['consumerKey', 'consumerSecret', 'shortcode', 'passkey', 'callbackUrl'];
    const missing = required.filter(key => !this[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required M-Pesa configuration: ${missing.join(', ')}`);
    }

    logger.info('M-Pesa provider initialized successfully', {
      shortcode: this.shortcode,
      environment: this.baseUrl.includes('sandbox') ? 'sandbox' : 'production'
    });
  }

  // ... rest of the implementation (converted from existing mpesa.js)
}

module.exports = MpesaProvider;
```

#### **3.2 Create Payment Provider Interface**
```javascript
/**
 * Base Payment Provider Interface
 *
 * All payment providers must implement this interface to ensure
 * consistent behavior across different payment systems.
 *
 * @abstract
 * @class PaymentProvider
 */
class PaymentProvider {
  /**
   * Initialize a payment transaction
   * @param {Object} paymentData - Payment information
   * @param {number} paymentData.amount - Payment amount
   * @param {string} paymentData.phoneNumber - Customer phone number
   * @param {string} paymentData.reference - Transaction reference
   * @param {string} [paymentData.description] - Payment description
   * @returns {Promise<Object>} Payment initiation result
   * @abstract
   */
  async initiatePayment(paymentData) {
    throw new Error('initiatePayment method must be implemented');
  }

  /**
   * Check the status of a payment transaction
   * @param {string} transactionId - Transaction identifier
   * @returns {Promise<Object>} Payment status information
   * @abstract
   */
  async checkPaymentStatus(transactionId) {
    throw new Error('checkPaymentStatus method must be implemented');
  }

  /**
   * Process payment callback from provider
   * @param {Object} callbackData - Callback data from provider
   * @returns {Promise<Object>} Processing result
   * @abstract
   */
  async processCallback(callbackData) {
    throw new Error('processCallback method must be implemented');
  }

  /**
   * Get provider name
   * @returns {string} Provider name
   * @abstract
   */
  getProviderName() {
    throw new Error('getProviderName method must be implemented');
  }
}

module.exports = { PaymentProvider };
```

### **Step 4: API Integration Layer**

#### **4.1 Create Compatibility Routes**
```javascript
/**
 * Legacy API Compatibility Layer
 *
 * These routes maintain backward compatibility with the existing
 * frontend application while routing requests to the new payment module.
 *
 * Migration Note: These routes will be deprecated once the frontend
 * is updated to use the new payment module API directly.
 */

const express = require('express');
const router = express.Router();
const PaymentModule = require('../../../payment-module');

// Initialize payment module with current app configuration
const paymentModule = new PaymentModule({
  providers: {
    mpesa: {
      consumerKey: process.env.MPESA_CONSUMER_KEY,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET,
      shortcode: process.env.MPESA_SHORTCODE,
      passkey: process.env.MPESA_PASSKEY,
      callbackUrl: process.env.MPESA_CALLBACK_URL,
      baseUrl: process.env.MPESA_API_URL
    }
  },
  database: {
    connectionString: process.env.DATABASE_URL
  }
});

/**
 * Legacy route: POST /api/mpesa/stk-push
 * Maps to: PaymentModule.initiatePayment()
 *
 * @deprecated Use POST /api/payments/initiate instead
 */
router.post('/stk-push', async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;
    const userId = req.user.userId;

    logger.info('Legacy STK Push request received', {
      userId,
      amount,
      phoneNumber: phoneNumber?.replace(/\d(?=\d{4})/g, '*') // Mask phone number
    });

    // Convert to new payment module format
    const paymentData = {
      provider: 'mpesa',
      amount: parseFloat(amount),
      phoneNumber,
      reference: `STAKEOUT${userId}${Date.now().toString().slice(-6)}`,
      description: 'Battle Arena Deposit',
      userId
    };

    const result = await paymentModule.initiatePayment(paymentData);

    // Convert response to legacy format for backward compatibility
    res.json({
      success: true,
      message: 'Please check your phone to complete the transaction',
      requestId: result.externalReference,
      transactionId: result.transactionId,
      amount: result.amount,
      phoneNumber: phoneNumber,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });

  } catch (error) {
    logger.error('Legacy STK Push failed', { error: error.message });
    res.status(500).json({
      error: error.message || 'Failed to initiate payment'
    });
  }
});

// ... other legacy route mappings

module.exports = router;
```

### **Step 5: Data Validation**

#### **5.1 Create Migration Validation Script**
```javascript
/**
 * Migration Validation Script
 *
 * Validates that data migration was successful by comparing
 * old and new data structures.
 */

const { Pool } = require('pg');
const logger = require('../src/utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function validateMigration() {
  try {
    logger.info('Starting migration validation...');

    // Check transaction counts match
    const transactionCount = await pool.query('SELECT COUNT(*) FROM transactions');
    const mpesaTransactionCount = await pool.query('SELECT COUNT(*) FROM mpesa_transactions');
    const paymentDetailsCount = await pool.query('SELECT COUNT(*) FROM payment_details');

    logger.info('Record counts:', {
      transactions: transactionCount.rows[0].count,
      mpesaTransactions: mpesaTransactionCount.rows[0].count,
      paymentDetails: paymentDetailsCount.rows[0].count
    });

    // Validate data integrity
    const integrityCheck = await pool.query(`
      SELECT
        COUNT(*) as total_transactions,
        COUNT(pd.transaction_id) as migrated_count
      FROM transactions t
      LEFT JOIN payment_details pd ON t.transaction_id = pd.transaction_id
      WHERE t.transaction_type = 'deposit'
    `);

    const { total_transactions, migrated_count } = integrityCheck.rows[0];

    if (total_transactions === migrated_count) {
      logger.info('✅ Data integrity check passed');
    } else {
      logger.error('❌ Data integrity check failed', {
        totalTransactions: total_transactions,
        migratedCount: migrated_count,
        missing: total_transactions - migrated_count
      });
    }

    // Sample data comparison
    const sampleComparison = await pool.query(`
      SELECT
        t.transaction_id,
        t.amount as transaction_amount,
        mt.checkout_request_id as old_reference,
        pd.external_reference as new_reference,
        mt.stk_status as old_status,
        (pd.provider_data->>'stk_status') as new_status
      FROM transactions t
      JOIN mpesa_transactions mt ON t.transaction_id = mt.transaction_id
      JOIN payment_details pd ON t.transaction_id = pd.transaction_id
      LIMIT 5
    `);

    logger.info('Sample data comparison:', sampleComparison.rows);

    logger.info('✅ Migration validation completed successfully');
    return true;

  } catch (error) {
    logger.error('❌ Migration validation failed', { error: error.message });
    return false;
  }
}

if (require.main === module) {
  validateMigration()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Validation script error:', error);
      process.exit(1);
    });
}

module.exports = { validateMigration };
```

### **Step 6: Testing Strategy**

#### **6.1 Create Migration Test Suite**
```javascript
/**
 * Migration Test Suite
 *
 * Comprehensive tests to ensure the payment module works correctly
 * with migrated data and maintains backward compatibility.
 */

describe('Payment Module Migration Tests', () => {

  describe('Data Migration Validation', () => {
    it('should have migrated all M-Pesa transactions', async () => {
      const mpesaCount = await query('SELECT COUNT(*) FROM mpesa_transactions');
      const paymentDetailsCount = await query('SELECT COUNT(*) FROM payment_details WHERE provider_name = \'mpesa\'');

      expect(paymentDetailsCount.rows[0].count).toBe(mpesaCount.rows[0].count);
    });

    it('should maintain data integrity after migration', async () => {
      const sample = await query(`
        SELECT mt.*, pd.provider_data
        FROM mpesa_transactions mt
        JOIN payment_details pd ON mt.transaction_id = pd.transaction_id
        LIMIT 1
      `);

      const originalData = sample.rows[0];
      const migratedData = originalData.provider_data;

      expect(migratedData.checkout_request_id).toBe(originalData.checkout_request_id);
      expect(migratedData.phone_number).toBe(originalData.phone_number);
    });
  });

  describe('API Backward Compatibility', () => {
    it('should handle legacy STK Push requests', async () => {
      const response = await request(app)
        .post('/api/mpesa/stk-push')
        .send({
          phoneNumber: '0712345678',
          amount: 100
        })
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.requestId).toBeDefined();
    });

    it('should maintain callback URL compatibility', async () => {
      const mockCallback = {
        Body: {
          stkCallback: {
            CheckoutRequestID: 'test_request_id',
            ResultCode: 0,
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 100 },
                { Name: 'MpesaReceiptNumber', Value: 'ABC123' }
              ]
            }
          }
        }
      };

      const response = await request(app)
        .post('/api/mpesa/callback')
        .send(mockCallback);

      expect(response.status).toBe(200);
    });
  });

  describe('Performance Tests', () => {
    it('should handle payment initiation within acceptable time', async () => {
      const start = Date.now();

      await request(app)
        .post('/api/payments/initiate')
        .send({
          provider: 'mpesa',
          amount: 100,
          phoneNumber: '254712345678',
          reference: 'TEST_REF'
        })
        .set('Authorization', `Bearer ${testToken}`);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000); // Less than 2 seconds
    });
  });
});
```

### **Step 7: Deployment Strategy**

#### **7.1 Blue-Green Deployment Setup**
```yaml
# docker-compose.migration.yml
# Runs both old and new systems in parallel for testing

version: '3.8'

services:
  # Existing application (Blue)
  app-current:
    build: .
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
    labels:
      - "deployment=blue"

  # New payment module (Green)
  payment-module:
    build: ./payment-module
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
    labels:
      - "deployment=green"

  # Load balancer for gradual migration
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.migration.conf:/etc/nginx/nginx.conf
    depends_on:
      - app-current
      - payment-module
```

#### **7.2 Gradual Traffic Routing**
```nginx
# nginx.migration.conf
# Routes traffic between old and new systems

upstream app_current {
    server app-current:4000;
}

upstream payment_module {
    server payment-module:3001;
}

server {
    listen 80;

    # Route payment requests to new module gradually
    location /api/payments/ {
        # Route 10% of traffic to new module initially
        if ($arg_test_mode = "new") {
            proxy_pass http://payment_module;
        }
        proxy_pass http://app_current;
    }

    # Existing routes continue to old system
    location / {
        proxy_pass http://app_current;
    }
}
```

### **Step 8: Monitoring & Rollback**

#### **8.1 Migration Monitoring Script**
```javascript
/**
 * Migration Monitoring
 *
 * Monitors key metrics during migration to ensure system stability
 */

const { Pool } = require('pg');
const logger = require('./src/utils/logger');

class MigrationMonitor {
  constructor() {
    this.metrics = {
      totalTransactions: 0,
      successfulPayments: 0,
      failedPayments: 0,
      avgResponseTime: 0,
      errorRate: 0
    };
  }

  async collectMetrics() {
    try {
      // Payment success rate
      const paymentStats = await pool.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM transactions
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `);

      const stats = paymentStats.rows[0];
      this.metrics = {
        totalTransactions: parseInt(stats.total),
        successfulPayments: parseInt(stats.successful),
        failedPayments: parseInt(stats.failed),
        errorRate: stats.total > 0 ? (stats.failed / stats.total) * 100 : 0
      };

      // Log metrics
      logger.info('Migration metrics', this.metrics);

      // Check for issues
      this.checkThresholds();

    } catch (error) {
      logger.error('Failed to collect metrics', { error: error.message });
    }
  }

  checkThresholds() {
    const alerts = [];

    if (this.metrics.errorRate > 10) {
      alerts.push(`High error rate: ${this.metrics.errorRate}%`);
    }

    if (this.metrics.totalTransactions === 0) {
      alerts.push('No transactions in the last hour');
    }

    if (alerts.length > 0) {
      logger.error('Migration alerts', { alerts });
      // Trigger rollback if critical issues detected
      if (this.metrics.errorRate > 25) {
        logger.error('Critical error rate detected, consider rollback');
      }
    }
  }

  startMonitoring(intervalMinutes = 5) {
    logger.info(`Starting migration monitoring (${intervalMinutes}min intervals)`);

    setInterval(() => {
      this.collectMetrics();
    }, intervalMinutes * 60 * 1000);
  }
}

module.exports = MigrationMonitor;
```

#### **8.2 Rollback Procedure**
```bash
#!/bin/bash
# rollback.sh - Emergency rollback script

set -e

echo "🚨 Starting emergency rollback procedure..."

# 1. Stop new payment module
echo "Stopping payment module..."
docker-compose stop payment-module

# 2. Restore traffic to original system
echo "Restoring traffic routing..."
cp nginx.original.conf nginx.conf
docker-compose restart nginx

# 3. Revert database changes (if needed)
echo "Checking database rollback need..."
if [ "$1" = "--revert-db" ]; then
    echo "⚠️  Reverting database changes..."
    psql $DATABASE_URL -f migration/rollback_001.sql
fi

# 4. Verify system is working
echo "Verifying system health..."
curl -f http://localhost/api/health || {
    echo "❌ Health check failed after rollback"
    exit 1
}

echo "✅ Rollback completed successfully"
echo "📊 Check monitoring dashboard for system status"
```

## 📊 **Migration Checklist**

### **Pre-Migration**
- [ ] Complete backup of production database
- [ ] Document all current payment flows and APIs
- [ ] Set up monitoring and alerting for migration
- [ ] Prepare rollback procedures and test them
- [ ] Communicate migration timeline to stakeholders

### **During Migration**
- [ ] Execute database schema migration
- [ ] Deploy payment module in parallel with existing system
- [ ] Run data validation scripts
- [ ] Execute comprehensive test suite
- [ ] Monitor system metrics and error rates

### **Post-Migration**
- [ ] Verify all payment flows work correctly
- [ ] Update API documentation
- [ ] Remove deprecated code and routes
- [ ] Archive old payment system components
- [ ] Conduct performance optimization

### **Validation Criteria**
- [ ] All existing transactions successfully migrated
- [ ] Payment success rate maintained (>95%)
- [ ] API response times within acceptable limits (<2s)
- [ ] No data loss or corruption detected
- [ ] All integration tests passing

## 🚨 **Risk Mitigation**

### **Data Loss Prevention**
- Complete database backups before migration
- Transaction-based migration scripts with rollback
- Real-time data validation during migration
- Point-in-time recovery procedures

### **Service Interruption Prevention**
- Blue-green deployment strategy
- Gradual traffic routing to new system
- Comprehensive health checks
- Automated rollback triggers

### **Financial Risk Prevention**
- Thorough testing with small amounts first
- Parallel processing validation
- Real-time transaction monitoring
- Manual verification procedures

## 📞 **Emergency Contacts**

### **Migration Team**
- **Lead Developer**: [Contact Information]
- **Database Administrator**: [Contact Information]
- **DevOps Engineer**: [Contact Information]
- **Product Owner**: [Contact Information]

### **Escalation Procedures**
1. **Level 1**: Development team handles routine issues
2. **Level 2**: Senior technical leadership for system issues
3. **Level 3**: Business leadership for critical decisions
4. **Emergency**: Stop migration and initiate rollback

## 📈 **Success Metrics**

### **Technical Metrics**
- **Migration Time**: Target <4 hours total
- **Data Accuracy**: 100% data integrity maintained
- **Performance**: Response times within 10% of baseline
- **Availability**: >99.9% uptime during migration

### **Business Metrics**
- **Payment Success Rate**: Maintain >95% success rate
- **User Experience**: No customer-facing issues
- **Transaction Volume**: Handle normal transaction load
- **Revenue Impact**: Zero revenue loss due to migration

This migration guide provides a comprehensive roadmap for safely transitioning to the standalone payment module while maintaining system reliability and data integrity.