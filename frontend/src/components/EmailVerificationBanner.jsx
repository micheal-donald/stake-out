import React, { useState, useContext } from 'react';
import { AuthContext } from '../AuthContext';
import apiClient from '../utils/api';
import { AlertCircle, X } from 'lucide-react';

const EmailVerificationBanner = () => {
  const { user } = useContext(AuthContext);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Don't show if user is verified, not logged in, or banner is dismissed
  if (!user || user.email_verified || dismissed) {
    return null;
  }

  const resendVerificationEmail = async () => {
    setLoading(true);
    setMessage('');

    try {
      const res = await apiClient.post('/api/resend-verification', {
        email: user.email
      });

      if (res.data.success) {
        setMessage('Verification email sent! Please check your inbox.');
        setTimeout(() => setMessage(''), 5000);
      } else {
        setMessage(res.data.error || 'Failed to send verification email.');
      }
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to send verification email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'relative',
      backgroundColor: '#FF6B35',
      color: '#fff',
      padding: '15px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '15px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
        <AlertCircle style={{ width: '24px', height: '24px', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: '500' }}>
            Please verify your email address to unlock all features.
          </p>
          {message && (
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.9 }}>
              {message}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={resendVerificationEmail}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#fff',
            color: '#FF6B35',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            fontSize: '14px'
          }}
        >
          {loading ? 'Sending...' : 'Resend Email'}
        </button>

        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          aria-label="Dismiss banner"
        >
          <X style={{ width: '20px', height: '20px' }} />
        </button>
      </div>
    </div>
  );
};

export default EmailVerificationBanner;
