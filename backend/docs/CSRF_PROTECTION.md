# CSRF Protection

**Implementation:** Double Submit Cookie Pattern
**Status:** ✅ Active

## Overview

The application uses CSRF (Cross-Site Request Forgery) protection to prevent unauthorized commands from being transmitted from a user that the web application trusts.

## How It Works

### Double Submit Cookie Pattern

1. Server generates a random CSRF token on first request
2. Token is sent to client in two ways:
   - As an HTTP-only cookie: `csrf_token`
   - In API response (for SPA to include in requests)
3. Client must include token in subsequent requests via:
   - HTTP header: `X-CSRF-Token` (preferred)
   - Request body: `_csrf`
   - Query parameter: `_csrf`
4. Server validates that cookie token matches request token

## Frontend Integration

### Step 1: Get CSRF Token

```javascript
// On app initialization
const response = await fetch('http://localhost:4000/api/csrf-token', {
  credentials: 'include' // Important: sends cookies
});
const { csrfToken } = await response.json();

// Store token for subsequent requests
localStorage.setItem('csrfToken', csrfToken);
```

### Step 2: Include Token in Requests

#### Using Fetch API

```javascript
const csrfToken = localStorage.getItem('csrfToken');

fetch('http://localhost:4000/api/some-endpoint', {
  method: 'POST',
  credentials: 'include', // Important: sends cookies
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken // Add CSRF token
  },
  body: JSON.stringify({ data: 'value' })
});
```

#### Using Axios

```javascript
import axios from 'axios';

// Configure axios globally
axios.defaults.withCredentials = true;

// Add interceptor to include CSRF token
axios.interceptors.request.use((config) => {
  const csrfToken = localStorage.getItem('csrfToken');
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

// Use axios normally
axios.post('/api/some-endpoint', { data: 'value' });
```

### Step 3: Handle CSRF Errors

```javascript
fetch('http://localhost:4000/api/some-endpoint', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify({ data: 'value' })
})
.then(response => {
  if (response.status === 403) {
    // CSRF token invalid or missing
    // Refresh token and retry
    return refreshCsrfToken().then(() => retry());
  }
  return response.json();
})
.catch(error => console.error('Request failed:', error));
```

## Exempted Endpoints

CSRF validation is **skipped** for:

1. **GET, HEAD, OPTIONS requests** - Safe methods (read-only)
2. **Webhook endpoints** - `/api/webhooks/*` (external callbacks)
3. **Health checks** - `/health`
4. **Socket.IO connections** - Uses separate authentication

## Security Considerations

### ✅ Protections

- **Random token generation** using `crypto.randomBytes(32)`
- **Timing-safe comparison** prevents timing attacks
- **HttpOnly cookie** for cookie portion (can't be read by JavaScript)
- **SameSite=Strict** cookie attribute prevents CSRF via links
- **Token rotation** every 24 hours
- **Logging** of all CSRF violations

### ⚠️ Important Notes

1. **HTTPS Required in Production**
   - CSRF tokens sent over HTTPS only
   - Cookie `secure` flag enabled in production

2. **CORS Configuration**
   - Frontend origin must be whitelisted
   - Credentials must be enabled: `credentials: true`

3. **Token Storage**
   - Store token in `localStorage` or `sessionStorage`
   - Never expose token in URLs (use headers instead)

4. **Mobile Apps**
   - Token should be stored securely (Keychain/KeyStore)
   - Include in all non-GET requests

## Testing CSRF Protection

### Valid Request (Should Succeed)

```bash
# Get CSRF token
TOKEN=$(curl -c cookies.txt http://localhost:4000/api/csrf-token | jq -r '.csrfToken')

# Make request with token
curl -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $TOKEN" \
  -d '{"username":"test","password":"test"}' \
  http://localhost:4000/api/login
```

### Invalid Request (Should Fail with 403)

```bash
# Request without CSRF token
curl -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}' \
  http://localhost:4000/api/login

# Response: {"error":"CSRF token missing","code":"CSRF_MISSING"}
```

### Token Mismatch (Should Fail with 403)

```bash
# Request with wrong token
curl -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: wrong-token" \
  -d '{"username":"test","password":"test"}' \
  http://localhost:4000/api/login

# Response: {"error":"Invalid CSRF token","code":"CSRF_INVALID"}
```

## Troubleshooting

### "CSRF token missing" Error

**Cause:** Token not included in request or cookies not sent

**Solution:**
1. Ensure `credentials: 'include'` in fetch/axios
2. Verify CORS allows credentials
3. Check token is stored and retrieved correctly

### "Invalid CSRF token" Error

**Cause:** Token mismatch between cookie and header

**Solution:**
1. Refresh CSRF token via `/api/csrf-token`
2. Verify token is current (not expired)
3. Check for multiple tabs/windows (token rotation)

### Token Expires Too Quickly

**Cause:** 24-hour token lifetime may be too short for long sessions

**Solution:**
1. Implement token refresh on 403 errors
2. Increase token lifetime (edit `csrf.js`)
3. Refresh token on app focus/resume

## Implementation Details

### Files

- `backend/middlewares/csrf.js` - CSRF middleware
- `backend/config/security.js` - Security configuration
- `backend/server.js` - Middleware integration

### Configuration

```javascript
// Token expiry (default: 24 hours)
maxAge: 24 * 60 * 60 * 1000

// Cookie options
{
  httpOnly: false,  // Must be readable by JavaScript
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000
}
```

## Migration Guide

### For Existing Clients

If you have existing API clients, follow these steps:

1. **Phase 1: Deploy CSRF protection (non-blocking)**
   - Set `CSRF_ENFORCE=false` in environment
   - Log violations without blocking requests

2. **Phase 2: Update clients**
   - Add CSRF token fetching
   - Include token in all requests
   - Test thoroughly

3. **Phase 3: Enforce CSRF protection**
   - Set `CSRF_ENFORCE=true`
   - Monitor error logs for issues

## References

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Double Submit Cookie Pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie)

---

**Last Updated:** 2025-09-30
**Status:** Production Ready ✅