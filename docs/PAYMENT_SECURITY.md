# Payment Security Implementation Guide

**Last Updated:** November 26, 2025
**Status:** ✅ Implemented (Pending Database Migration)

---

## Overview

This document details the payment security features implemented to protect against financial fraud, duplicate payments, and unauthorized webhook access.

### Security Features Implemented

1. ✅ **Webhook IP Whitelisting** - Restrict M-Pesa callbacks to authorized IPs
2. ✅ **Payment Idempotency Keys** - Prevent duplicate payment processing
3. ✅ **Request Validation** - Verify webhook payload structure
4. ⏳ **Webhook Signature Verification** - HMAC validation (M-Pesa doesn't provide this for STK Push)

---

## 1. Webhook IP Whitelisting

### Purpose
Prevents attackers from sending fake M-Pesa callbacks by restricting webhook access to only Safaricom's official IP addresses.

### Implementation

**Middleware:** `backend/middlewares/webhookSecurity.js`

**Applied to:** `/api/webhooks/mpesa/callback`

### Configuration

Add Safaricom's official IP ranges to `.env`:

```bash
# Production M-Pesa Webhook IPs (get from Safaricom Developer Portal)
MPESA_WEBHOOK_IPS=196.201.214.200,196.201.214.206,196.201.213.114

# For development/testing (ngrok, localhost)
# In development, both M-Pesa IPs and dev IPs are allowed
# In production, ONLY M-Pesa IPs are allowed
```

### How It Works

```javascript
// Middleware checks:
1. Extract client IP from request (handles proxy headers)
2. Normalize IP (handle IPv6 mapped IPv4)
3. Check if IP is in whitelist
4. Block if not whitelisted (403 Forbidden)
5. Log security events
```

### Getting M-Pesa IP Addresses

**Official Sources:**
1. Safaricom Developer Portal: https://developer.safaricom.co.ke/
2. Contact Safaricom M-Pesa support
3. Check M-Pesa API documentation for current IP ranges

**Important:** IP addresses may change. Verify with Safaricom before production deployment.

### Testing

```bash
# Test from allowed IP (development)
curl -X POST http://localhost:4000/api/webhooks/mpesa/callback \
  -H "Content-Type: application/json" \
  -d '{"Body": {"stkCallback": {}}}'

# Test from blocked IP (should return 403)
# Use VPN or different network to simulate unauthorized IP
```

---

## 2. Payment Idempotency

### Purpose
Prevents double-charging users if:
- Network retries occur
- User clicks "Submit" multiple times
- M-Pesa sends duplicate callbacks

### How It Works

```
┌─────────────┐
│   Frontend  │
│ Generates   │──────┐
│ UUID v4     │      │
└─────────────┘      │
                     │ Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
                     ▼
            ┌────────────────┐
            │   Backend      │
            │ Checks cache   │
            └────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    First Request          Duplicate Request
         │                       │
    Process Payment         Return Cached Response
    Cache Response          (No processing)
         │                       │
         └───────────┬───────────┘
                     │
                Response
```

### Frontend Implementation

**File:** `frontend/src/utils/idempotency.js`

**Auto-generation:** Frontend API client automatically generates UUID v4 for payment requests

```javascript
// Payment requests automatically get Idempotency-Key header
POST /api/mpesa/stk-push
Headers:
  Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
  X-CSRF-Token: ...
Body:
  { amount: 100, phoneNumber: "0712345678" }
```

### Backend Implementation

**File:** `backend/middlewares/idempotency.js`

**Applied to:**
- `/api/mpesa/stk-push`
- `/api/wallet/deposit`
- `/api/wallet/withdraw`

**Database Tables:**
- `transactions.idempotency_key` - Links transaction to idempotency key
- `idempotency_cache` - Caches successful responses for 24 hours

### Idempotency Flow

1. **Client sends request** with `Idempotency-Key` header
2. **Middleware checks** if key exists in cache
3. **If cached:** Return cached response immediately (no processing)
4. **If new:**
   - Process payment
   - Cache successful response (status 2xx)
   - Return response
5. **Cache expires** after 24 hours

### Database Schema

```sql
-- Add to transactions table
ALTER TABLE transactions
ADD COLUMN idempotency_key VARCHAR(36) UNIQUE,
ADD COLUMN idempotency_expires_at TIMESTAMP;

-- Idempotency cache table
CREATE TABLE idempotency_cache (
  idempotency_key VARCHAR(36) PRIMARY KEY,
  request_hash VARCHAR(64) NOT NULL,      -- Hash of request body
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL           -- 24 hours from created_at
);
```

### Error Responses

**Missing Idempotency-Key:**
```json
{
  "error": "Idempotency-Key header is required for payment requests",
  "code": "IDEMPOTENCY_KEY_MISSING"
}
```

**Invalid UUID Format:**
```json
{
  "error": "Idempotency-Key must be a valid UUID v4",
  "code": "IDEMPOTENCY_KEY_INVALID"
}
```

**Key Reused for Different Request:**
```json
{
  "error": "Idempotency key already used for a different request",
  "code": "IDEMPOTENCY_KEY_CONFLICT"
}
```

---

## 3. Request Validation

### Purpose
Ensures webhook payloads have valid structure before processing.

### Validation Checks

1. **Body Exists:** Request must have non-empty JSON body
2. **Content-Type:** Must be `application/json`
3. **Required Fields:** M-Pesa callback must have `Body.stkCallback` structure

### Implementation

```javascript
// Middleware: webhookRequestValidator
// Applied before webhook processing

// Checks:
✓ req.body exists and not empty
✓ Content-Type includes 'application/json'
✓ Logs security events for invalid requests
```

---

## 4. Monitoring & Logging

### Security Events Logged

All security events are logged with context:

```javascript
logger.logSecurity('WEBHOOK_IP_BLOCKED', null, {
  clientIP: '192.168.1.1',
  path: '/api/webhooks/mpesa/callback',
  method: 'POST',
  userAgent: 'Mozilla/5.0...'
});
```

### Event Types

| Event | Description | Action |
|-------|-------------|--------|
| `WEBHOOK_IP_BLOCKED` | Unauthorized IP attempted callback | Block request, log event |
| `WEBHOOK_EMPTY_BODY` | Empty body in webhook request | Reject request |
| `WEBHOOK_INVALID_CONTENT_TYPE` | Wrong Content-Type header | Reject request |
| `IDEMPOTENCY_KEY_REUSED` | Same key used for different request | Conflict error |

### Viewing Logs

```bash
# Security logs
tail -f backend/logs/security.log

# Application logs
tail -f backend/logs/application.log

# Sentry dashboard
# https://sentry.io/organizations/your-org/
```

---

## 5. Cleanup & Maintenance

### Automated Cleanup

**Idempotency Cache Cleanup:**
- Expired entries automatically deleted (24 hours old)
- Run via database trigger or cron job

```javascript
// Manual cleanup (can run via cron)
const { cleanupExpiredIdempotencyCache } = require('./middlewares/idempotency');
await cleanupExpiredIdempotencyCache();
```

**Cron Job Setup (Optional):**
```bash
# Add to crontab: Run daily at 2 AM
0 2 * * * node /path/to/cleanup-script.js
```

---

## 6. Testing

### Test Idempotency

```bash
# Generate UUID
UUID=$(uuidgen)

# First request (should process)
curl -X POST http://localhost:4000/api/mpesa/stk-push \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $UUID" \
  -H "Cookie: token=YOUR_JWT_TOKEN" \
  -d '{"phoneNumber":"0712345678","amount":100}'

# Duplicate request (should return cached response)
curl -X POST http://localhost:4000/api/mpesa/stk-push \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $UUID" \
  -H "Cookie: token=YOUR_JWT_TOKEN" \
  -d '{"phoneNumber":"0712345678","amount":100}'
```

### Test IP Whitelisting

```bash
# From allowed IP (development: localhost)
curl -X POST http://localhost:4000/api/webhooks/mpesa/callback \
  -H "Content-Type: application/json" \
  -d '{"Body":{"stkCallback":{"CheckoutRequestID":"test","ResultCode":"0"}}}'

# From blocked IP (simulate with X-Forwarded-For)
curl -X POST http://localhost:4000/api/webhooks/mpesa/callback \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 1.2.3.4" \
  -d '{"Body":{"stkCallback":{"CheckoutRequestID":"test","ResultCode":"0"}}}'
# Should return: 403 Forbidden
```

---

## 7. Production Deployment Checklist

### Before Going Live

- [ ] **Configure M-Pesa Webhook IPs**
  ```bash
  # In .env.production
  MPESA_WEBHOOK_IPS=196.201.214.200,196.201.214.206,196.201.213.114
  ```

- [ ] **Run Database Migration**
  ```bash
  psql -U battlearena_user -d battlearena < database/migrations/014_add_payment_idempotency.sql
  ```

- [ ] **Verify Middleware Applied**
  - Check `/api/webhooks/mpesa/callback` has `webhookSecurityMiddleware`
  - Check `/api/mpesa/stk-push` has `idempotencyMiddleware`

- [ ] **Test in Staging**
  - Send test M-Pesa callbacks from Safaricom sandbox
  - Verify IP whitelisting works
  - Test duplicate payment prevention

- [ ] **Configure Monitoring**
  - Set up alerts for `WEBHOOK_IP_BLOCKED` events
  - Monitor idempotency cache size
  - Track payment success/failure rates

- [ ] **Set up Cleanup Cron Job**
  ```javascript
  // scripts/cleanup-idempotency.js
  const { cleanupExpiredIdempotencyCache } = require('../middlewares/idempotency');
  cleanupExpiredIdempotencyCache()
    .then(count => console.log(`Cleaned up ${count} entries`))
    .catch(err => console.error('Cleanup failed:', err));
  ```

---

## 8. Security Best Practices

### Do's ✅
- ✅ Always use HTTPS in production
- ✅ Keep M-Pesa IP whitelist updated
- ✅ Monitor security logs daily
- ✅ Test payment flows in sandbox before production
- ✅ Use idempotency keys for all payment requests
- ✅ Validate all webhook payloads

### Don'ts ❌
- ❌ Never disable IP whitelisting in production
- ❌ Don't reuse idempotency keys
- ❌ Don't skip CSRF tokens
- ❌ Don't expose webhook URLs publicly
- ❌ Don't process webhooks without validation

---

## 9. Troubleshooting

### Issue: Webhook blocked by IP whitelist

**Symptoms:** Legitimate M-Pesa callbacks returning 403 Forbidden

**Solutions:**
1. Verify M-Pesa IP addresses are current
2. Check `MPESA_WEBHOOK_IPS` environment variable
3. Review security logs for blocked IP
4. Contact Safaricom if IP addresses changed

### Issue: Idempotency key conflicts

**Symptoms:** Users seeing "Idempotency key already used" errors

**Solutions:**
1. Check if frontend is generating new UUIDs
2. Verify UUID v4 format
3. Clear idempotency cache if needed:
   ```sql
   DELETE FROM idempotency_cache WHERE idempotency_key = 'xxx';
   ```

### Issue: Duplicate payments still occurring

**Symptoms:** Users charged twice for same transaction

**Solutions:**
1. Verify idempotency middleware is applied to endpoint
2. Check database migration ran successfully
3. Review M-Pesa callback logs for duplicate `CheckoutRequestID`
4. Ensure M-Pesa webhook processes asynchronously

---

## 10. Related Documentation

- [MVP TODO List](../MVP_TODO_LIST.md) - Phase 3: Payment System Hardening
- [Sprint Plan](../SPRINT_PLAN.md) - Week 2, Day 6: Payment Security
- [Webhook Implementation](./WEBHOOK_IMPLEMENTATION.md)
- [Environment Variables](./SECRETS_MANAGEMENT.md)

---

## Support

**For Issues:**
- GitHub Issues: https://github.com/your-repo/issues
- M-Pesa Support: support@safaricom.co.ke
- Developer Portal: https://developer.safaricom.co.ke/

**Emergency Contacts:**
- On-Call Developer: [Add contact]
- M-Pesa Technical Support: [Add contact]
