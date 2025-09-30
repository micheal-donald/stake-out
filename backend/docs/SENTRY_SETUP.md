# Sentry Error Monitoring Setup

**Status:** ✅ Configured
**Version:** @sentry/node v10.16+

## Overview

Sentry provides real-time error tracking and performance monitoring for the Battle Arena application. All unhandled errors, exceptions, and performance issues are automatically captured and reported.

## Features

### ✅ Automatic Error Tracking
- Uncaught exceptions
- Unhandled promise rejections
- HTTP request errors
- Database errors
- Game engine errors

### ✅ Performance Monitoring
- Request/response times
- Database query performance
- API endpoint tracing
- Transaction tracking

### ✅ Context & Debugging
- User information (when authenticated)
- Request details (method, URL, headers)
- Breadcrumb trail of events
- Stack traces with source maps

### ✅ Privacy & Security
- Sensitive data filtering (passwords, tokens, cookies)
- Cookie and authorization header removal
- Custom sanitization rules
- GDPR compliance ready

## Quick Start

### 1. Create Sentry Account

1. Go to https://sentry.io/signup/
2. Create a new project (select **Node.js**)
3. Copy your DSN (Data Source Name)

### 2. Configure Environment Variable

Add to your `.env` file:

```bash
# Sentry DSN (required for error monitoring)
SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
```

### 3. Start Application

```bash
npm run dev
```

You should see in the logs:
```
Sentry error monitoring initialized { environment: 'development', release: '1.0.0' }
```

### 4. Test Error Tracking

Trigger a test error:

```bash
curl http://localhost:4000/test-error
```

Or create a test route:

```javascript
app.get('/test-sentry', (req, res) => {
  throw new Error('Test Sentry error');
});
```

Check your Sentry dashboard at: https://sentry.io/organizations/your-org/issues/

## Configuration

### Environment-Based Settings

Sentry behavior changes based on `NODE_ENV`:

| Environment | Sample Rate | Profiling | Behavior |
|-------------|-------------|-----------|----------|
| `development` | 100% | 100% | All errors tracked, full profiling |
| `production` | 10% | 10% | Sample transactions for performance |
| `test` | Disabled | Disabled | No Sentry tracking |

### Custom Configuration

Edit `backend/config/sentry.js`:

```javascript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.npm_package_version,

  // Adjust sample rates
  tracesSampleRate: 0.2, // 20% of transactions
  profilesSampleRate: 0.1, // 10% profiling

  // Add custom tags
  initialScope: {
    tags: {
      "server.region": "us-east-1",
      "server.instance": process.env.INSTANCE_ID
    }
  }
});
```

## Usage

### Automatic Error Capture

Errors are automatically captured:

```javascript
// This error will be sent to Sentry automatically
throw new Error('Something went wrong');

// Async errors too
async function riskyOperation() {
  throw new Error('Async error'); // Captured automatically
}
```

### Manual Error Capture

For controlled error reporting:

```javascript
const sentry = require('./config/sentry');

try {
  // Risky operation
} catch (error) {
  sentry.captureException(error, {
    extra: {
      userId: req.user.id,
      operation: 'payment_processing'
    }
  });
}
```

### Capture Messages

For non-error events:

```javascript
sentry.captureMessage('Payment processed successfully', 'info', {
  userId: 123,
  amount: 100,
  transactionId: 'tx_123'
});
```

### Set User Context

Track which user experienced the error:

```javascript
// After authentication
sentry.setUser({
  id: user.userId,
  username: user.username,
  email: user.email
});

// Clear on logout
sentry.clearUser();
```

### Add Breadcrumbs

Create an audit trail:

```javascript
sentry.addBreadcrumb(
  'User placed bet',
  'game',
  'info',
  {
    gameId: 123,
    amount: 100,
    multiplier: 2.5
  }
);
```

## Ignored Errors

These errors are NOT sent to Sentry:

- Network errors (`NetworkError`, `Network request failed`)
- CSRF errors (`CSRF_INVALID`, `CSRF_MISSING`)
- Rate limiting (`RATE_LIMIT_EXCEEDED`)
- 4xx client errors (unless explicitly captured)

To add more ignored errors, edit `config/sentry.js`:

```javascript
ignoreErrors: [
  'NetworkError',
  'CSRF_INVALID',
  'YourCustomError'
]
```

## Data Privacy

### Automatic Sanitization

The following data is **automatically filtered**:

- Cookies
- Authorization headers
- Password fields
- Tokens and secrets

### Custom Sanitization

Add your own filters in `beforeSend` hook:

```javascript
beforeSend(event, hint) {
  // Remove sensitive fields
  if (event.extra && event.extra.creditCard) {
    event.extra.creditCard = '[Filtered]';
  }
  return event;
}
```

### GDPR Compliance

To fully anonymize user data:

