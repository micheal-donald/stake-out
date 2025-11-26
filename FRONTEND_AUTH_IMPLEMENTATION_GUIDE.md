# Frontend Authentication Implementation Guide

**Date:** November 21, 2025
**Status:** Backend Complete - Frontend Required
**Estimated Time:** 8-12 hours

---

## 🎯 Overview

The backend authentication system is 100% complete with all features working:
- ✅ Email verification with 24h expiry
- ✅ Password reset with 1h expiry
- ✅ Account lockout (5 failed attempts, 30min)
- ✅ Age verification (18+ requirement)
- ✅ Terms of Service acceptance

**What You Need to Build:** Frontend components to interact with these backend endpoints.

---

## 📋 Components to Create/Update

### Priority 1: Update Existing
1. **RegisterComponent** - Add DOB + terms checkbox
2. **LoginComponent** - Handle lockout messages

### Priority 2: New Components
3. **EmailVerificationBanner** - Show "verify email" prompt
4. **VerifyEmailPage** - Handle email verification
5. **ForgotPasswordPage** - Request password reset
6. **ResetPasswordPage** - Set new password

### Priority 3: Legal Pages
7. **TermsOfServicePage** - Display terms
8. **PrivacyPolicyPage** - Display privacy policy
9. **ResponsibleGamblingPage** - Display RG policy

---

## 🚀 Implementation Steps

### Step 1: Update Registration Form

**File:** `frontend/src/components/RegisterComponent.jsx` (or similar)

**Add these fields:**

```jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';

function RegisterComponent() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',  // NEW
    acceptedTerms: false  // NEW
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Calculate age from date of birth
  const calculateAge = (dob) => {
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate age (18+)
    const age = calculateAge(formData.dateOfBirth);
    if (age < 18) {
      setError('You must be at least 18 years old to register');
      return;
    }

    // Validate terms accepted
    if (!formData.acceptedTerms) {
      setError('You must accept the Terms of Service');
      return;
    }

    setLoading(true);

    try {
      // Get CSRF token
      const csrfResponse = await fetch('http://localhost:4000/api/auth/csrf-token', {
        credentials: 'include'
      });
      const { csrfToken } = await csrfResponse.json();

      // Register user
      const response = await fetch('http://localhost:4000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          dateOfBirth: formData.dateOfBirth,
          acceptedTerms: formData.acceptedTerms
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Success! Show email verification message
        alert('Registration successful! Please check your email to verify your account.');
        // Optionally redirect to login
        // navigate('/login');
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <h2>Create Account</h2>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({...formData, username: e.target.value})}
            required
            minLength={3}
            maxLength={50}
          />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            required
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({...formData, password: e.target.value})}
            required
            minLength={8}
          />
          <small>Must be at least 8 characters with uppercase, lowercase, and number</small>
        </div>

        <div className="form-group">
          <label>Confirm Password</label>
          <input
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
            required
          />
        </div>

        {/* NEW: Date of Birth */}
        <div className="form-group">
          <label>Date of Birth</label>
          <input
            type="date"
            value={formData.dateOfBirth}
            onChange={(e) => setFormData({...formData, dateOfBirth: e.target.value})}
            required
            max={new Date().toISOString().split('T')[0]}
          />
          <small>You must be 18+ to register</small>
        </div>

        {/* NEW: Terms of Service */}
        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={formData.acceptedTerms}
              onChange={(e) => setFormData({...formData, acceptedTerms: e.target.checked})}
              required
            />
            I accept the <Link to="/terms" target="_blank">Terms of Service</Link> and <Link to="/privacy" target="_blank">Privacy Policy</Link>
          </label>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>

      <p>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}

export default RegisterComponent;
```

---

### Step 2: Email Verification Banner

**File:** `frontend/src/components/EmailVerificationBanner.jsx` (NEW)

