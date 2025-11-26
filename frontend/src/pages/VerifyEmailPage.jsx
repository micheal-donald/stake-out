import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import apiClient from '../utils/api';
import { CheckCircle, XCircle, Loader } from 'lucide-react';

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying'); // 'verifying', 'success', 'error'
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link. No token provided.');
      return;
    }

    verifyEmail();
  }, [token]);

  const verifyEmail = async () => {
    try {
      const res = await apiClient.get(`/api/verify-email?token=${token}`);

      if (res.data.success) {
        setStatus('success');
        setMessage(res.data.message || 'Your email has been successfully verified!');

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setStatus('error');
        setMessage(res.data.error || 'Verification failed.');
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.response?.data?.error || 'Email verification failed. The link may be invalid or expired.');
    }
  };

  const resendVerificationEmail = async () => {
    setLoading(true);
    try {
      const email = prompt('Please enter your email address:');
      if (!email) {
        setLoading(false);
        return;
      }

      const res = await apiClient.post('/api/resend-verification', { email });

      if (res.data.success) {
        alert('Verification email sent! Please check your inbox.');
      } else {
        alert(res.data.error || 'Failed to send verification email.');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send verification email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: '500px',
      margin: '50px auto',
      padding: '30px',
      backgroundColor: '#1a1a2e',
      borderRadius: '8px',
      textAlign: 'center'
    }}>
      {status === 'verifying' && (
        <>
          <Loader style={{ width: '48px', height: '48px', color: '#00D1FF', margin: '0 auto', animation: 'spin 1s linear infinite' }} />
          <h2 style={{ marginTop: '20px', color: '#fff' }}>Verifying Your Email...</h2>
          <p style={{ color: '#888', marginTop: '10px' }}>Please wait while we verify your email address.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <CheckCircle style={{ width: '64px', height: '64px', color: '#4CAF50', margin: '0 auto' }} />
          <h2 style={{ marginTop: '20px', color: '#4CAF50' }}>Email Verified!</h2>
          <p style={{ color: '#fff', marginTop: '10px' }}>{message}</p>
          <p style={{ color: '#888', marginTop: '15px' }}>Redirecting to login in 3 seconds...</p>
          <Link to="/login" style={{ display: 'block', marginTop: '20px', color: '#00D1FF', textDecoration: 'none' }}>
            Click here if not redirected
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <XCircle style={{ width: '64px', height: '64px', color: '#FF2D75', margin: '0 auto' }} />
          <h2 style={{ marginTop: '20px', color: '#FF2D75' }}>Verification Failed</h2>
          <p style={{ color: '#fff', marginTop: '10px' }}>{message}</p>

          <div style={{ marginTop: '30px' }}>
            <button
              onClick={resendVerificationEmail}
              disabled={loading}
              style={{
                padding: '12px 24px',
                backgroundColor: '#00D1FF',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Sending...' : 'Resend Verification Email'}
            </button>
          </div>

          <Link to="/login" style={{ display: 'block', marginTop: '20px', color: '#00D1FF', textDecoration: 'none' }}>
            Back to Login
          </Link>
        </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default VerifyEmailPage;
