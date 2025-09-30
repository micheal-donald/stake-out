/**
 * Socket Token Cache Utility
 *
 * Caches socket authentication tokens to minimize API calls and prevent rate limiting.
 * Tokens are stored in localStorage with expiry timestamps for validation.
 *
 * Benefits:
 * - Reduces load on /api/socket-token endpoint
 * - Prevents rate limit errors during page refreshes
 * - Allows token reuse across browser tabs
 * - Maintains security with automatic expiry
 */

const CACHE_KEY = 'socket_token_cache';
const TOKEN_LIFETIME_MS = 55 * 60 * 1000; // 55 minutes (5-min buffer before 1h expiry)

/**
 * Token cache structure:
 * {
 *   token: string,        // JWT token for socket authentication
 *   expiresAt: number,    // Timestamp when token expires
 *   userId: string        // User ID for validation
 * }
 */

/**
 * Get cached socket token if valid
 * @param {string} userId - Current user's ID
 * @returns {string|null} - Cached token or null if expired/invalid
 */
export function getCachedSocketToken(userId) {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      return null;
    }

    const { token, expiresAt, userId: cachedUserId } = JSON.parse(cached);
    const now = Date.now();

    // Validate token belongs to current user and hasn't expired
    if (cachedUserId !== userId) {
      console.log('[SocketCache] Token belongs to different user, clearing cache');
      clearSocketTokenCache();
      return null;
    }

    if (now >= expiresAt) {
      console.log('[SocketCache] Token expired, clearing cache');
      clearSocketTokenCache();
      return null;
    }

    const remainingMinutes = Math.floor((expiresAt - now) / 60000);
    console.log(`[SocketCache] Using cached token (valid for ${remainingMinutes} more minutes)`);
    return token;
  } catch (error) {
    console.error('[SocketCache] Error reading cache:', error);
    clearSocketTokenCache();
    return null;
  }
}

/**
 * Store socket token in cache
 * @param {string} token - JWT token to cache
 * @param {string} userId - User ID who owns the token
 */
export function setCachedSocketToken(token, userId) {
  try {
    const expiresAt = Date.now() + TOKEN_LIFETIME_MS;
    const cacheData = {
      token,
      expiresAt,
      userId,
      cachedAt: Date.now()
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    console.log('[SocketCache] Token cached successfully (expires in 55 minutes)');
  } catch (error) {
    console.error('[SocketCache] Error storing token:', error);
    // If localStorage is full or disabled, fail silently (will fetch token on each connection)
  }
}

/**
 * Clear cached socket token
 * Call this on logout or when token is invalidated
 */
export function clearSocketTokenCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    console.log('[SocketCache] Cache cleared');
  } catch (error) {
    console.error('[SocketCache] Error clearing cache:', error);
  }
}

/**
 * Get time until cached token expires
 * @returns {number} - Milliseconds until expiry, or 0 if no valid cache
 */
export function getTimeUntilExpiry() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      return 0;
    }

    const { expiresAt } = JSON.parse(cached);
    const remaining = expiresAt - Date.now();
    return Math.max(0, remaining);
  } catch (error) {
    return 0;
  }
}

/**
 * Check if cached token exists and is valid
 * @param {string} userId - Current user's ID
 * @returns {boolean} - True if valid cached token exists
 */
export function hasCachedToken(userId) {
  return getCachedSocketToken(userId) !== null;
}