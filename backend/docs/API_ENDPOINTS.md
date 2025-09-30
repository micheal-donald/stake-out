# API Endpoints Documentation

**⚠️ CRITICAL ENDPOINTS - DO NOT REMOVE WITHOUT FRONTEND UPDATES**

This document lists critical API endpoints that are actively used by the frontend. Removing or modifying these endpoints without updating the frontend will cause the application to break.

---

## Authentication Endpoints

### POST /api/register
**Status:** ✅ Active
**Used by:** `AuthContext.jsx:register()`
**Rate Limit:** authLimiter (5 req/15min)
**CSRF:** Temporarily disabled (TODO: enable after frontend update)

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "user": {
    "user_id": "number",
    "username": "string",
    "email": "string",
    "balance": "number",
    "created_at": "timestamp"
  }
}
```

---

### POST /api/login
**Status:** ✅ Active
**Used by:** `AuthContext.jsx:login()`
**Rate Limit:** authLimiter (5 req/15min)
**CSRF:** Temporarily disabled (TODO: enable after frontend update)

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "user_id": "number",
    "username": "string",
    "email": "string",
    "balance": "number",
    "account_status": "string"
  }
}
```

**Sets Cookie:** `token` (httpOnly, 24h expiry)

---

### POST /api/logout
**Status:** ✅ Active
**Used by:** `AuthContext.jsx:logout()`
**Rate Limit:** authLimiter (5 req/15min)
**Auth Required:** Yes
**CSRF:** Temporarily disabled (TODO: enable after frontend update)

**Response:**
```json
{
  "message": "Logout successful"
}
```

---

### GET /api/socket-token
**Status:** ✅ Active
**Used by:** `StakeOutBet.js:124` (getSocketToken function), `utils/socketTokenCache.js`
**Rate Limit:** socketLimiter (20 req/min, per-user)
**Auth Required:** Yes (cookie-based)
**CSRF:** Exempt (GET request, read-only)

**⚠️ CRITICAL:** This endpoint is called when a user connects to Socket.IO for real-time game updates. Removing this will break the entire game functionality.

**Purpose:** Generates a short-lived JWT token for Socket.IO authentication (separate from main auth cookie for security).

**Response:**
```json
{
  "token": "jwt_token_string"
}
```

**Token Lifecycle:**

1. **Initial Connection** (Login → Game Load):
   ```
   User logs in → /api/login sets httpOnly cookie
   → User visits game page → Frontend checks cache (empty)
   → Calls /api/socket-token → Receives JWT (1h expiry)
   → Caches token in localStorage (55min expiry)
   → Connects to Socket.IO with JWT
   ```

2. **Page Refresh** (Within 55 minutes):
   ```
   User refreshes page → Frontend checks cache (valid)
   → Reuses cached token → Connects to Socket.IO
   → NO API call made (saves rate limit quota)
   ```

3. **Token Expiry** (After 55+ minutes):
   ```
   Cache expires → Frontend detects stale token
   → Calls /api/socket-token → New JWT generated
   → Updates cache → Reconnects to Socket.IO
   ```

4. **Token Refresh on Error**:
   ```
   Backend sends authentication_error event
   → Frontend retries with exponential backoff:
      - 1st retry: immediate
      - 2nd retry: 1 second delay
      - 3rd retry: 2 seconds delay
      - 4th retry: 5 seconds delay
   → Prevents rapid-fire requests during network issues
   ```

5. **Logout**:
   ```
   User logs out → /api/logout invalidates session
   → Frontend clears token cache
   → Socket.IO disconnects
   ```

**Rate Limiting Strategy:**
- **Limit**: 20 requests per minute per user (not IP)
- **Why per-user**: Prevents false positives from users on same WiFi/network
- **Why 20**: Allows token refreshes, page reloads, network reconnects, multiple tabs
- **Cache Duration**: 55 minutes (reduces API calls by ~95%)

