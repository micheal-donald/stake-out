/**
 * API Client with CSRF Token Support
 *
 * Centralized axios instance that automatically handles CSRF tokens
 * for all API requests.
 */

import axios from 'axios';

// Get API URL from environment or use default
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Always send cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// CSRF token cache
let csrfToken = null;

/**
 * Fetch CSRF token from the server
 * @returns {Promise<string>} The CSRF token
 */
const fetchCsrfToken = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/csrf-token`, {
      withCredentials: true,
    });

    csrfToken = response.data.csrfToken;
    return csrfToken;
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error);
    throw error;
  }
};

/**
 * Get CSRF token from cookie
 * This is a fallback method if the token is stored in cookies
 * @returns {string|null} The CSRF token from cookie
 */
const getCsrfTokenFromCookie = () => {
  const name = 'csrf_token=';
  const decodedCookie = decodeURIComponent(document.cookie);
  const cookieArray = decodedCookie.split(';');

  for (let cookie of cookieArray) {
    cookie = cookie.trim();
    if (cookie.indexOf(name) === 0) {
      return cookie.substring(name.length);
    }
  }
  return null;
};

/**
 * Get CSRF token (from cache, cookie, or fetch new one)
 * @returns {Promise<string>} The CSRF token
 */
const getCsrfToken = async () => {
  // Try cache first
  if (csrfToken) {
    return csrfToken;
  }

  // Try cookie next
  const cookieToken = getCsrfTokenFromCookie();
  if (cookieToken) {
    csrfToken = cookieToken;
    return csrfToken;
  }

  // Fetch new token
  return await fetchCsrfToken();
};

/**
 * Request interceptor to add CSRF token
 */
apiClient.interceptors.request.use(
  async (config) => {
    // Only add CSRF token for state-changing methods
    const methodsRequiringCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'];

    if (methodsRequiringCsrf.includes(config.method?.toUpperCase())) {
      try {
        const token = await getCsrfToken();
        config.headers['X-CSRF-Token'] = token;
      } catch (error) {
        console.error('Failed to add CSRF token to request:', error);
        // Continue with request even if CSRF token fetch fails
        // The server will reject it, but this allows for better error handling
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor to handle CSRF errors
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If we get a CSRF error, try to refresh the token and retry
    if (
      error.response?.status === 403 &&
      (error.response?.data?.code === 'CSRF_MISSING' ||
       error.response?.data?.code === 'CSRF_INVALID') &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      try {
        // Clear cached token and fetch new one
        csrfToken = null;
        const newToken = await fetchCsrfToken();

        // Update the original request with new token
        originalRequest.headers['X-CSRF-Token'] = newToken;

        // Retry the original request
        return apiClient(originalRequest);
      } catch (retryError) {
        return Promise.reject(retryError);
      }
    }

    // Handle 401 Unauthorized - could redirect to login
    if (error.response?.status === 401) {
      // Check if we're not already on the login page
      if (!window.location.pathname.includes('/login')) {
        console.warn('Unauthorized request - token may have expired');
        // Could dispatch a logout action or redirect here
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Initialize CSRF token on app load
 * Call this when your app starts
 */
export const initializeCsrf = async () => {
  try {
    await fetchCsrfToken();
    console.log('CSRF token initialized successfully');
  } catch (error) {
    console.error('Failed to initialize CSRF token:', error);
  }
};

/**
 * Clear cached CSRF token
 * Useful when logging out or when token becomes invalid
 */
export const clearCsrfToken = () => {
  csrfToken = null;
};

// Export the configured axios instance as default
export default apiClient;

// Also export named instances for convenience
export { apiClient, getCsrfToken, fetchCsrfToken };
