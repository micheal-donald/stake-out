import React, { useState, useEffect, useContext } from 'react';
import apiClient from '../utils/api';
import { Link, useNavigate } from 'react-router-dom';
import { User, Settings, Key, DollarSign, History, ChevronRight, Edit, Save, X } from 'lucide-react';
import { AuthContext } from '../AuthContext';

const ProfileComponent = () => {
  const { isAuthenticated, updateUserBalance } = useContext(AuthContext);
  const navigate = useNavigate();

  const [profile, setProfile] = useState({ user: {}, settings: {}, betSummary: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  const [formData, setFormData] = useState({ email: '', auto_cashout_multiplier: 0, auto_cashout_amount: 0 });
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [depositAmount, setDepositAmount] = useState('');

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  const fetchProfile = async () => {
    try {
      if (!isAuthenticated) return;

      const res = await apiClient.get('/api/profile');

      // Ensure all required fields exist with defaults
      const profileData = {
        user: res.data.user || {},
        settings: res.data.settings || { auto_cashout_multiplier: 0, auto_cashout_amount: 0 },
        betSummary: res.data.betSummary || { total_bets: 0, total_winnings: 0 }
      };

      setProfile(profileData);
      setFormData({
        email: profileData.user.email || '',
        auto_cashout_multiplier: profileData.settings.auto_cashout_multiplier || 0,
        auto_cashout_amount: profileData.settings.auto_cashout_amount || 0
      });
      setLoading(false);
    } catch (err) {
      setError('Failed to load profile. Please try again.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

  const onPasswordChange = e => setPasswordData({ ...passwordData, [e.target.name]: e.target.value });

  const saveProfile = async () => {
    setError('');
    setSuccess('');
    try {
      await apiClient.put('/api/profile', { email: formData.email });
      await apiClient.put('/api/settings', {
        auto_cashout_multiplier: formData.auto_cashout_multiplier,
        auto_cashout_amount: formData.auto_cashout_amount
      });

      setSuccess('Profile updated successfully');
      setEditMode(false);
      fetchProfile();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    }
  };

  const changePassword = async e => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    try {
      await apiClient.put('/api/change-password', passwordData);
      setSuccess('Password changed successfully');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordChange(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    }
  };

  const handleDeposit = async () => {
    setError('');
    setSuccess('');
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid deposit amount');
      return;
    }
    try {
      const res = await apiClient.post('/api/deposit', { amount });
      setSuccess(`Deposit of ${amount.toFixed(2)} successful`);
      setDepositAmount('');
      const newBalance = res.data.user.balance;
      setProfile(prev => ({ ...prev, user: { ...prev.user, balance: newBalance } }));
      updateUserBalance(newBalance);
    } catch (err) {
      setError(err.response?.data?.error || 'Deposit failed');
    }
  };

  if (loading) return <div className="loading-container">Loading profile...</div>;

  const { username, email, balance, created_at } = profile.user || {};
  const { total_bets = 0, total_winnings = 0 } = profile.betSummary || {};
  const { auto_cashout_multiplier = 0, auto_cashout_amount = 0 } = profile.settings || {};

  return (
    <div className="profile-container">
      {/* Alert messages */}
      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Profile header */}
      <div className="profile-card">
        <div className="profile-header">
          <div className="profile-title">
            <User className="profile-icon" size={28} />
            <h2>Your Profile</h2>
          </div>
          <div className="balance">
            <DollarSign size={20} />
            ${parseFloat(balance).toFixed(2)}
          </div>
        </div>

        {/* Profile stats */}
        <div className="profile-stats">
          <div className="stat">
            <label>Total Bets</label>
            <span>{total_bets}</span>
          </div>
          <div className="stat">
            <label>Total Winnings</label>
            <span>${parseFloat(total_winnings || 0).toFixed(2)}</span>
          </div>
          <div className="stat">
            <label>Member Since</label>
            <span>{new Date(created_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Profile details */}
        <div className="profile-details">
          <h3>Account Information</h3>
          {!editMode ? (
            <div className="details-view">
              <div className="detail-row">
                <label>Username</label>
                <span>{username}</span>
              </div>
              <div className="detail-row">
                <label>Email</label>
                <span>{email}</span>
              </div>
              <div className="detail-row">
                <label>Auto-Cashout Multiplier</label>
                <span>{auto_cashout_multiplier > 0 ? `${auto_cashout_multiplier}x` : 'Disabled'}</span>
              </div>
              <div className="detail-row">
                <label>Auto-Cashout Amount</label>
                <span>{auto_cashout_amount > 0 ? `$${auto_cashout_amount}` : 'Disabled'}</span>
              </div>
              <button className="edit-btn" onClick={() => setEditMode(true)}>
                <Edit size={16} /> Edit Profile
              </button>
            </div>
          ) : (
            <div className="edit-form">
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input type="text" id="username" value={username} disabled />
                <small>Username cannot be changed</small>
              </div>
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={onChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="auto_cashout_multiplier">Auto-Cashout Multiplier</label>
                <input
                  type="number"
                  id="auto_cashout_multiplier"
                  name="auto_cashout_multiplier"
                  value={formData.auto_cashout_multiplier}
                  onChange={onChange}
                  min="0"
                  step="0.1"
                />
                <small>Set to 0 to disable. Cannot be used with Auto-Cashout Amount.</small>
              </div>
              <div className="form-group">
                <label htmlFor="auto_cashout_amount">Auto-Cashout Amount</label>
                <input
                  type="number"
                  id="auto_cashout_amount"
                  name="auto_cashout_amount"
                  value={formData.auto_cashout_amount}
                  onChange={onChange}
                  min="0"
                  step="1"
                />
                <small>Set to 0 to disable. Cannot be used with Auto-Cashout Multiplier.</small>
              </div>
              <div className="form-actions">
                <button className="save-btn" onClick={saveProfile}>
                  <Save size={16} /> Save Changes
                </button>
                <button className="cancel-btn" onClick={() => setEditMode(false)}>
                  <X size={16} /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Password Change Section */}
        <div className="profile-section">
          <div className="section-header" onClick={() => setShowPasswordChange(!showPasswordChange)}>
            <div className="section-title">
              <Key size={20} />
              <h3>Change Password</h3>
            </div>
            <ChevronRight size={20} className={showPasswordChange ? "rotate" : ""} />
          </div>
          
          {showPasswordChange && (
            <div className="password-change-form">
              <form onSubmit={changePassword}>
                <div className="form-group">
                  <label htmlFor="currentPassword">Current Password</label>
                  <input
                    type="password"
                    id="currentPassword"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={onPasswordChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="newPassword">New Password</label>
                  <input
                    type="password"
                    id="newPassword"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={onPasswordChange}
                    minLength="6"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm New Password</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={onPasswordChange}
                    minLength="6"
                    required
                  />
                </div>
                <button type="submit" className="password-btn">Change Password</button>
              </form>
            </div>
          )}
        </div>

        {/* Wallet Section */}
        <div className="profile-section">
          <div className="section-header">
            <div className="section-title">
              <DollarSign size={20} />
              <h3>Wallet</h3>
            </div>
            <Link to="/wallet" className="section-link">
              Manage Wallet <ChevronRight size={16} />
            </Link>
          </div>
          <div className="wallet-preview">
            <div className="wallet-balance">
              <span>Current Balance:</span>
              <strong>${parseFloat(balance).toFixed(2)}</strong>
            </div>
            <div className="wallet-actions">
              <Link to="/wallet" className="wallet-btn">Deposit</Link>
              <Link to="/wallet" className="wallet-btn secondary">Withdraw</Link>
            </div>
          </div>
        </div>

        {/* Betting History */}
        <div className="profile-section">
          <div className="section-header">
            <div className="section-title">
              <History size={20} />
              <h3>Betting History</h3>
            </div>
            <Link to="/history" className="section-link">
              View All <ChevronRight size={16} />
            </Link>
          </div>
          <div className="history-preview">
            <p>View your complete betting history and statistics.</p>
          </div>
        </div>

        {/* Additional Actions */}
        <div className="profile-actions">
          <Link to="/" className="action-btn primary">Play Now</Link>
          <Link to="/history" className="action-btn secondary">Bet History</Link>
          <Link to="/wallet" className="action-btn secondary">Wallet</Link>
        </div>
      </div>
    </div>
  );
};

export default ProfileComponent;