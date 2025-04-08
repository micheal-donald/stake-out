import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';

// Create context with default values
export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  
  useEffect(() => {
    // Check if user is logged in on first render
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (token && storedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(storedUser));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      setIsAuthenticated(false);
      setUser(null);
    }
    
    setAuthChecked(true);
  }, []);
  
  const login = async (username, password) => {
    try {
      const res = await axios.post('http://localhost:4000/api/login', {
        username,
        password
      });
      
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      
      setIsAuthenticated(true);
      setUser(res.data.user);
      
      return { success: true };
    } catch (error) {
      return { 
        success: false,
        error: error.response?.data?.error || 'Login failed. Please check your credentials.'
      };
    }
  };
  
  const logout = async () => {
    try {
      const token = localStorage.getItem('token');
      
      await axios.post('http://localhost:4000/api/logout', {}, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      delete axios.defaults.headers.common['Authorization'];
      
      setIsAuthenticated(false);
      setUser(null);
    }
  };
  
  const updateUserBalance = (newBalance) => {
    if (user) {
      const updatedUser = { ...user, balance: newBalance };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };
  
  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      setIsAuthenticated,
      user, 
      setUser,
      login,
      logout,
      updateUserBalance,
      authChecked
    }}>
      {children}
    </AuthContext.Provider>
  );
};