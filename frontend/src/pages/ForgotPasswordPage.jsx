import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../utils/api';
import { Mail, CheckCircle } from 'lucide-react';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();

    // Reset messages
    setError('');
    setSuccess(false);

    // Basic validation
    if (!email) {
      setError('Email address is required.');
      return;
    }

    setLoading(true);

    try {
      const res = await apiClient.post('/api/forgot-password', { email });

      if (res.data.success) {
        setSuccess(true);
        setEmail(''); // Clear the form
      } else {
        setError(res.data.error || 'Failed to send reset email.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
        <h2 style={{ marginTop: '20px', color: '#4CAF50' }}>Check Your Email</h2>
        <p style={{ color: '#fff', marginTop: '15px', lineHeight: '1.6' }}>
          If an account exists with the email you provided, we've sent password reset instructions to your inbox.
        </p>
        <p style={{ color: '#888', marginTop: '10px', fontSize: '14px' }}>
          The link will expire in 1 hour.
        </p>

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
          Back to Login
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
        <Mail style={{ width: '48px', height: '48px', color: '#00D1FF', margin: '0 auto' }} />
        <h2 style={{ marginTop: '15px', color: '#fff' }}>Forgot Password?</h2>
        <p style={{ color: '#888', marginTop: '10px' }}>
          Enter your email address and we'll send you instructions to reset your password.
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
          <label htmlFor="email" style={{ display: 'block', color: '#fff', marginBottom: '8px', fontWeight: '500' }}>
            Email Address
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          {loading ? 'Sending...' : 'Send Reset Instructions'}
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

export default ForgotPasswordPage;