**Frontend Implementation:**
```javascript
// StakeOutBet.js:124-176 (with caching and retry logic)
const getSocketToken = async (retryCount = 0) => {
  // 1. Check cache first
  const cachedToken = getCachedSocketToken(user?.user_id);
  if (cachedToken) {
    return cachedToken;
  }

  // 2. Implement exponential backoff on retries
  if (retryCount > 0) {
    const delays = [0, 1000, 2000, 5000, 10000];
    await new Promise(resolve => setTimeout(resolve, delays[retryCount]));
  }

  // 3. Fetch new token
  const response = await fetch('http://localhost:4000/api/socket-token', {
    credentials: 'include'
  });

  // 4. Handle rate limiting
  if (response.status === 429) {
    if (retryCount < 3) {
      return getSocketToken(retryCount + 1); // Retry with backoff
    }
    throw new Error('Rate limit exceeded, please wait');
  }

  // 5. Cache successful response
  const data = await response.json();
  setCachedSocketToken(data.token, user.user_id);
  return data.token;
};
```

**Cache Implementation:**
```javascript
// utils/socketTokenCache.js
- Storage: localStorage (persists across page reloads)
- Key: 'socket_token_cache'
- Structure: { token, expiresAt, userId, cachedAt }
- Expiry: 55 minutes (5-minute safety buffer before 1h JWT expiry)
- Validation: Checks userId match + timestamp on each retrieval
```

**Monitoring & Debugging:**
```javascript
// Console logs for tracking token usage:
[SocketToken] Using cached token (valid for 42 more minutes)
[SocketToken] Fetching new token from API
[SocketToken] Rate limit exceeded
[SocketToken] Retry 1, waiting 1000ms...
[SocketCache] Token cached successfully (expires in 55 minutes)
[SocketCache] Cache cleared (on logout)
```

---

## Profile Endpoints

### GET /api/profile
**Status:** ✅ Active
**Used by:** `ProfileComponent.jsx:fetchProfile()`
**Rate Limit:** apiLimiter (100 req/15min)
**Auth Required:** Yes

**Response:**
```json
{
  "user_id": "number",
  "username": "string",
  "email": "string",
  "balance": "number",
  "account_status": "string",
  "created_at": "timestamp",
  "total_bets": "number",
  "total_wagered": "number",
  "total_won": "number"
}
```

---

### PUT /api/profile
**Status:** ✅ Active
**Used by:** `ProfileComponent.jsx:handleUpdateProfile()`
**Rate Limit:** apiLimiter (100 req/15min)
**Auth Required:** Yes
**CSRF:** Required

**Request Body:**
```json
{
  "email": "string (optional)"
}
```

---

## Wallet Endpoints

### GET /api/wallet/balance
**Status:** ✅ Active
**Used by:** `WalletComponent.jsx:fetchBalance()`, `AuthContext.jsx:fetchUser()`
**Rate Limit:** apiLimiter (100 req/15min)
**Auth Required:** Yes

**Response:**
```json
{
  "balance": "number"
}
```

---

