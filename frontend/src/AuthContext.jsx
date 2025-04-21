import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';

// Create the auth context
export const AuthContext = createContext();

// Provider component
export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for stored token and user data on initial load
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
      
      if (token && storedUser) {
        // Set axios default header
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        try {
          // Verify token validity with a backend call
          const res = await axios.get('http://localhost:4000/api/profile', {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          // Update user with latest data
          setUser(res.data.user);
          setIsAuthenticated(true);
        } catch (error) {
          // Token is invalid or expired
          console.error('Authentication error:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setIsAuthenticated(false);
          setUser(null);
        }
      }
      
      setLoading(false);
    };

    checkAuth();
  }, []);

  // Login function
  const login = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    
    // Set axios default header
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    setUser(userData);
    setIsAuthenticated(true);
  };

  // Logout function
  const logout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        // Notify the server about logout
        await axios.post('http://localhost:4000/api/logout', {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
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
  };

  // Update user balance
  const updateUserBalance = (newBalance) => {
    if (user) {
      const updatedUser = { ...user, balance: newBalance };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  // Update user profile
  const updateUserProfile = (updatedData) => {
    if (user) {
      const updatedUser = { ...user, ...updatedData };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
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