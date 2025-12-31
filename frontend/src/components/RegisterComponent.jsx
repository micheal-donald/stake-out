import React, { useState } from 'react';
import apiClient from '../utils/api';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Lock, Eye, EyeOff, Calendar, AlertCircle, CheckCircle, ShieldCheck } from 'lucide-react';
import './RegisterComponent.css';

/**
 * Modernized Register Component
 * High-energy, gamer-centric UI with personality
 */
const RegisterComponent = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',
    acceptedTerms: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const { username, email, password, confirmPassword, dateOfBirth, acceptedTerms } = formData;

  const onChange = e => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const calculateAge = (dob) => {
    if (!dob) return 0;
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const onSubmit = async e => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!dateOfBirth) {
      setError('Date of birth is required');
      return;
    }

    const age = calculateAge(dateOfBirth);
    if (age < 18) {
      setError('You must be at least 18 years old to join');
      return;
    }

    if (!acceptedTerms) {
      setError('You must accept the Terms of Service to join');
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/api/register', {
        username,
        email,
        password,
        dateOfBirth,
        acceptedTerms
      });

      setSuccess('Enlistment successful! Check your uplink (email) for verification.');
      setFormData({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        dateOfBirth: '',
        acceptedTerms: false
      });

      setTimeout(() => {
        navigate('/login');
      }, 3000);

    } catch (err) {
      setError(err.response?.data?.error || 'Enlistment failed. Check your coordinates.');
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

      <div className="register-card">
        <div className="register-header">
          <h2>JOIN THE SQUADRON</h2>
          <p>Create your commander profile today</p>
        </div>

        {error && (
          <div className="register-alert alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="register-alert alert-success">
            <CheckCircle size={18} />
            <span>{success}</span>
          </div>
        )}

        <form className="register-form" onSubmit={onSubmit}>
          <div className="form-group">
            <label className="input-label">USERNAME</label>
            <div className="input-wrapper">
              <User className="input-icon" size={18} />
              <input
                type="text"
                name="username"
                placeholder="Unique identifier"
                value={username}
                onChange={onChange}
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="input-label">EMAIL ADDRESS</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={18} />
              <input
                type="email"
                name="email"
                placeholder="Uplink address"
                value={email}
                onChange={onChange}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="input-label">PASSWORD</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={18} />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Min 8 characters"
                value={password}
                onChange={onChange}
                required
                autoComplete="new-password"
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

          <div className="form-group">
            <label className="input-label">CONFIRM PASSWORD</label>
            <div className="input-wrapper">
              <ShieldCheck className="input-icon" size={18} />
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={onChange}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex="-1"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="input-label">DATE OF BIRTH</label>
            <div className="input-wrapper">
              <Calendar className="input-icon" size={18} />
              <input
                type="date"
                name="dateOfBirth"
                value={dateOfBirth}
                onChange={onChange}
                max={new Date().toISOString().split('T')[0]}
                required
              />
            </div>
          </div>

          <div className="terms-wrapper">
            <label className="terms-checkbox-label">
              <input
                type="checkbox"
                name="acceptedTerms"
                checked={acceptedTerms}
                onChange={onChange}
                required
              />
              <span>
                I accept the <Link to="/terms" target="_blank">Terms of Service</Link> and <Link to="/privacy" target="_blank">Privacy Policy</Link>
              </span>
            </label>
          </div>

          <button
            type="submit"
            className="register-submit-btn"
            disabled={loading}
          >
            {loading ? 'INITIATING ENLISTMENT...' : 'ENLIST NOW'}
          </button>
        </form>

        <div className="register-footer">
          <p>
            ALREADY DEPLOYED? <Link to="/login">LOG IN TO STATION</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterComponent;