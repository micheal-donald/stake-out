/**
 * Idempotency Key Generation Utilities
 *
 * Generates UUID v4 idempotency keys for payment requests
 * to prevent duplicate processing on network retries.
 *
 * Uses browser's built-in crypto.randomUUID() when available,
 * falls back to manual UUID generation for older browsers.
 */

/**
 * Generate a UUID v4 (random UUID)
 *
 * Uses native crypto.randomUUID() when available (modern browsers),
 * otherwise falls back to manual generation using crypto.getRandomValues()
 *
 * @returns {string} UUID v4 string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 */
export function generateIdempotencyKey() {
  // Modern browsers support crypto.randomUUID()
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback for older browsers: manual UUID v4 generation
  return generateUUIDv4Fallback();
}

/**
 * Generate UUID v4 manually using crypto.getRandomValues()
 *
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where x is any hexadecimal digit and y is one of 8, 9, A, or B
 */
function generateUUIDv4Fallback() {
  // Generate 16 random bytes
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

  // Convert to hex string with dashes
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-');
}

/**
 * Validate UUID v4 format
 *
 * @param {string} uuid - UUID string to validate
 * @returns {boolean} True if valid UUID v4
 */
export function isValidIdempotencyKey(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Store idempotency key in sessionStorage for retry tracking
 *
 * This allows the frontend to retry requests with the same key
 * if the initial request fails due to network issues.
 *
 * @param {string} requestType - Type of request (e.g., 'deposit', 'withdrawal')
 * @param {string} idempotencyKey - The generated UUID
 * @param {object} requestData - The request payload
 */
export function storeIdempotencyKey(requestType, idempotencyKey, requestData) {
  try {
    const key = `idempotency_${requestType}`;
    const data = {
      idempotencyKey,
      requestData,
      timestamp: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };

    sessionStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to store idempotency key:', error);
  }
}

/**
 * Retrieve stored idempotency key for retry
 *
 * @param {string} requestType - Type of request
 * @returns {object|null} Stored idempotency data or null if not found/expired
 */
export function getStoredIdempotencyKey(requestType) {
  try {
    const key = `idempotency_${requestType}`;
    const stored = sessionStorage.getItem(key);

    if (!stored) return null;

    const data = JSON.parse(stored);

    // Check if expired
    if (data.expiresAt < Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }

    return data;
  } catch (error) {
    console.warn('Failed to retrieve idempotency key:', error);
    return null;
  }
}

/**
 * Clear stored idempotency key after successful request
 *
 * @param {string} requestType - Type of request
 */
export function clearIdempotencyKey(requestType) {
  try {
    const key = `idempotency_${requestType}`;
    sessionStorage.removeItem(key);
  } catch (error) {
    console.warn('Failed to clear idempotency key:', error);
  }
}

/**
 * Cleanup expired idempotency keys from sessionStorage
 * Call this on app initialization
 */
export function cleanupExpiredIdempotencyKeys() {
  try {
    const keys = Object.keys(sessionStorage);
    const idempotencyKeys = keys.filter(key => key.startsWith('idempotency_'));

    idempotencyKeys.forEach(key => {
      try {
        const stored = sessionStorage.getItem(key);
        if (stored) {
          const data = JSON.parse(stored);
          if (data.expiresAt < Date.now()) {
            sessionStorage.removeItem(key);
          }
        }
      } catch (error) {
        // Invalid data, remove it
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('Failed to cleanup expired idempotency keys:', error);
  }
}

export default {
  generateIdempotencyKey,
  isValidIdempotencyKey,
  storeIdempotencyKey,
  getStoredIdempotencyKey,
  clearIdempotencyKey,
  cleanupExpiredIdempotencyKeys
};
