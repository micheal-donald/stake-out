import React, { useState, useContext } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../AuthContext';

const LoginComponent = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  
  // Access the context - make sure the path matches your file structure
  const authContext = useContext(AuthContext);

  const { username, password } = formData;

  const onChange = e => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const onSubmit = async e => {
    e.preventDefault();

    // Reset messages
    setError('');
    setLoading(true);

    try {
      const result = await authContext.login(username, password);

      if (result.success) {
        navigate('/');
      } else {
        // Handle different error scenarios
        if (result.status === 403) {
          // Account locked
          setError(result.error || 'Your account has been temporarily locked due to multiple failed login attempts. Please try again later or reset your password.');
        } else if (result.status === 401 && result.attemptsRemaining !== undefined) {
          // Failed login with attempts remaining
          setError(`${result.error || 'Invalid credentials'}. ${result.attemptsRemaining} attempt${result.attemptsRemaining !== 1 ? 's' : ''} remaining before account lockout.`);
        } else {
          setError(result.error || 'Login failed. Please check your credentials.');
        }
      }
    } catch (err) {
      setError('Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <h2>Login to Your Account</h2>
      
      {error && <div className="alert alert-danger">{error}</div>}
      
      <form onSubmit={onSubmit}>
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            name="username"
            value={username}
            onChange={onChange}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={password}
            onChange={onChange}
            required
          />
        </div>
        
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>

        <Link
          to="/forgot-password"
          style={{
            display: 'block',
            marginTop: '15px',
            textAlign: 'center',
            color: '#00D1FF',
            textDecoration: 'none'
          }}
        >
          Forgot Password?
        </Link>

        <p className="mt-3">
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </form>
    </div>
  );
};

export default LoginComponent;