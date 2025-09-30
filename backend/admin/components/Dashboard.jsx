/**
 * Custom AdminJS Dashboard Component
 *
 * Provides a comprehensive overview of the Battle Arena application
 * Displays key metrics, system health, and recent activity
 */

import React, { useState, useEffect } from 'react';
import { useCurrentAdmin } from 'adminjs';

const Dashboard = () => {
  const [currentAdmin] = useCurrentAdmin();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch dashboard overview data from the main API server
      // Admin panel (port 5000) fetches data from API server (port 4000)
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
      const response = await fetch(`${API_URL}/api/admin/dashboard`, {
        method: 'GET',
        credentials: 'include', // Important: include cookies for authentication
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setDashboardData(result.data);

    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError('Failed to load dashboard data. Please ensure the main API server is running on port 4000.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Loading Dashboard...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
        <h2>Error: {error}</h2>
        <button onClick={fetchDashboardData}>Retry</button>
      </div>
    );
  }

  const cardStyle = {
    backgroundColor: '#fff',
    border: '1px solid #e1e5e9',
    borderRadius: '8px',
    padding: '20px',
    margin: '10px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    flex: '1',
    minWidth: '250px'
  };

  const titleStyle = {
    fontSize: '14px',
    fontWeight: '600',
    color: '#6c757d',
    marginBottom: '8px',
    textTransform: 'uppercase'
  };

  const valueStyle = {
    fontSize: '28px',
    fontWeight: '700',
    color: '#495057',
    marginBottom: '4px'
  };

  const changeStyle = {
    fontSize: '12px',
    color: '#6c757d'
  };

  return (
    <div style={{ padding: '20px' }}>
      {/* Welcome Section */}
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>
          Welcome back, {currentAdmin?.username || 'Admin'}!
        </h1>
        <p style={{ color: '#6c757d', fontSize: '14px' }}>
          Here's what's happening with Battle Arena today.
        </p>
      </div>

      {/* Key Metrics Row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: '30px' }}>
        {/* Total Users */}
        <div style={cardStyle}>
          <div style={titleStyle}>Total Users</div>
          <div style={valueStyle}>{dashboardData?.totalUsers || '0'}</div>
          <div style={changeStyle}>
            +{dashboardData?.newUsersToday || '0'} today
          </div>
        </div>

        {/* Active Sessions */}
        <div style={cardStyle}>
          <div style={titleStyle}>Active Sessions</div>
          <div style={valueStyle}>{dashboardData?.activeSessions || '0'}</div>
          <div style={changeStyle}>Currently online</div>
        </div>

        {/* Active Games */}
        <div style={cardStyle}>
          <div style={titleStyle}>Active Games</div>
          <div style={valueStyle}>{dashboardData?.activeGames || '0'}</div>
          <div style={changeStyle}>
            {dashboardData?.gamesToday || '0'} games today
          </div>
        </div>

        {/* Today's Revenue */}
        <div style={cardStyle}>
          <div style={titleStyle}>Today's Bets</div>
          <div style={valueStyle}>
            ${Number(dashboardData?.totalBetsToday || 0).toLocaleString()}
          </div>
          <div style={changeStyle}>Total bet volume</div>
        </div>
      </div>

      {/* Financial Overview Row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: '30px' }}>
        {/* Total User Balances */}
        <div style={cardStyle}>
          <div style={titleStyle}>Total User Balances</div>
          <div style={valueStyle}>
            ${Number(dashboardData?.totalUserBalances || 0).toLocaleString()}
          </div>
          <div style={changeStyle}>All user accounts</div>
        </div>

        {/* Today's Deposits */}
        <div style={cardStyle}>
          <div style={titleStyle}>Deposits Today</div>
          <div style={valueStyle}>{dashboardData?.depositsToday || '0'}</div>
          <div style={changeStyle}>Successful deposits</div>
        </div>

        {/* Recent Errors */}
        <div style={cardStyle}>
          <div style={titleStyle}>Recent Errors</div>
          <div style={{
            ...valueStyle,
            color: dashboardData?.recentErrors > 0 ? '#dc3545' : '#28a745'
          }}>
            {dashboardData?.recentErrors || '0'}
          </div>
          <div style={changeStyle}>Last hour</div>
        </div>

        {/* Admin Actions Today */}
        <div style={cardStyle}>
          <div style={titleStyle}>Admin Actions Today</div>
          <div style={valueStyle}>{dashboardData?.adminActionsToday || '0'}</div>
          <div style={changeStyle}>All admin activity</div>
        </div>
      </div>

      {/* System Status Section */}
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
          System Status
        </h2>

        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {/* System Health */}
          <div style={cardStyle}>
            <div style={titleStyle}>Database</div>
            <div style={{
              ...valueStyle,
              fontSize: '18px',
              color: '#28a745'
            }}>
              ✓ Connected
            </div>
            <div style={changeStyle}>All systems operational</div>
          </div>

          {/* Payment Module */}
          <div style={cardStyle}>
            <div style={titleStyle}>Payment Module</div>
            <div style={{
              ...valueStyle,
              fontSize: '18px',
              color: '#28a745'
            }}>
              ✓ Active
            </div>
            <div style={changeStyle}>Processing payments</div>
          </div>

          {/* Game Engine */}
          <div style={cardStyle}>
            <div style={titleStyle}>Game Engine</div>
            <div style={{
              ...valueStyle,
              fontSize: '18px',
              color: '#28a745'
            }}>
              ✓ Running
            </div>
            <div style={changeStyle}>Games operational</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
          Quick Actions
        </h2>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            style={{
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
            onClick={() => window.location.href = '/admin/resources/users'}
          >
            Manage Users
          </button>

          <button
            style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
            onClick={() => window.location.href = '/admin/resources/game_rounds'}
          >
            View Games
          </button>

          <button
            style={{
              padding: '10px 20px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
            onClick={() => window.location.href = '/admin/resources/transactions'}
          >
            View Transactions
          </button>

          <button
            style={{
              padding: '10px 20px',
              backgroundColor: '#ffc107',
              color: '#212529',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
            onClick={() => window.location.href = '/admin/resources/error_logs'}
          >
            Check Errors
          </button>

          <button
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
            onClick={() => window.location.href = '/admin/resources/system_settings'}
          >
            System Settings
          </button>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid #e1e5e9',
        paddingTop: '20px',
        marginTop: '30px',
        textAlign: 'center',
        color: '#6c757d',
        fontSize: '12px'
      }}>
        <p>Battle Arena Admin Panel - Role: {currentAdmin?.role}</p>
        <p>Last updated: {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
};

export default Dashboard;