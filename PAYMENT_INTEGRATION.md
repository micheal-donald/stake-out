# Payment Module Integration Guide

This document explains how the standalone payment module has been integrated into the StakeOut Bet application while maintaining backward compatibility.

## Overview

The StakeOut Bet application now supports two payment processing modes:

1. **Standalone Payment Module**: Modern, microservices-based payment processing
2. **Legacy M-Pesa Service**: Original embedded payment service for fallback

The integration uses an adapter pattern to ensure seamless operation and gradual migration capabilities.

## Architecture

### Integration Components

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│   M-Pesa Routes     │────│   Payment Adapter    │────│  Payment Module     │
│   (backend/routes)  │    │   (services/)        │    │  (standalone)       │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
                                        │
                                        │ Fallback
                                        ▼
                           ┌──────────────────────┐
                           │  Legacy M-Pesa      │
                           │  Service             │
                           └──────────────────────┘
```

### Key Files Created

1. **`backend/services/paymentModuleClient.js`**
   - HTTP client for communicating with standalone payment module
   - Handles authentication, retries, and error conversion
   - Provides event forwarding capabilities

2. **`backend/services/paymentAdapter.js`**
   - Adapter service maintaining backward compatibility
   - Routes requests to payment module or legacy service
   - Handles graceful fallback scenarios

3. **`database/migrations/008_add_payment_module_integration.sql`**
   - Database schema for payment module integration
   - Legacy payment mapping table for backward compatibility
   - Configuration and health monitoring tables

4. **`backend/.env.example`**
   - Environment configuration example
   - Payment module and legacy service settings

## Configuration

### Environment Variables

```bash
# Payment Module Integration
USE_PAYMENT_MODULE=true                 # Enable payment module
FALLBACK_TO_LEGACY=true                 # Enable legacy fallback
PAYMENT_MODULE_URL=http://localhost:3001 # Payment module endpoint
PAYMENT_MODULE_API_KEY=your_api_key     # Authentication key
PAYMENT_MODULE_TIMEOUT=30000            # Request timeout (ms)
```

### Database Setup

Run the migration to create necessary tables:

```bash
# Apply migration
node database/run-migrations.js
```

The migration creates:
- `legacy_payment_mapping`: Maps legacy transactions to payment module
- `payment_module_config`: Configuration storage
- `payment_service_health`: Health monitoring data

## How It Works

### Payment Flow

1. **Request Processing**:
   - M-Pesa routes receive payment requests
   - Payment adapter checks if payment module is available
   - Routes to payment module (preferred) or legacy service (fallback)

2. **Backward Compatibility**:
   - Legacy API endpoints remain unchanged
   - Response formats maintained for frontend compatibility
   - Transaction IDs mapped between systems

3. **Health Monitoring**:
   - Continuous health checks of payment services
   - Automatic fallback on service unavailability
   - Health status exposed via `/api/mpesa/health` endpoint

### Example Request Flow

```javascript
// 1. Frontend sends M-Pesa payment request (unchanged)
POST /api/mpesa/stk-push
{
  "phoneNumber": "0712345678",
  "amount": 100
}

// 2. Payment adapter routes to payment module
PaymentAdapter.initiateSTKPush() →
  PaymentModuleClient.initiatePayment() →
    HTTP POST to payment-module/api/payments/initiate

// 3. Response converted to legacy format for compatibility
{
  "success": true,
  "requestId": "ws_CO_123456789",
  "transactionId": "12345",
  "message": "Please check your phone"
}
```

## Benefits

### For Development

1. **Gradual Migration**: Existing frontend code works unchanged
2. **A/B Testing**: Can toggle between payment systems
3. **Risk Mitigation**: Fallback ensures service continuity
4. **Modern Architecture**: New features use microservices approach

### For Operations

1. **Service Isolation**: Payment processing can scale independently
2. **Health Monitoring**: Real-time service health visibility
3. **Configuration Management**: Dynamic feature flags
4. **Provider Flexibility**: Easy addition of new payment providers

## Monitoring

### Health Check Endpoint

```bash
GET /api/mpesa/health
```

Response:
```json
{
  "status": "healthy",
  "services": {
    "paymentModule": {
      "status": "online",
      "enabled": true
    },
    "legacyMpesa": {
      "status": "online",
      "enabled": true
    }
  },
  "timestamp": "2024-12-18T10:30:00.000Z"
}
```

### Service Status Values

- **healthy**: Payment module operational
- **degraded**: Using legacy service fallback
- **unhealthy**: All payment services unavailable

## Migration Strategy

### Phase 1: Integration (Current)
- Payment module deployed alongside main application
- Adapter routes traffic based on configuration
- Both services operational for redundancy

### Phase 2: Validation
- Monitor payment module performance
- Gradual traffic shift to payment module
- Legacy service as safety net

### Phase 3: Migration
- Full traffic routing to payment module
- Legacy service for emergency fallback only
- Remove legacy code (future)

## Troubleshooting

### Common Issues

1. **Payment Module Unavailable**
   - Check `PAYMENT_MODULE_URL` configuration
   - Verify payment module service is running
   - Review network connectivity

2. **Authentication Errors**
   - Validate `PAYMENT_MODULE_API_KEY`
   - Check API key configuration in payment module
   - Review request headers in logs

3. **Transaction Mapping Issues**
   - Check `legacy_payment_mapping` table
   - Verify transaction ID mappings
   - Review adapter logs for errors

### Logs

Monitor these log entries:
```bash
# Payment adapter decisions
"Using payment module for STK Push"
"Falling back to legacy M-Pesa service"

# Service health
"Payment module health check failed"
"Payment Module Request: POST /api/payments/initiate"
```

## Future Enhancements

1. **Event Streaming**: Real-time payment events via WebSocket
2. **Provider Expansion**: Additional payment methods (Stripe, PayPal)
3. **Analytics**: Payment processing metrics and insights
4. **Caching**: Response caching for improved performance

## Support

For issues related to payment integration:

1. Check service health via `/api/mpesa/health`
2. Review application logs for adapter decisions
3. Verify environment configuration
4. Test fallback behavior by disabling payment module