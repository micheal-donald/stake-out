import React, { useState } from 'react';
import apiClient from '../utils/api';
import { useNavigate, Link } from 'react-router-dom';

const RegisterComponent = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',
    acceptedTerms: false
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  const { username, email, password, confirmPassword, dateOfBirth, acceptedTerms } = formData;

  const onChange = e => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  // Calculate age from date of birth
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
    
    // Reset messages
    setError('');
    setSuccess('');
    
    // Validate
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    // Validate date of birth
    if (!dateOfBirth) {
      setError('Date of birth is required');
      return;
    }

    // Validate age (18+)
    const age = calculateAge(dateOfBirth);
    if (age < 18) {
      setError('You must be at least 18 years old to register');
      return;
    }

    // Validate terms acceptance
    if (!acceptedTerms) {
      setError('You must accept the Terms of Service to register');
      return;
    }
    
    setLoading(true);
    
    try {
      const res = await apiClient.post('/api/register', {
        username,
        email,
        password,
        dateOfBirth,
        acceptedTerms
      });

      setSuccess('Registration successful! Please check your email to verify your account.');
      setFormData({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        dateOfBirth: '',
        acceptedTerms: false
      });
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);
      
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <h2>Create an Account</h2>
      
      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      
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
          <label htmlFor="email">Email Address</label>
          <input
            type="email"
            id="email"
            name="email"
            value={email}
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
            minLength="8"
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={confirmPassword}
            onChange={onChange}
            minLength="8"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="dateOfBirth">Date of Birth</label>
          <input
            type="date"
            id="dateOfBirth"
            name="dateOfBirth"
            value={dateOfBirth}
            onChange={onChange}
            max={new Date().toISOString().split('T')[0]}
            required
          />
          <small style={{display: 'block', marginTop: '5px', color: '#888'}}>
            You must be 18 or older to register
          </small>
        </div>

        <div className="form-group" style={{marginTop: '20px'}}>
          <label style={{display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer'}}>
            <input
              type="checkbox"
              name="acceptedTerms"
              checked={acceptedTerms}
              onChange={onChange}
              required
              style={{marginTop: '3px', width: 'auto', cursor: 'pointer'}}
            />
            <span>
              I accept the <Link to="/terms" target="_blank" style={{color: '#00D1FF'}}>Terms of Service</Link> and <Link to="/privacy" target="_blank" style={{color: '#00D1FF'}}>Privacy Policy</Link>
            </span>
          </label>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Registering...' : 'Register'}
        </button>
        
        <p className="mt-3">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
};

export default RegisterComponent;