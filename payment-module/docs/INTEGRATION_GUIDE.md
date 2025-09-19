# Payment Module Integration Guide

Complete guide for integrating the StakeOut Payment Module into your application.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Installation & Setup](#installation--setup)
3. [Authentication](#authentication)
4. [Payment Flow](#payment-flow)
5. [Provider Configuration](#provider-configuration)
6. [Webhook Setup](#webhook-setup)
7. [Error Handling](#error-handling)
8. [Testing](#testing)
9. [Production Deployment](#production-deployment)
10. [Examples](#examples)
11. [Troubleshooting](#troubleshooting)

## Quick Start

### 1. Start the Payment Module

```bash
cd payment-module
npm install
npm run dev
```

The server will start on `http://localhost:3737`

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/stakeout_payments

# JWT Authentication
JWT_SECRET=your-super-secure-jwt-secret

# M-Pesa Configuration (Sandbox)
MPESA_ENABLED=true
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=174379
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=https://your-domain.com/api/webhooks/mpesa/callback
```

### 3. Run Database Migrations

```bash
npm run migrate
```

### 4. Test API Connection

```bash
curl http://localhost:3737/health
```

## Installation & Setup

### Standalone Installation

1. **Clone or Copy the Payment Module**
   ```bash
   git clone <repository-url> payment-module
   cd payment-module
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Database Setup**

   Create PostgreSQL database:
   ```sql
   CREATE DATABASE stakeout_payments;
   CREATE USER payment_user WITH PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE stakeout_payments TO payment_user;
   ```

4. **Environment Configuration**

   See [Environment Variables](#environment-variables) section for complete configuration.

5. **Run Migrations**
   ```bash
   npm run migrate
   ```

6. **Start the Server**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

### Docker Installation

1. **Build Docker Image**
   ```bash
   docker build -t stakeout-payment-module .
   ```

2. **Run Container**
   ```bash
   docker run -p 3737:3737 --env-file .env stakeout-payment-module
   ```

### Integration as Module

1. **Install as NPM Package**
   ```bash
   npm install @stakeout/payment-module
   ```

2. **Import and Initialize**
   ```javascript
   const { PaymentServer } = require('@stakeout/payment-module');

   const paymentServer = new PaymentServer({
     port: 3737,
     database: {
       url: process.env.DATABASE_URL
     },
     providers: {
       mpesa: {
         enabled: true,
         consumerKey: process.env.MPESA_CONSUMER_KEY,
         consumerSecret: process.env.MPESA_CONSUMER_SECRET,
         // ... other config
       }
     }
   });

   await paymentServer.start();
   ```

## Authentication

The payment module uses JWT (JSON Web Tokens) for authentication.

### JWT Token Structure

```javascript
{
  "userId": "user_123456",
  "email": "user@example.com",
  "roles": ["user"],
  "iat": 1642262400,
  "exp": 1642348800
}
```

### Generating JWT Tokens

```javascript
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  {
    userId: 'user_123456',
    email: 'user@example.com'
  },
  process.env.JWT_SECRET,
  { expiresIn: '24h' }
);
```

### Using JWT Tokens

Include the token in the Authorization header:

```javascript
const response = await fetch('/api/payments/initiate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(paymentData)
});
```

## Payment Flow

### 1. Initiate Payment

```javascript
const paymentRequest = {
  amount: 1000.00,
  currency: 'KES',
  provider: 'mpesa',
  phoneNumber: '254708374149',
  description: 'Game credit purchase'
};

const response = await fetch('/api/payments/initiate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(paymentRequest)
});

const result = await response.json();
```

### 2. Handle Provider Actions

Different providers require different user actions:

#### M-Pesa (STK Push)
```javascript
if (result.providerResponse.requiresAction &&
    result.providerResponse.actionType === 'stk_push') {
  // User will receive STK push prompt on their phone
  console.log('Please check your phone for M-Pesa prompt');

  // Poll for status updates
  pollTransactionStatus(result.transaction.id);
}
```

#### Stripe (Card Payment)
```javascript
if (result.providerResponse.requiresAction &&
    result.providerResponse.actionType === 'redirect') {
  // Redirect user to Stripe payment page
  window.location.href = result.providerResponse.redirectUrl;
}
```

### 3. Monitor Transaction Status

```javascript
async function pollTransactionStatus(transactionId) {
  const maxAttempts = 30;
  let attempts = 0;

  const poll = async () => {
    try {
      const response = await fetch(`/api/payments/${transactionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const { transaction } = await response.json();

      if (transaction.status === 'completed') {
        console.log('Payment completed successfully');
        handlePaymentSuccess(transaction);
        return;
      }

      if (transaction.status === 'failed' ||
          transaction.status === 'cancelled' ||
          transaction.status === 'timeout') {
        console.log('Payment failed:', transaction.status);
        handlePaymentFailure(transaction);
        return;
      }

      if (attempts < maxAttempts) {
        attempts++;
        setTimeout(poll, 2000); // Poll every 2 seconds
      } else {
        console.log('Polling timeout');
        handlePaymentTimeout(transaction);
      }
    } catch (error) {
      console.error('Error polling transaction status:', error);
    }
  };

  poll();
}
```

### 4. Handle Results

```javascript
function handlePaymentSuccess(transaction) {
  // Update UI to show success
  showSuccessMessage(`Payment of ${transaction.currency} ${transaction.amount} completed`);

  // Update user balance or grant access
  updateUserBalance(transaction.userId, transaction.amount);

  // Track analytics
  analytics.track('payment_completed', {
    transactionId: transaction.id,
    amount: transaction.amount,
    provider: transaction.providerType
  });
}

function handlePaymentFailure(transaction) {
  // Show error message
  showErrorMessage(`Payment failed: ${transaction.status}`);

  // Track failure for analytics
  analytics.track('payment_failed', {
    transactionId: transaction.id,
    reason: transaction.status
  });
}
```

## Provider Configuration

### M-Pesa Configuration

1. **Register M-Pesa App**
   - Visit [Safaricom Developer Portal](https://developer.safaricom.co.ke)
   - Create new app and get credentials

2. **Environment Variables**
   ```bash
   MPESA_ENABLED=true
   MPESA_ENVIRONMENT=sandbox  # or 'production'
   MPESA_CONSUMER_KEY=your_consumer_key
   MPESA_CONSUMER_SECRET=your_consumer_secret
   MPESA_SHORTCODE=174379
   MPESA_PASSKEY=your_passkey
   MPESA_CALLBACK_URL=https://your-domain.com/api/webhooks/mpesa/callback
   MPESA_TIMEOUT_URL=https://your-domain.com/api/webhooks/mpesa/timeout
   ```

3. **Test Configuration**
   ```bash
   curl -X GET http://localhost:3737/api/payments/providers/mpesa/capabilities \
     -H "Authorization: Bearer ${TOKEN}"
   ```

### Stripe Configuration

1. **Get Stripe Credentials**
   - Visit [Stripe Dashboard](https://dashboard.stripe.com)
   - Get API keys from Developers section

2. **Environment Variables**
   ```bash
   STRIPE_ENABLED=true
   STRIPE_ENVIRONMENT=test  # or 'live'
   STRIPE_SECRET_KEY=sk_test_your_secret_key
   STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   ```

### PayPal Configuration

1. **Create PayPal App**
   - Visit [PayPal Developer Portal](https://developer.paypal.com)
   - Create new app and get credentials

2. **Environment Variables**
   ```bash
   PAYPAL_ENABLED=true
   PAYPAL_ENVIRONMENT=sandbox  # or 'live'
   PAYPAL_CLIENT_ID=your_client_id
   PAYPAL_CLIENT_SECRET=your_client_secret
   PAYPAL_WEBHOOK_ID=your_webhook_id
   ```

## Webhook Setup

Webhooks are crucial for receiving real-time payment status updates from providers.

### Ngrok Setup (Development)

1. **Install Ngrok**
   ```bash
   npm install -g ngrok
   ```

2. **Expose Local Server**
   ```bash
   ngrok http 3737
   ```

3. **Update Webhook URLs**
   ```bash
   # Use the ngrok URL for webhook endpoints
   MPESA_CALLBACK_URL=https://abc123.ngrok.io/api/webhooks/mpesa/callback
   ```

### Production Webhook Setup

1. **Configure Reverse Proxy**
   ```nginx
   # Nginx configuration
   location /api/webhooks/ {
     proxy_pass http://localhost:3737;
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

2. **SSL Certificate**
   ```bash
   # Using Let's Encrypt
   certbot --nginx -d your-domain.com
   ```

3. **Test Webhook Endpoints**
   ```bash
   curl -X GET https://your-domain.com/api/webhooks/mpesa/status
   ```

### Webhook Security

All webhooks include signature verification:

```javascript
// Example webhook verification (handled automatically)
const signature = req.headers['x-signature'];
const payload = req.body;
const secret = process.env.WEBHOOK_SECRET;

const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(payload))
  .digest('hex');

if (signature !== expectedSignature) {
  throw new Error('Invalid webhook signature');
}
```

## Error Handling

### Error Response Format

All API errors follow a consistent format:

```javascript
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Invalid phone number format",
  "code": "INVALID_PHONE_NUMBER",
  "details": {
    "field": "phoneNumber",
    "value": "12345",
    "expected": "254XXXXXXXXX"
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_abc123"
}
```

### Common Error Types

| Error Type | HTTP Status | Description |
|------------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `AUTHENTICATION_ERROR` | 401 | Missing or invalid JWT token |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `DUPLICATE_TRANSACTION` | 409 | Transaction reference already exists |
| `RATE_LIMIT_ERROR` | 429 | Too many requests |
| `PROVIDER_ERROR` | 502 | Payment provider error |
| `INTERNAL_ERROR` | 500 | Internal server error |

### Error Handling Best Practices

```javascript
async function initiatePayment(paymentData) {
  try {
    const response = await fetch('/api/payments/initiate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentData)
    });

    if (!response.ok) {
      const error = await response.json();

      switch (error.error) {
        case 'VALIDATION_ERROR':
          handleValidationError(error);
          break;
        case 'AUTHENTICATION_ERROR':
          handleAuthError(error);
          break;
        case 'PROVIDER_ERROR':
          handleProviderError(error);
          break;
        default:
          handleGenericError(error);
      }
      return;
    }

    const result = await response.json();
    return result;

  } catch (networkError) {
    handleNetworkError(networkError);
  }
}

function handleValidationError(error) {
  // Show specific field errors to user
  if (error.details?.field === 'phoneNumber') {
    showFieldError('phoneNumber', 'Please enter a valid phone number (254XXXXXXXXX)');
  }
}

function handleProviderError(error) {
  // Show provider-specific error
  showMessage(`Payment failed: ${error.message}. Please try again.`);
}
```

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Integration Testing

```javascript
// Example integration test
const request = require('supertest');
const { PaymentServer } = require('../src/server');

describe('Payment API Integration', () => {
  let app;
  let authToken;

  beforeAll(async () => {
    const server = new PaymentServer({ port: 0 });
    app = server.getApp();
    authToken = generateTestToken();
  });

  test('should initiate M-Pesa payment', async () => {
    const paymentData = {
      amount: 100,
      currency: 'KES',
      provider: 'mpesa',
      phoneNumber: '254708374149'
    };

    const response = await request(app)
      .post('/api/payments/initiate')
      .set('Authorization', `Bearer ${authToken}`)
      .send(paymentData)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.transaction).toHaveProperty('id');
  });
});
```

### Load Testing

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test payment endpoint
ab -n 1000 -c 10 -H "Authorization: Bearer ${TOKEN}" \
   -p payment.json -T application/json \
   http://localhost:3737/api/payments/initiate
```

### Test Data

```javascript
// Test phone numbers (Sandbox)
const testPhoneNumbers = {
  success: '254708374149',
  insufficient_funds: '254708374150',
  invalid_account: '254708374151',
  timeout: '254708374152'
};

// Test amounts
const testAmounts = {
  minimum: 1,
  maximum: 300000,
  invalid_low: 0.5,
  invalid_high: 1000000
};
```

## Production Deployment

### Environment Setup

1. **Server Requirements**
   - Node.js 16+
   - PostgreSQL 12+
   - 2GB+ RAM
   - SSL certificate

2. **Environment Variables**
   ```bash
   NODE_ENV=production
   PORT=3737

   # Database
   DATABASE_URL=postgresql://user:pass@prod-db:5432/payments
   DB_POOL_MAX=20

   # Security
   JWT_SECRET=super-secure-production-secret
   WEBHOOK_SECRET=webhook-verification-secret

   # Providers (Production)
   MPESA_ENVIRONMENT=production
   STRIPE_ENVIRONMENT=live
   ```

### Docker Deployment

1. **Dockerfile**
   ```dockerfile
   FROM node:16-alpine

   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production

   COPY src/ ./src/
   COPY docs/ ./docs/

   EXPOSE 3737
   CMD ["npm", "start"]
   ```

2. **Docker Compose**
   ```yaml
   version: '3.8'
   services:
     payment-module:
       build: .
       ports:
         - "3737:3737"
       environment:
         - NODE_ENV=production
         - DATABASE_URL=postgresql://user:pass@db:5432/payments
       depends_on:
         - db

     db:
       image: postgres:14
       environment:
         POSTGRES_DB: payments
         POSTGRES_USER: user
         POSTGRES_PASSWORD: password
       volumes:
         - postgres_data:/var/lib/postgresql/data

   volumes:
     postgres_data:
   ```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-module
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payment-module
  template:
    metadata:
      labels:
        app: payment-module
    spec:
      containers:
      - name: payment-module
        image: stakeout/payment-module:latest
        ports:
        - containerPort: 3737
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: payment-secrets
              key: database-url
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3737
          initialDelaySeconds: 30
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3737
          initialDelaySeconds: 60
          periodSeconds: 30
```

### Monitoring and Logging

1. **Health Checks**
   ```bash
   # Basic health
   curl http://localhost:3737/health

   # Detailed readiness
   curl http://localhost:3737/health/ready

   # System metrics
   curl http://localhost:3737/health/metrics
   ```

2. **Log Aggregation**
   ```javascript
   // Configure structured logging
   const winston = require('winston');

   const logger = winston.createLogger({
     level: 'info',
     format: winston.format.combine(
       winston.format.timestamp(),
       winston.format.json()
     ),
     transports: [
       new winston.transports.File({ filename: 'error.log', level: 'error' }),
       new winston.transports.File({ filename: 'combined.log' })
     ]
   });
   ```

3. **Metrics Collection**
   ```bash
   # Prometheus metrics endpoint
   curl http://localhost:3737/metrics
   ```

## Examples

### Complete React Integration

```jsx
import React, { useState, useEffect } from 'react';

const PaymentComponent = ({ amount, onSuccess, onError }) => {
  const [status, setStatus] = useState('idle');
  const [transaction, setTransaction] = useState(null);

  const initiatePayment = async (phoneNumber) => {
    setStatus('initiating');

    try {
      const response = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount,
          currency: 'KES',
          provider: 'mpesa',
          phoneNumber,
          description: 'Game credit purchase'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const result = await response.json();
      setTransaction(result.transaction);
      setStatus('pending');

      // Start polling for status
      pollTransactionStatus(result.transaction.id);

    } catch (error) {
      setStatus('error');
      onError(error.message);
    }
  };

  const pollTransactionStatus = async (transactionId) => {
    const maxAttempts = 30;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/payments/${transactionId}`, {
          headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });

        const { transaction } = await response.json();
        setTransaction(transaction);

        if (transaction.status === 'completed') {
          setStatus('completed');
          onSuccess(transaction);
          return;
        }

        if (['failed', 'cancelled', 'timeout'].includes(transaction.status)) {
          setStatus('failed');
          onError(`Payment ${transaction.status}`);
          return;
        }

        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 2000);
        } else {
          setStatus('timeout');
          onError('Payment timeout');
        }
      } catch (error) {
        setStatus('error');
        onError('Failed to check payment status');
      }
    };

    poll();
  };

  return (
    <div className="payment-component">
      {status === 'idle' && (
        <PaymentForm onSubmit={initiatePayment} amount={amount} />
      )}

      {status === 'initiating' && (
        <div>Initiating payment...</div>
      )}

      {status === 'pending' && (
        <div>
          <p>Please check your phone for M-Pesa prompt</p>
          <p>Transaction ID: {transaction?.id}</p>
        </div>
      )}

      {status === 'completed' && (
        <div className="success">
          Payment completed successfully!
        </div>
      )}

      {['failed', 'error', 'timeout'].includes(status) && (
        <div className="error">
          Payment failed. Please try again.
        </div>
      )}
    </div>
  );
};
```

### Node.js Backend Integration

```javascript
const express = require('express');
const axios = require('axios');

const app = express();

// Payment service wrapper
class PaymentService {
  constructor(baseUrl, authToken) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
  }

  async initiatePayment(paymentData) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/payments/initiate`,
        paymentData,
        {
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      throw new Error(`Payment initiation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async getTransactionStatus(transactionId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/payments/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.authToken}`
          }
        }
      );

      return response.data.transaction;
    } catch (error) {
      throw new Error(`Failed to get transaction status: ${error.response?.data?.message || error.message}`);
    }
  }
}

// Usage in your application
app.post('/purchase-credits', async (req, res) => {
  try {
    const { userId, amount, phoneNumber } = req.body;

    // Initialize payment service
    const paymentService = new PaymentService(
      process.env.PAYMENT_MODULE_URL,
      generateJWTForUser(userId)
    );

    // Initiate payment
    const result = await paymentService.initiatePayment({
      amount,
      currency: 'KES',
      provider: 'mpesa',
      phoneNumber,
      description: 'Game credits purchase'
    });

    // Store transaction reference in your database
    await saveTransactionReference(userId, result.transaction.id);

    res.json({
      success: true,
      transactionId: result.transaction.id,
      message: 'Payment initiated. Please check your phone for M-Pesa prompt.'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Webhook handler for payment updates
app.post('/payment-webhook', async (req, res) => {
  try {
    const { transactionId, status } = req.body;

    if (status === 'completed') {
      // Payment completed - update user balance
      await updateUserBalance(transactionId);
      await notifyUser(transactionId, 'Payment completed successfully');
    } else if (['failed', 'cancelled', 'timeout'].includes(status)) {
      // Payment failed - handle accordingly
      await handlePaymentFailure(transactionId, status);
      await notifyUser(transactionId, `Payment ${status}`);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

## Troubleshooting

### Common Issues

#### 1. Database Connection Issues

**Error**: `Database connection failed`

**Solutions**:
```bash
# Check database status
pg_isready -h localhost -p 5432

# Test connection
psql -h localhost -p 5432 -U username -d database_name

# Check environment variables
echo $DATABASE_URL
```

#### 2. M-Pesa Authentication Issues

**Error**: `Invalid consumer key or secret`

**Solutions**:
```bash
# Verify credentials
curl -u "$MPESA_CONSUMER_KEY:$MPESA_CONSUMER_SECRET" \
  https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials

# Check environment
echo $MPESA_CONSUMER_KEY
echo $MPESA_ENVIRONMENT
```

#### 3. Webhook Not Receiving Callbacks

**Error**: `Webhook timeout` or `No callback received`

**Solutions**:
1. **Check URL accessibility**:
   ```bash
   curl -X POST https://your-domain.com/api/webhooks/mpesa/callback \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

2. **Verify SSL certificate**:
   ```bash
   openssl s_client -connect your-domain.com:443
   ```

3. **Test with ngrok** (development):
   ```bash
   ngrok http 3737
   # Update MPESA_CALLBACK_URL with ngrok URL
   ```

#### 4. JWT Token Issues

**Error**: `Invalid token` or `Token expired`

**Solutions**:
```javascript
// Verify token structure
const jwt = require('jsonwebtoken');
const decoded = jwt.verify(token, process.env.JWT_SECRET);
console.log('Token payload:', decoded);

// Check expiration
const now = Date.now() / 1000;
if (decoded.exp < now) {
  console.log('Token has expired');
}
```

#### 5. Rate Limiting Issues

**Error**: `Rate limit exceeded`

**Solutions**:
1. **Implement exponential backoff**:
   ```javascript
   async function retryWithBackoff(fn, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (error.status === 429 && i < maxRetries - 1) {
           const delay = Math.pow(2, i) * 1000; // Exponential backoff
           await new Promise(resolve => setTimeout(resolve, delay));
           continue;
         }
         throw error;
       }
     }
   }
   ```

2. **Check rate limit headers**:
   ```javascript
   console.log('Rate limit remaining:', response.headers['x-ratelimit-remaining']);
   console.log('Rate limit reset:', response.headers['x-ratelimit-reset']);
   ```

### Debug Mode

Enable debug logging:

```bash
# Environment variable
DEBUG=payment-module:*

# Or in code
process.env.LOG_LEVEL = 'debug';
```

### Support

For additional support:

1. **Check the logs**:
   ```bash
   tail -f logs/payment-module.log
   ```

2. **Health check endpoints**:
   ```bash
   curl http://localhost:3737/health/ready
   ```

3. **Provider capabilities**:
   ```bash
   curl http://localhost:3737/api/payments/providers
   ```

4. **Test endpoints**:
   ```bash
   # Test M-Pesa connectivity
   curl -X POST http://localhost:3737/api/webhooks/test \
     -H "Content-Type: application/json" \
     -d '{"provider": "mpesa", "transactionId": "test", "status": "completed"}'
   ```

---

This integration guide provides comprehensive information for successfully implementing the StakeOut Payment Module. For specific implementation questions or issues not covered here, please refer to the API documentation or contact the development team.