```javascript
Sentry.init({
  beforeSend(event) {
    // Remove all user identifiable information
    delete event.user;
    delete event.request.cookies;
    return event;
  }
});
```

## Dashboard & Alerts

### View Errors

1. Go to https://sentry.io/organizations/your-org/issues/
2. Filter by:
   - Environment (development, production)
   - Error level (error, warning, info)
   - Time period (last hour, day, week)

### Set Up Alerts

1. Go to **Alerts** → **Create Alert Rule**
2. Choose trigger:
   - Error rate exceeds threshold
   - New issue detected
   - Performance degradation
3. Configure notification channel:
   - Email
   - Slack
   - PagerDuty
   - Webhooks

### Example Alert Rules

```yaml
# High error rate
- Alert when: Error rate > 5% for 5 minutes
- Notify: Slack #alerts channel
- Priority: High

# New critical error
- Alert when: New error with level=fatal
- Notify: Email + PagerDuty
- Priority: Critical

# Performance degradation
- Alert when: P95 response time > 2s for 10 minutes
- Notify: Email
- Priority: Medium
```

## Performance Monitoring

### Transaction Tracking

Sentry automatically tracks:

- HTTP requests (all routes)
- Database queries
- External API calls

View in: **Performance** tab on Sentry dashboard

### Custom Transactions

Track specific operations:

```javascript
const transaction = sentry.Sentry.startTransaction({
  op: 'payment.process',
  name: 'Process M-Pesa Payment'
});

try {
  // Your operation
  await processMpesaPayment();
  transaction.setStatus('ok');
} catch (error) {
  transaction.setStatus('internal_error');
  throw error;
} finally {
  transaction.finish();
}
```

## Troubleshooting

### Sentry Not Initializing

**Problem:** "Sentry DSN not configured" message

**Solution:**
1. Verify `SENTRY_DSN` in `.env` file
2. Restart application: `npm run dev`
3. Check DSN format: `https://...@o0.ingest.sentry.io/...`

### Errors Not Appearing

**Problem:** Errors not showing in Sentry dashboard

**Possible Causes:**
1. **Sampling**: Only 10% of events in production
   - Solution: Increase `tracesSampleRate` in config
2. **Ignored errors**: Error type is in `ignoreErrors` list
   - Solution: Remove from ignore list
3. **Network issue**: Can't reach Sentry servers
   - Solution: Check firewall/proxy settings

### Too Many Events

**Problem:** Sentry quota exceeded

**Solution:**
1. Reduce sample rate: `tracesSampleRate: 0.05` (5%)
2. Add more errors to `ignoreErrors` list
3. Upgrade Sentry plan
4. Use Sentry's rate limiting features

## Disabling Sentry

### Temporarily Disable

```bash
# Remove or comment out SENTRY_DSN
# SENTRY_DSN=https://...
```

### Permanently Disable

Remove from `server.js`:

```javascript
// Comment out or remove
// const sentry = require('./config/sentry');
// sentry.initSentry(app);
```

## Best Practices

### ✅ Do

- Set meaningful error messages
- Add context with extra data
- Use breadcrumbs for debugging
- Set user context when authenticated
- Configure alerts for critical errors
- Review errors weekly
- Fix high-frequency errors first

### ❌ Don't

- Send sensitive data (passwords, tokens)
- Ignore all errors
- Exceed your Sentry quota
- Log expected errors (use logger instead)
- Send test errors to production
- Share your DSN publicly

## Integration with Winston Logger

Sentry works alongside Winston:

```javascript
// Both will capture the error
logger.error('Payment failed', { userId: 123 });  // Winston
sentry.captureException(error, { userId: 123 }); // Sentry
```

Use Winston for:
- Debug logs
- Info messages
- Local development

Use Sentry for:
- Production errors
- Performance issues
- Alert notifications
- Team collaboration

## Cost Optimization

### Free Tier Limits

Sentry free tier includes:
- 5,000 errors/month
- 10,000 performance units/month
- 1 team member
- 30-day data retention

### Stay Within Limits

1. **Sample transactions**: Use 10-20% sample rate
2. **Ignore common errors**: Filter network errors, 404s
3. **Use breadcrumbs wisely**: Don't create excessive breadcrumbs
4. **Clean up old issues**: Resolve fixed errors
5. **Monitor usage**: Check https://sentry.io/settings/account/stats/

## Additional Resources

- Sentry Node.js Docs: https://docs.sentry.io/platforms/node/
- Sentry Express Integration: https://docs.sentry.io/platforms/node/guides/express/
- Performance Monitoring: https://docs.sentry.io/product/performance/
- Alerts Guide: https://docs.sentry.io/product/alerts/

---

**Last Updated:** 2025-09-30
**Sentry Version:** 10.16.0
**Status:** Production Ready ✅