### GET /api/wallet/transactions
**Status:** ✅ Active
**Used by:** `WalletComponent.jsx:fetchTransactions()`
**Rate Limit:** apiLimiter (100 req/15min)
**Auth Required:** Yes

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Response:**
```json
{
  "transactions": [
    {
      "transaction_id": "number",
      "transaction_type": "deposit|withdrawal|bet|win",
      "amount": "number",
      "created_at": "timestamp",
      "status": "pending|completed|failed"
    }
  ],
  "pagination": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

---

## Game Endpoints

### GET /api/game/history
**Status:** ✅ Active
**Used by:** `BetHistoryComponent.jsx:fetchBetHistory()`
**Rate Limit:** gameLimiter (30 req/min)
**Auth Required:** Yes

**Response:**
```json
{
  "bets": [
    {
      "bet_id": "number",
      "game_id": "number",
      "amount": "number",
      "multiplier": "number",
      "payout": "number",
      "created_at": "timestamp"
    }
  ]
}
```

---

### POST /api/bet
**Status:** ✅ Active
**Used by:** `StakeOutBet.js` (via Socket.IO, fallback HTTP)
**Rate Limit:** gameLimiter (30 req/min)
**Auth Required:** Yes
**CSRF:** Required

**Request Body:**
```json
{
  "amount": "number",
  "gameId": "string"
}
```

---

## Payment Endpoints (M-Pesa)

### POST /api/mpesa/deposit
**Status:** ✅ Active
**Used by:** `WalletComponent.jsx:handleDeposit()`
**Rate Limit:** paymentLimiter (10 req/10min)
**Auth Required:** Yes
**CSRF:** Required

**Request Body:**
```json
{
  "amount": "number",
  "phone": "string"
}
```

---

### POST /api/mpesa/withdraw
**Status:** ✅ Active
**Used by:** `WalletComponent.jsx:handleWithdraw()`
**Rate Limit:** paymentLimiter (10 req/10min)
**Auth Required:** Yes
**CSRF:** Required

**Request Body:**
```json
{
  "amount": "number",
  "phone": "string"
}
```

---

## Webhook Endpoints

### POST /api/webhooks/mpesa
**Status:** ✅ Active
**Used by:** M-Pesa API (external)
**Rate Limit:** None (external callback)
**Auth Required:** No (verified via M-Pesa signature)
**CSRF:** Exempt

**⚠️ WARNING:** Never apply rate limiting or CSRF to webhook endpoints.

---

## Health Check

### GET /health
**Status:** ✅ Active
**Used by:** Monitoring systems, load balancers
**Rate Limit:** Exempt
**Auth Required:** No
**CSRF:** Exempt

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "timestamp",
  "uptime": "number",
  "database": "connected|disconnected"
}
```

---

## CSRF Token

### GET /api/csrf-token
**Status:** ✅ Active
**Used by:** Frontend (future implementation)
**Rate Limit:** apiLimiter (100 req/15min)
**Auth Required:** No

**Response:**
```json
{
  "csrfToken": "string"
}
```

---

## Rate Limiting Summary

| Limiter | Window | Max Requests | Applied To | Key |
|---------|--------|--------------|------------|-----|
| **apiLimiter** | 15 min | 100 | All `/api/*` routes | IP address |
| **authLimiter** | 15 min | 5 | `/api/register`, `/api/login`, `/api/logout` | IP address |
| **socketLimiter** | 1 min | 20 | `/api/socket-token` | **User ID** (or IP if not authenticated) |
| **gameLimiter** | 1 min | 30 | `/api/bet`, `/api/game/*` | IP address |
| **paymentLimiter** | 10 min | 10 | `/api/mpesa/*` | IP address |
| **adminLimiter** | 10 min | 50 | `/admin/*` (separate server) | IP address |

**Note:** socketLimiter uses user-based rate limiting to prevent false positives from multiple users on the same network (e.g., public WiFi, office network).

---

## Endpoint Removal Checklist

Before removing any endpoint, ensure you:

1. ✅ Search the entire frontend codebase for the endpoint path
2. ✅ Check `AuthContext.jsx` for authentication-related endpoints
3. ✅ Check all component files for direct fetch/axios calls
4. ✅ Verify no Socket.IO fallback uses the endpoint
5. ✅ Update frontend code to use alternative endpoint
6. ✅ Test the application end-to-end
7. ✅ Update this documentation

---

## Common Issues

### Issue: 404 Not Found on /api/socket-token
**Cause:** Endpoint was removed during refactoring
**Impact:** Socket.IO authentication fails, game won't load
**Fix:** Restore endpoint in `backend/routes/auth.js`

### Issue: 429 Too Many Requests on /api/socket-token
**Cause:** Using authLimiter (5 req/15min) instead of socketLimiter (10 req/min)
**Impact:** Users can't connect to game after 5 attempts
**Fix:** Apply socketLimiter specifically to this endpoint in `server.js`

### Issue: 403 CSRF Token Missing
**Cause:** CSRF validation applied to endpoints without frontend support
**Impact:** All POST requests fail
**Fix:** Temporarily disable CSRF for affected endpoints in `middlewares/csrf.js`

---

**Last Updated:** 2025-09-30
**Maintained By:** Backend Team
**Review Frequency:** After every endpoint change