```jsx
import React, { useState } from 'react';
import './EmailVerificationBanner.css';

function EmailVerificationBanner({ user }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Only show if email not verified
  if (user.email_verified) {
    return null;
  }

  const handleResendEmail = async () => {
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('http://localhost:4000/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: user.email })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('Verification email sent! Check your inbox.');
      } else {
        setMessage(data.error || 'Failed to send email');
      }
    } catch (err) {
      setMessage('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="email-verification-banner">
      <div className="banner-content">
        <span className="icon">⚠️</span>
        <div className="banner-text">
          <strong>Email not verified</strong>
          <p>Please check your email ({user.email}) and click the verification link.</p>
        </div>
        <button
          onClick={handleResendEmail}
          disabled={loading}
          className="resend-button"
        >
          {loading ? 'Sending...' : 'Resend Email'}
        </button>
      </div>
      {message && <div className="banner-message">{message}</div>}
    </div>
  );
}

export default EmailVerificationBanner;
```

**CSS:** `frontend/src/components/EmailVerificationBanner.css`

```css
.email-verification-banner {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon {
  font-size: 24px;
}

.banner-text {
  flex: 1;
}

.banner-text strong {
  display: block;
  margin-bottom: 4px;
}

.banner-text p {
  margin: 0;
  font-size: 14px;
  color: #666;
}

.resend-button {
  background: #0099CC;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.resend-button:hover {
  background: #007799;
}

.resend-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.banner-message {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ffc107;
  font-size: 14px;
}
```

---

### Step 3: Email Verification Page

**File:** `frontend/src/pages/VerifyEmailPage.jsx` (NEW)

```jsx
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link');
      return;
    }

    verifyEmail(token);
  }, [searchParams]);

  const verifyEmail = async (token) => {
    try {
      const response = await fetch(`http://localhost:4000/api/auth/verify-email?token=${token}`, {
        method: 'GET',
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage('Email verified successfully!');
        // Redirect to login after 3 seconds
        setTimeout(() => navigate('/login'), 3000);
      } else {
        setStatus('error');
        setMessage(data.error || 'Verification failed');
      }
    } catch (err) {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  return (
    <div className="verify-email-page">
      <div className="verify-container">
        {status === 'verifying' && (
          <>
            <div className="spinner"></div>
            <h2>Verifying your email...</h2>
            <p>Please wait</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="success-icon">✅</div>
            <h2>Email Verified!</h2>
            <p>{message}</p>
            <p>Redirecting to login...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="error-icon">❌</div>
            <h2>Verification Failed</h2>
            <p>{message}</p>
            <button onClick={() => navigate('/login')}>Go to Login</button>
          </>
        )}
      </div>
    </div>
  );
}

export default VerifyEmailPage;
```

---

### Step 4: Forgot Password Page

**File:** `frontend/src/pages/ForgotPasswordPage.jsx` (NEW)

```jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:4000/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        setSubmitted(true);
      } else {
        setError(data.error || 'Failed to send reset email');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="forgot-password-page">
        <div className="success-message">
          <h2>Check Your Email</h2>
          <p>If an account exists with {email}, you will receive a password reset link.</p>
          <p>The link will expire in 1 hour.</p>
          <Link to="/login">Back to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="forgot-password-page">
      <div className="form-container">
        <h2>Reset Password</h2>
        <p>Enter your email address and we'll send you a reset link.</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your-email@example.com"
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <p className="back-link">
          <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
```

---

### Step 5: Reset Password Page

**File:** `frontend/src/pages/ResetPasswordPage.jsx` (NEW)

```jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      const response = await fetch(`http://localhost:4000/api/auth/validate-reset-token/${token}`);
      const data = await response.json();

      setTokenValid(data.valid);
      if (!data.valid) {
        setError(data.error || 'Invalid or expired reset link');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.newPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('http://localhost:4000/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          token,
          newPassword: formData.newPassword
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => navigate('/login'), 3000);
      } else {
        setError(data.error || 'Failed to reset password');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return <div>Validating reset link...</div>;
  }

  if (!tokenValid) {
    return (
      <div className="reset-password-page">
        <div className="error-container">
          <h2>Invalid Reset Link</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/forgot-password')}>
            Request New Link
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="reset-password-page">
        <div className="success-container">
          <h2>Password Reset Successful!</h2>
          <p>Your password has been changed.</p>
          <p>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reset-password-page">
      <div className="form-container">
        <h2>Create New Password</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={formData.newPassword}
              onChange={(e) => setFormData({...formData, newPassword: e.target.value})}
              required
              minLength={8}
            />
            <small>At least 8 characters</small>
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
              required
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
```

---

### Step 6: Update Login Component

**File:** `frontend/src/components/LoginComponent.jsx`

**Add lockout handling:**

```jsx
// In your existing login function, handle account lockout:

const handleLogin = async (e) => {
  e.preventDefault();
  setError('');

  try {
    const response = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      // Success - save user data
      // Check if email verified
      if (!data.user.email_verified) {
        alert('Please verify your email before logging in');
      }
      // Proceed with login...
    } else if (response.status === 403) {
      // Account locked
      setError(data.error);  // "Account is locked. Try again in X minutes"
      setShowForgotPassword(true);  // Show forgot password link
    } else if (response.status === 401) {
      // Invalid credentials
      if (data.attemptsRemaining !== undefined) {
        setError(`${data.error}. ${data.attemptsRemaining} attempts remaining.`);
      } else {
        setError(data.error);
      }
    } else {
      setError(data.error || 'Login failed');
    }
  } catch (err) {
    setError('Network error');
  }
};

// In your JSX, add:
{showForgotPassword && (
  <Link to="/forgot-password">Forgot password?</Link>
)}
```

---

### Step 7: Legal Pages

Create three simple pages to display the markdown content:

**File:** `frontend/src/pages/TermsOfServicePage.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

function TermsOfServicePage() {
  const [content, setContent] = useState('');

  useEffect(() => {
    // Fetch terms content (you can also import it directly)
    fetch('/docs/legal/TERMS_OF_SERVICE.md')
      .then(res => res.text())
      .then(text => setContent(text));
  }, []);

  return (
    <div className="legal-page">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

export default TermsOfServicePage;
```

**Same pattern for Privacy Policy and Responsible Gambling pages.**

---

## 🛣️ Routes to Add

In your `App.js` or routing file:

```jsx
import VerifyEmailPage from './pages/VerifyEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import ResponsibleGamblingPage from './pages/ResponsibleGamblingPage';

// Add these routes:
<Route path="/verify-email" element={<VerifyEmailPage />} />
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/reset-password/:token" element={<ResetPasswordPage />} />
<Route path="/terms" element={<TermsOfServicePage />} />
<Route path="/privacy" element={<PrivacyPolicyPage />} />
<Route path="/responsible-gambling" element={<ResponsibleGamblingPage />} />
```

---

## 🎨 Styling Tips

All components should have consistent styling. Here's a base CSS template:

```css
.form-container {
  max-width: 400px;
  margin: 50px auto;
  padding: 30px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-group small {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  color: #666;
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 16px;
}

.success-message {
  background: #d4edda;
  color: #155724;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 16px;
}

button {
  width: 100%;
  padding: 12px;
  background: #00D1FF;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}

button:hover {
  background: #00B8E6;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-group input[type="checkbox"] {
  width: auto;
}
```

---

## ✅ Testing Checklist

After implementing all components:

- [ ] Registration with DOB and terms works
- [ ] Email verification banner shows for unverified users
- [ ] Resend verification email works
- [ ] Email verification link works
- [ ] Forgot password sends email
- [ ] Reset password link works
- [ ] Account lockout message shows after 5 failed logins
- [ ] "Forgot password" link shown when locked out
- [ ] Terms/Privacy/Responsible Gambling pages load
- [ ] All forms have proper validation
- [ ] Error messages display correctly
- [ ] Success messages display correctly

---

## 🚀 Quick Start

1. Copy each component code above
2. Create the files in your frontend project
3. Add routes to your router
4. Style with the CSS provided
5. Test each flow end-to-end
6. Adjust styling to match your design

---

## 📚 API Reference

All endpoints are documented in `AUTH_FEATURES_IMPLEMENTATION.md`. Key endpoints:

- `POST /api/auth/register` - Register new user
- `GET /api/auth/verify-email?token=xxx` - Verify email
- `POST /api/auth/resend-verification` - Resend verification
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `GET /api/auth/validate-reset-token/:token` - Check token validity
- `POST /api/auth/login` - Login (handles lockout)

---

**Ready to implement? Start with RegisterComponent and work through the list!**

**Document Version:** 1.0
**Last Updated:** November 21, 2025
