import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ProfileComponent = () => {
  const [profile, setProfile] = useState({ user: {}, settings: {}, betSummary: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  const [formData, setFormData] = useState({ email: '', auto_cashout_multiplier: 0, auto_cashout_amount: 0 });
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [depositAmount, setDepositAmount] = useState('');

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');

      const res = await axios.get('http://localhost:4000/api/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });

      setProfile(res.data);
      setFormData({
        email: res.data.user.email,
        auto_cashout_multiplier: res.data.settings.auto_cashout_multiplier || 0,
        auto_cashout_amount: res.data.settings.auto_cashout_amount || 0
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
      const token = localStorage.getItem('token');
      await axios.put('http://localhost:4000/api/profile', { email: formData.email }, { headers: { Authorization: `Bearer ${token}` } });
      await axios.put('http://localhost:4000/api/settings', {
        auto_cashout_multiplier: formData.auto_cashout_multiplier,
        auto_cashout_amount: formData.auto_cashout_amount
      }, { headers: { Authorization: `Bearer ${token}` } });

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
      const token = localStorage.getItem('token');
      await axios.put('http://localhost:4000/api/change-password', passwordData, { headers: { Authorization: `Bearer ${token}` } });
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
      const token = localStorage.getItem('token');
      const res = await axios.post('http://localhost:4000/api/deposit', { amount }, { headers: { Authorization: `Bearer ${token}` } });
      setSuccess(`Deposit of ${amount.toFixed(2)} successful`);
      setDepositAmount('');
      setProfile(prev => ({ ...prev, user: { ...prev.user, balance: res.data.user.balance } }));
    } catch (err) {
      setError(err.response?.data?.error || 'Deposit failed');
    }
  };

  if (loading) return <div>Loading profile...</div>;

  return (
    <div className="profile-container">
      {/* Your existing JSX code here unchanged */}
    </div>
  );
};

export default ProfileComponent;
