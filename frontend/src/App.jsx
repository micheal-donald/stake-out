import React, { useContext, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';

// Import components
import RegisterComponent from './components/RegisterComponent';
import LoginComponent from './components/LoginComponent';
import ProfileComponent from './components/ProfileComponent';
import BetHistoryComponent from './components/BetHistoryComponent';
import WalletComponent from './components/WalletComponent';
import StakeOutBet from './StakeOutBet';
import EmailVerificationBanner from './components/EmailVerificationBanner';

// Import pages
import VerifyEmailPage from './pages/VerifyEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import ResponsibleGamblingPage from './pages/ResponsibleGamblingPage';

// Import auth context and provider
import { AuthContext, AuthProvider } from './AuthContext';

// Import API utilities
import { initializeCsrf } from './utils/api';

// Import CSS
import './style/ProfileComponent.css';

// Authentication guard component
const PrivateRoute = ({ children }) => {
  const { isAuthenticated } = useContext(AuthContext);

  if (!isAuthenticated) {
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
          Battle Arena
          <span className="brand-subtitle"></span>
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

      {/* Show email verification banner for authenticated users with unverified emails */}
      {isAuthenticated && <EmailVerificationBanner />}

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

          <Route path="/register" element={<RegisterComponent />} />

          {/* Auth pages */}
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

          {/* Legal pages */}
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/responsible-gambling" element={<ResponsibleGamblingPage />} />

          {/* Protected routes */}
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
        <p>&copy; {new Date().getFullYear()} Akiba Software Holdings. All rights reserved.</p>
        <div style={{ marginTop: '10px', fontSize: '12px' }}>
          <Link to="/terms" style={{ color: '#00D1FF', marginRight: '15px', textDecoration: 'none' }}>Terms of Service</Link>
          <Link to="/privacy" style={{ color: '#00D1FF', marginRight: '15px', textDecoration: 'none' }}>Privacy Policy</Link>
          <Link to="/responsible-gambling" style={{ color: '#00D1FF', textDecoration: 'none' }}>Responsible Gambling</Link>
        </div>
      </footer>
    </div>
  );
};

// Main app component
const App = () => {
  useEffect(() => {
    // Initialize CSRF token when app loads
    initializeCsrf().catch(error => {
      console.error('Failed to initialize CSRF protection:', error);
    });
  }, []);

  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
};

export default App;