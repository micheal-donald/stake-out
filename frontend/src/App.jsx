import React, { useContext, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';

// Import components
import RegisterComponent from './components/RegisterComponent';
import LoginComponent from './components/LoginComponent';
import ProfileComponent from './components/ProfileComponent';
import BetHistoryComponent from './components/BetHistoryComponent';
import WalletComponent from './components/WalletComponent';
import StakeOutBet from './StakeOutBet';

// Import auth context and provider
import { AuthContext, AuthProvider } from './AuthContext';

// Import CSS
import './style/ProfileComponent.css';

// Authentication guard component
const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Main navbar component
const Navbar = ({ isAuthenticated, logout, user }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/" onClick={closeMobileMenu}>
          <span className="brand-icon">⚔️</span>
          Stake Out Bet
          <span className="brand-subtitle">Battle Arena</span>
        </Link>
      </div>
      
      {/* Hamburger menu button */}
      <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
        <span className={`hamburger ${isMobileMenuOpen ? 'active' : ''}`}>
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
      
      <div className={`navbar-menu ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        {isAuthenticated ? (
          <>
            <div className="user-balance">
              <span className="balance-icon">💰</span>
              ${parseFloat(user?.balance || 0).toFixed(2)}
            </div>
            <Link to="/profile" onClick={closeMobileMenu}>
              <span className="nav-icon">🛡️</span>Intel
            </Link>
            <Link to="/wallet" onClick={closeMobileMenu}>
              <span className="nav-icon">💵</span>Wallet
            </Link>
            <Link to="/history" onClick={closeMobileMenu}>
              <span className="nav-icon">⚔️</span>History
            </Link>
            <button onClick={() => { logout(); closeMobileMenu(); }} className="logout-btn">
              <span className="logout-icon">🚪</span>Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" onClick={closeMobileMenu}>
              <span className="nav-icon">🎯</span>Login
            </Link>
            <Link to="/register" onClick={closeMobileMenu}>
              <span className="nav-icon">⭐</span>Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
};

// Command Center/Dashboard component  
const Dashboard = () => {
  return (
    <div className="dashboard command-center">
      <div className="command-center-header">
        <h2><span className="header-icon">🏛️</span>Command Center</h2>
        <p className="welcome-message">Welcome to the Battle Arena, Commander!</p>
      </div>
      
      <div className="dashboard-actions battle-grid">
        <Link to="/profile" className="dashboard-card intel-card">
          <div className="card-icon">🛡️</div>
          <h3>Intel Dashboard</h3>
          <p>Commander profile and combat statistics</p>
        </Link>
        
        <Link to="/history" className="dashboard-card archives-card">
          <div className="card-icon">⚔️</div>
          <h3>Battle Archives</h3>
          <p>Review combat history and performance metrics</p>
        </Link>
        
        <Link to="/wallet" className="dashboard-card arsenal-card">
          <div className="card-icon">⚙️</div>
          <h3>Arsenal Management</h3>
          <p>Deploy and extract combat resources</p>
        </Link>
        
        {/* Combat Deployment card */}
        <div className="dashboard-card combat-card">
          <div className="card-icon">🚀</div>
          <h3>Deploy to Combat</h3>
          <p>Enter the battle arena and claim victory!</p>
          <button className="deploy-btn">
            <span className="btn-icon">⚡</span>
            Deploy Now
          </button>
        </div>
      </div>
    </div>
  );
};

// Separate component to access context within Router
const AppContent = () => {
  const { isAuthenticated, user, logout } = useContext(AuthContext);
  
  return (
    <div className="app">
      <Navbar isAuthenticated={isAuthenticated} logout={logout} user={user} />
      
      <div className="container">
        <Routes>
          <Route path="/" element={
            isAuthenticated ? 
              <StakeOutBet /> : 
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

          <Route path="/wallet" element={
            <PrivateRoute><WalletComponent /></PrivateRoute>
          } />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      
      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} Stake Out Bet. All rights reserved.</p>
      </footer>
    </div>
  );
};

// Main app component
const App = () => {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
};

export default App;