/**
 * Tests for AuthContext
 * Tests authentication state management and token handling
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

global.localStorage = localStorageMock;

// Mock fetch for API calls
global.fetch = jest.fn();

// Test component that uses AuthContext
const TestComponent = () => {
  const { user, token, login, logout, loading } = useAuth();

  return (
    <div>
      <div data-testid="user-info">
        {user ? `User: ${user.username}` : 'Not logged in'}
      </div>
      <div data-testid="token-info">
        {token ? 'Token present' : 'No token'}
      </div>
      <div data-testid="loading-info">
        {loading ? 'Loading' : 'Not loading'}
      </div>
      <button
        data-testid="login-btn"
        onClick={() => login('testuser', 'password')}
      >
        Login
      </button>
      <button data-testid="logout-btn" onClick={logout}>
        Logout
      </button>
    </div>
  );
};

describe('AuthContext', () => {
  let user;

  beforeEach(() => {
    user = userEvent.setup();
    jest.clearAllMocks();

    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();

    // Reset fetch mock
    fetch.mockClear();
  });

  describe('Initial State', () => {
    test('should initialize with no user when no token in localStorage', () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      expect(screen.getByTestId('user-info')).toHaveTextContent('Not logged in');
      expect(screen.getByTestId('token-info')).toHaveTextContent('No token');
      expect(screen.getByTestId('loading-info')).toHaveTextContent('Not loading');
    });

    test('should initialize with stored token if present in localStorage', () => {
      const mockToken = 'stored-jwt-token';
      const mockUser = { username: 'storeduser', balance: 500 };

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'token') return mockToken;
        if (key === 'user') return JSON.stringify(mockUser);
        return null;
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      expect(screen.getByTestId('user-info')).toHaveTextContent('User: storeduser');
      expect(screen.getByTestId('token-info')).toHaveTextContent('Token present');
    });
  });

  describe('Login Functionality', () => {
    test('should login successfully with valid credentials', async () => {
      const mockResponse = {
        success: true,
        token: 'new-jwt-token',
        user: { username: 'testuser', balance: 1000 }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const loginBtn = screen.getByTestId('login-btn');
      await user.click(loginBtn);

      await act(async () => {
        // Wait for login to complete
      });

      expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'password' })
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('token', 'new-jwt-token');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockResponse.user));
    });

    test('should handle login failure gracefully', async () => {
      const mockResponse = {
        success: false,
        error: 'Invalid credentials'
      };

      fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => mockResponse
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const loginBtn = screen.getByTestId('login-btn');
      await user.click(loginBtn);

      await act(async () => {
        // Wait for login to complete
      });

      expect(screen.getByTestId('user-info')).toHaveTextContent('Not logged in');
      expect(screen.getByTestId('token-info')).toHaveTextContent('No token');
    });

    test('should handle network errors during login', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const loginBtn = screen.getByTestId('login-btn');
      await user.click(loginBtn);

      await act(async () => {
        // Wait for login to complete
      });

      expect(screen.getByTestId('user-info')).toHaveTextContent('Not logged in');
      expect(screen.getByTestId('token-info')).toHaveTextContent('No token');
    });

    test('should show loading state during login', async () => {
      // Create a promise that we can control
      let resolveLogin;
      const loginPromise = new Promise((resolve) => {
        resolveLogin = resolve;
      });

      fetch.mockReturnValueOnce(loginPromise);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const loginBtn = screen.getByTestId('login-btn');
      await user.click(loginBtn);

      // Should show loading state
      expect(screen.getByTestId('loading-info')).toHaveTextContent('Loading');

      // Resolve the login
      resolveLogin({
        ok: true,
        json: async () => ({
          success: true,
          token: 'test-token',
          user: { username: 'testuser' }
        })
      });

      await act(async () => {
        await loginPromise;
      });

      // Loading should be done
      expect(screen.getByTestId('loading-info')).toHaveTextContent('Not loading');
    });
  });

  describe('Logout Functionality', () => {
    test('should logout and clear stored data', async () => {
      // Start with logged in state
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'token') return 'stored-token';
        if (key === 'user') return JSON.stringify({ username: 'testuser' });
        return null;
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Should initially be logged in
      expect(screen.getByTestId('user-info')).toHaveTextContent('User: testuser');

      const logoutBtn = screen.getByTestId('logout-btn');
      await user.click(logoutBtn);

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
      expect(screen.getByTestId('user-info')).toHaveTextContent('Not logged in');
      expect(screen.getByTestId('token-info')).toHaveTextContent('No token');
    });
  });

  describe('Token Management', () => {
    test('should validate token on initialization', async () => {
      const mockToken = 'valid-token';
      const mockUser = { username: 'testuser', balance: 1000 };

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'token') return mockToken;
        if (key === 'user') return JSON.stringify(mockUser);
        return null;
      });

      // Mock token validation
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, user: mockUser })
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await act(async () => {
        // Wait for token validation
      });

      expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/auth/validate', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${mockToken}` }
      });
    });

    test('should clear invalid token from localStorage', async () => {
      const mockToken = 'invalid-token';

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'token') return mockToken;
        return null;
      });

      // Mock token validation failure
      fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ valid: false })
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await act(async () => {
        // Wait for token validation
      });

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
    });
  });

  describe('Context Provider', () => {
    test('should provide auth context to child components', () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // All auth context values should be available
      expect(screen.getByTestId('user-info')).toBeInTheDocument();
      expect(screen.getByTestId('token-info')).toBeInTheDocument();
      expect(screen.getByTestId('loading-info')).toBeInTheDocument();
      expect(screen.getByTestId('login-btn')).toBeInTheDocument();
      expect(screen.getByTestId('logout-btn')).toBeInTheDocument();
    });

    test('should throw error when useAuth is used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('Balance Updates', () => {
    test('should update user balance when provided', async () => {
      const mockToken = 'valid-token';
      const mockUser = { username: 'testuser', balance: 1000 };

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'token') return mockToken;
        if (key === 'user') return JSON.stringify(mockUser);
        return null;
      });

      const TestBalanceComponent = () => {
        const { user, updateBalance } = useAuth();

        return (
          <div>
            <div data-testid="balance">{user?.balance || 0}</div>
            <button
              data-testid="update-balance-btn"
              onClick={() => updateBalance(1500)}
            >
              Update Balance
            </button>
          </div>
        );
      };

      render(
        <AuthProvider>
          <TestBalanceComponent />
        </AuthProvider>
      );

      expect(screen.getByTestId('balance')).toHaveTextContent('1000');

      const updateBtn = screen.getByTestId('update-balance-btn');
      await user.click(updateBtn);

      expect(screen.getByTestId('balance')).toHaveTextContent('1500');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'user',
        JSON.stringify({ username: 'testuser', balance: 1500 })
      );
    });
  });
});