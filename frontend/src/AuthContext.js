import React, { createContext, useState, useCallback, useEffect } from 'react';
import axios from 'axios';

// Create the authentication context
export const AuthContext = createContext(null);

// Authentication provider component
export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  
  // Check authentication status
  const checkAuthStatus = useCallback(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (token && storedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(storedUser));
      
      // Set default authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      setIsAuthenticated(false);
      setUser(null);
      delete axios.defaults.headers.common['Authorization'];
    }
  }, []);
  
  // Initialize auth state on app load
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);
  
  // Login function that can be called from components
  const login = useCallback((token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    setIsAuthenticated(true);
    setUser(userData);
  }, []);
  
  // Logout function
  const logout = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Call logout API
      await axios.post('http://localhost:4000/api/logout', {}, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local storage and state
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      delete axios.defaults.headers.common['Authorization'];
      
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);
  
  // Auth context value
  const authContextValue = {
    isAuthenticated,
    user,
    login,
    logout,
    checkAuthStatus
  };
  
  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};