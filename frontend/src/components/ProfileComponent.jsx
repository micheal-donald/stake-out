import React, { useState, useEffect, useContext } from 'react';
import apiClient from '../utils/api';
import { Link, useNavigate } from 'react-router-dom';
import {
  User,
  Settings,
  Key,
  DollarSign,
  History,
  ChevronRight,
  Edit,
  Save,
  X,
  Radar,
  Shield,
  Target,
  Zap,
  RefreshCw,
  LogOut,
  Mail,
  Calendar,
  Lock
} from 'lucide-react';
import { AuthContext } from '../AuthContext';
import '../style/ProfileComponent.css';

const ProfileComponent = () => {
  const context = useContext(AuthContext) || {};
  const { isAuthenticated, user, logout, updateUserBalance } = context;
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

  const handleDeposit = () => navigate('/wallet');

  // Loading state
  if (loading) {
    return (
      <div className="loading-container">
        <RefreshCw size={48} className="spin" />
        <span>SYNCING INTEL...</span>
      </div>
    );
  }

  // Safe data extraction with robust fallbacks
  const username = profile?.user?.username || user?.username || 'COMMANDER';
  const email = profile?.user?.email || user?.email || 'UNIDENTIFIED';
  const balance = parseFloat(profile?.user?.balance || user?.balance || 0);
  const created_at = profile?.user?.created_at || user?.created_at;

  const total_bets = parseInt(profile?.betSummary?.total_bets || 0, 10);
  const total_winnings = parseFloat(profile?.betSummary?.total_winnings || 0);

  const auto_cashout_multiplier = parseFloat(profile?.settings?.auto_cashout_multiplier || 0);
  const auto_cashout_amount = parseFloat(profile?.settings?.auto_cashout_amount || 0);

  const enlistmentDate = created_at ? new Date(created_at).toLocaleDateString() : 'UNKNOWN';

  return (
    <div className="profile-container">
      {error && (
        <div className="alert alert-danger">
          <X size={20} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <Shield size={20} />
          <span>{success}</span>
        </div>
      )}

      <div className="profile-card">
        <div className="profile-header">
          <div className="profile-title">
            <Radar className="profile-icon" size={32} />
            <h2>INTEL REPORT</h2>
          </div>
          <div className="balance-display">
            <DollarSign size={20} />
            <span>{balance.toFixed(2)}</span>
          </div>
        </div>

        {/* Commander Stats Grid */}
        <div className="profile-stats">
          <div className="stat-card bets">
            <label>COMBAT MISSIONS (BETS)</label>
            <div className="stat-value">{total_bets}</div>
            <Target className="stat-bg-icon" size={40} />
          </div>
          <div className="stat-card winnings">
            <label>REWARDS CLAIMED</label>
            <div className="stat-value">${total_winnings.toFixed(2)}</div>
            <DollarSign className="stat-bg-icon" size={40} />
          </div>
          <div className="stat-card enlisted">
            <label>ENLISTMENT DATE</label>
            <div className="stat-value">{enlistmentDate}</div>
            <Calendar className="stat-bg-icon" size={40} />
          </div>
        </div>

        {/* Service Record Section */}
        <div className="details-section">
          <div className="section-header" onClick={() => !editMode && setEditMode(!editMode)}>
            <div className="section-title">
              <Shield size={20} />
              <h3>SERVICE RECORD</h3>
            </div>
            {!editMode ? (
              <button className="modern-btn secondary" onClick={(e) => { e.stopPropagation(); setEditMode(true); }}>
                <Edit size={16} /> EDIT
              </button>
            ) : (
              <X size={20} />
            )}
          </div>

          <div className="section-content">
            {!editMode ? (
              <div className="detail-grid">
                <div className="detail-item">
                  <label>COMMANDER NAME</label>
                  <span>{username}</span>
                </div>
                <div className="detail-item">
                  <label>COMMUNICATION CHANNEL</label>
                  <span>{email}</span>
                </div>
                <div className="detail-item">
                  <label>AUTO-CASHOUT MULTIPLIER</label>
                  <span>{auto_cashout_multiplier > 0 ? `${auto_cashout_multiplier}x` : 'MANUAL CONTROL'}</span>
                </div>
                <div className="detail-item">
                  <label>AUTO-CASHOUT THRESHOLD</label>
                  <span>{auto_cashout_amount > 0 ? `$${auto_cashout_amount.toFixed(2)}` : 'MANUAL CONTROL'}</span>
                </div>
              </div>
            ) : (
              <div className="edit-form">
                <div className="edit-form-grid">
                  <div className="form-field">
                    <label>COMMANDER NAME</label>
                    <div className="input-wrapper">
                      <User size={18} />
                      <input type="text" value={username} disabled />
                    </div>
                    <small>Permanent callsign. Cannot be modified.</small>
                  </div>
                  <div className="form-field">
                    <label>EMAIL CHANNEL</label>
                    <div className="input-wrapper">
                      <Mail size={18} />
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={onChange}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <label>AUTO-CASHOUT (X)</label>
                    <div className="input-wrapper">
                      <Zap size={18} />
                      <input
                        type="number"
                        name="auto_cashout_multiplier"
                        value={formData.auto_cashout_multiplier}
                        onChange={onChange}
                        min="0"
                        step="0.1"
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <label>AUTO-CASHOUT ($)</label>
                    <div className="input-wrapper">
                      <DollarSign size={18} />
                      <input
                        type="number"
                        name="auto_cashout_amount"
                        value={formData.auto_cashout_amount}
                        onChange={onChange}
                        min="0"
                        step="1"
                      />
                    </div>
                  </div>
                </div>
                <div className="form-actions">
                  <button className="modern-btn success" onClick={saveProfile}>
                    <Save size={16} /> SAVE INTEL
                  </button>
                  <button className="modern-btn secondary" onClick={() => setEditMode(false)}>
                    <X size={16} /> ABORT
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security / Password Section */}
        <div className="details-section">
          <div className="section-header" onClick={() => setShowPasswordChange(!showPasswordChange)}>
            <div className="section-title">
              <Key size={20} />
              <h3>SECURITY PROTOCOLS</h3>
            </div>
            <ChevronRight size={20} className={showPasswordChange ? "rotate" : ""} />
          </div>

          {showPasswordChange && (
            <div className="section-content">
              <form onSubmit={changePassword} className="password-change-form">
                <div className="edit-form-grid">
                  <div className="form-field">
                    <label>CURRENT CLEARANCE</label>
                    <div className="input-wrapper">
                      <Lock size={18} />
                      <input
                        type="password"
                        name="currentPassword"
                        value={passwordData.currentPassword}
                        onChange={onPasswordChange}
                        required
                        placeholder="Current Password"
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <label>NEW CLEARANCE</label>
                    <div className="input-wrapper">
                      <Key size={18} />
                      <input
                        type="password"
                        name="newPassword"
                        value={passwordData.newPassword}
                        onChange={onPasswordChange}
                        minLength="6"
                        required
                        placeholder="New Password"
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <label>CONFIRM NEW CLEARANCE</label>
                    <div className="input-wrapper">
                      <Key size={18} />
                      <input
                        type="password"
                        name="confirmPassword"
                        value={passwordData.confirmPassword}
                        onChange={onPasswordChange}
                        minLength="6"
                        required
                        placeholder="Confirm New Password"
                      />
                    </div>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="modern-btn primary">UPDATE CLEARANCE</button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Quick Access Links */}
        <div className="quick-actions">
          <Link to="/" className="quick-action-card">
            <Zap size={24} />
            <span>BATTLE ARENA</span>
          </Link>
          <Link to="/wallet" className="quick-action-card">
            <DollarSign size={24} />
            <span>ARSENAL</span>
          </Link>
          <Link to="/history" className="quick-action-card">
            <History size={24} />
            <span>BATTLE LOGS</span>
          </Link>
          <button onClick={logout} className="quick-action-card logout">
            <LogOut size={24} />
            <span>TERMINATE SESSION</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileComponent;