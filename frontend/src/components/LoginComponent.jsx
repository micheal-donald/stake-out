import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, AlertCircle, Rocket } from 'lucide-react';
import { AuthContext } from '../AuthContext';
import './LoginComponent.css';

/**
 * Modernized Login Component
 * High-energy, gamer-centric UI with personality
 */
const LoginComponent = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const authContext = useContext(AuthContext);

  const { username, password } = formData;

  const onChange = e => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const onSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await authContext.login(username, password);

      if (result.success) {
        navigate('/');
      } else {
        if (result.status === 403) {
          setError(result.error || 'Account locked due to multiple failed attempts. Try again later.');
        } else if (result.status === 401 && result.attemptsRemaining !== undefined) {
          setError(`${result.error || 'Invalid credentials'}. ${result.attemptsRemaining} attempt${result.attemptsRemaining !== 1 ? 's' : ''} left.`);
        } else {
          setError(result.error || 'Login failed. Check your coordinates.');
        }
      }
    } catch (err) {
      setError('System failure. Please check your uplink.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      {/* Dynamic Background Elements */}
      <div className="auth-bg-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
      </div>

      <div className="login-card">
        <div className="login-header">
          <h2>THE ARENA AWAITS</h2>
          <p>Sign in and prepare for deployment</p>
        </div>

        {error && (
          <div className="login-alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form className="login-form" onSubmit={onSubmit}>
          <div className="form-group">
            <div className="input-wrapper">
              <User className="input-icon" size={20} />
              <input
                type="text"
                name="username"
                placeholder="USERNAME"
                value={username}
                onChange={onChange}
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div className="form-group">
            <div className="input-wrapper">
              <Lock className="input-icon" size={20} />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="PASSWORD"
                value={password}
                onChange={onChange}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-submit-btn"
            disabled={loading}
          >
            {loading ? (
              'INITIATING...'
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Rocket size={18} />
                ENTER THE ARENA
              </span>
            )}
          </button>
        </form>

        <div className="login-footer">
          <Link to="/forgot-password" size="sm" className="forgot-password-link">
            TRANSMLISSION LOST? (FORGOT PASSWORD)
          </Link>
          <p className="register-link">
            NEW PILOT? <Link to="/register">JOIN THE SQUADRON</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginComponent;