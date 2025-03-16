import React, { createContext, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

// Import components
import RegisterComponent from './components/RegisterComponent';
import LoginComponent from './components/LoginComponent';
import ProfileComponent from './components/ProfileComponent';
import BetHistoryComponent from './components/BetHistoryComponent';
import StakeOutBet from './StakeOutBet';

// Authentication guard component
const AuthContext = createContext();

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Main navbar component
const Navbar = ({ isAuthenticated, logout, user }) => {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">Stake Out Bet</Link>
      </div>
      
      <div className="navbar-menu">
        {isAuthenticated ? (
          <>
            <div className="user-balance">
              Balance: ${parseFloat(user?.balance || 0).toFixed(2)}
            </div>
            <Link to="/profile">Profile</Link>
            <Link to="/history">Bet History</Link>
            <button onClick={logout} className="logout-btn">Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
};

// Home/Dashboard component
const Dashboard = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const navigate = useNavigate();
  
  const handlePlayClick = (e) => {
    e.preventDefault(); // Prevent the Link's default navigation
    navigate('/stakeout');
  };
  
  return (
    <div className="dashboard">
      <h2>Welcome, {user.username}!</h2>
      <p>Your balance: ${parseFloat(user.balance || 0).toFixed(2)}</p>
      
      <div className="dashboard-actions">
        <Link to="/profile" className="dashboard-card">
          <h3>Profile</h3>
          <p>Manage your account and settings</p>
        </Link>
        
        <Link to="/history" className="dashboard-card">
          <h3>Bet History</h3>
          <p>View your betting history and statistics</p>
        </Link>
        
        <div className="dashboard-card betting-card">
          <h3>Place Bets</h3>
          <p>Start playing and win big!</p>
          <button className="play-btn" onClick={handlePlayClick}>Play Now</button>
        </div>
      </div>
    </div>
  );
};

// Main app component
const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  
  // Define the auth context value
  const authContext = {
    isAuthenticated,
    setIsAuthenticated,
    user,
    setUser
  };

  // Check for token on app load
  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (token && storedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(storedUser));
      
      // Set default authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, []);
  
  // Logout function
  const logout = async () => {
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
  };
  
  return (
    <AuthContext.Provider value={authContext}>
    <Router>
      <div className="app">
        <Navbar isAuthenticated={isAuthenticated} logout={logout} user={user} />
        
        <div className="container">
          <Routes>
            <Route path="/" element={
              isAuthenticated ? 
                <PrivateRoute><Dashboard /></PrivateRoute> : 
                <Navigate to="/login" replace />
            } />
            
            <Route path="/login" element={
              !isAuthenticated ? 
                <LoginComponent /> : 
                <Navigate to="/" replace />
            } />
            
            <Route path="/register" element={
              !isAuthenticated ? 
                <RegisterComponent /> : 
                <Navigate to="/" replace />
            } />
            
            <Route path="/profile" element={
              <PrivateRoute><ProfileComponent /></PrivateRoute>
            } />
            
            <Route path="/history" element={
              <PrivateRoute><BetHistoryComponent /></PrivateRoute>
            } />
            
            <Route path="/stakeout" element={
              <PrivateRoute><StakeOutBet /></PrivateRoute>
            } />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        
        <footer className="footer">
          <p>&copy; {new Date().getFullYear()} Stake Out Bet. All rights reserved.</p>
        </footer>
      </div>
    </Router>
    </AuthContext.Provider>
  );
};

export default App;