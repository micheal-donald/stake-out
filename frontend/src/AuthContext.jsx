import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';

// Create the auth context
export const AuthContext = createContext();

// Provider component
export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check authentication status on initial load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check authentication status using httpOnly cookie
        const res = await axios.get('http://localhost:4000/api/profile');
        
        // Update user with latest data
        setUser(res.data.user);
        setIsAuthenticated(true);
      } catch (error) {
        // Not authenticated (cookie missing or invalid)
        console.error('Authentication error:', error);
        setIsAuthenticated(false);
        setUser(null);
      }
      
      setLoading(false);
    };

    checkAuth();
  }, []);

  // Login function
  const login = async (username, password) => {
    try {
      const res = await axios.post('http://localhost:4000/api/login', {
        username,
        password
      });
      
      // User data will be in the response
      setUser(res.data.user);
      setIsAuthenticated(true);
      
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error.response?.data?.error || 'Login failed' 
      };
    }
  };

  // Logout function
  const logout = async () => {
    try {
      // Notify the server about logout (clears the httpOnly cookie)
      await axios.post('http://localhost:4000/api/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear state (cookie cleared by server)
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  // Update user balance
  const updateUserBalance = (newBalance) => {
    if (user) {
      const updatedUser = { ...user, balance: newBalance };
      setUser(updatedUser);
    }
  };

  // Update user profile
  const updateUserProfile = (updatedData) => {
    if (user) {
      const updatedUser = { ...user, ...updatedData };
      setUser(updatedUser);
    }
  };

  // Provide auth context value
  const contextValue = {
    isAuthenticated,
    user,
    loading,
    login,
    logout,
    updateUserBalance,
    updateUserProfile
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthContext;