import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import apiClient from '../utils/api';
import { Lock, CheckCircle, XCircle, Loader } from 'lucide-react';

const ResetPasswordPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  const { password, confirmPassword } = formData;

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link. No token provided.');
      setValidatingToken(false);
      return;
    }

    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      const res = await apiClient.get(`/api/validate-reset-token/${token}`);

      if (res.data.valid) {
        setTokenValid(true);
      } else {
        setTokenValid(false);
        setError('This password reset link is invalid or has expired.');
      }
    } catch (err) {
      setTokenValid(false);
      setError(err.response?.data?.error || 'This password reset link is invalid or has expired.');
    } finally {
      setValidatingToken(false);
    }
  };

  const onChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    // Reset messages
    setError('');

    // Validate
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await apiClient.post('/api/reset-password', {
        token,
        newPassword: password
      });

      if (res.data.success) {
        setSuccess(true);

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setError(res.data.error || 'Failed to reset password.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (validatingToken) {
    return (
      <div style={{
        maxWidth: '500px',
        margin: '50px auto',
        padding: '30px',
        backgroundColor: '#1a1a2e',
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <Loader style={{ width: '48px', height: '48px', color: '#00D1FF', margin: '0 auto', animation: 'spin 1s linear infinite' }} />
        <h2 style={{ marginTop: '20px', color: '#fff' }}>Validating Reset Link...</h2>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div style={{
        maxWidth: '500px',
        margin: '50px auto',
        padding: '30px',
        backgroundColor: '#1a1a2e',
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <XCircle style={{ width: '64px', height: '64px', color: '#FF2D75', margin: '0 auto' }} />
        <h2 style={{ marginTop: '20px', color: '#FF2D75' }}>Invalid Reset Link</h2>
        <p style={{ color: '#fff', marginTop: '10px' }}>{error}</p>

        <Link
          to="/forgot-password"
          style={{
            display: 'inline-block',
            marginTop: '30px',
            padding: '12px 24px',
            backgroundColor: '#00D1FF',
            color: '#000',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: 'bold'
          }}
        >
          Request New Reset Link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{
        maxWidth: '500px',
        margin: '50px auto',
        padding: '30px',
        backgroundColor: '#1a1a2e',
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <CheckCircle style={{ width: '64px', height: '64px', color: '#4CAF50', margin: '0 auto' }} />
        <h2 style={{ marginTop: '20px', color: '#4CAF50' }}>Password Reset Successful!</h2>
        <p style={{ color: '#fff', marginTop: '15px' }}>
          Your password has been reset successfully. You can now log in with your new password.
        </p>
        <p style={{ color: '#888', marginTop: '10px' }}>Redirecting to login in 3 seconds...</p>

        <Link
          to="/login"
          style={{
            display: 'inline-block',
            marginTop: '30px',
            padding: '12px 24px',
            backgroundColor: '#00D1FF',
            color: '#000',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: 'bold'
          }}
        >
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '500px',
      margin: '50px auto',
      padding: '30px',
      backgroundColor: '#1a1a2e',
      borderRadius: '8px'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <Lock style={{ width: '48px', height: '48px', color: '#00D1FF', margin: '0 auto' }} />
        <h2 style={{ marginTop: '15px', color: '#fff' }}>Reset Your Password</h2>
        <p style={{ color: '#888', marginTop: '10px' }}>
          Enter your new password below.
        </p>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#FF2D75',
          color: '#fff',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="password" style={{ display: 'block', color: '#fff', marginBottom: '8px', fontWeight: '500' }}>
            New Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={password}
            onChange={onChange}
            minLength="8"
            required
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#0f0f1e',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '16px'
            }}
          />
          <small style={{ display: 'block', marginTop: '5px', color: '#888' }}>
            Must be at least 8 characters
          </small>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="confirmPassword" style={{ display: 'block', color: '#fff', marginBottom: '8px', fontWeight: '500' }}>
            Confirm New Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={confirmPassword}
            onChange={onChange}
            minLength="8"
            required
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#0f0f1e',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '16px'
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: '#00D1FF',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <Link to="/login" style={{ color: '#00D1FF', textDecoration: 'none' }}>
            Back to Login
          </Link>
        </div>
      </form>
    </div>
  );
};

export default ResetPasswordPage;
