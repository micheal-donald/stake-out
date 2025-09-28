import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';

const BetHistoryComponent = () => {
  const { isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();

  const [bets, setBets] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasMore: false
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Load bet history on component mount and when page changes
  useEffect(() => {
    const fetchBetHistory = async () => {
      try {
        if (!isAuthenticated) return;

        const res = await axios.get(`http://localhost:4000/api/bet/history?page=${pagination.currentPage}&limit=10`, {
          withCredentials: true
        });
        
        setBets(res.data.bets);
        setPagination(res.data.pagination);
        setLoading(false);
        
      } catch (err) {
        setError('Failed to load bet history. Please try again.');
        setLoading(false);
      }
    };

    fetchBetHistory();
  }, [pagination.currentPage, isAuthenticated]);

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, currentPage: newPage }));
    }
  };

  // Format date
  const formatDate = (dateString) => {
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  if (loading) {
    return <div>Loading bet history...</div>;
  }

  return (
    <div className="battle-archives-container">
      <div className="battle-archives-header">
        <h2>
          <span className="archives-icon">⚔️</span>
          Battle Archives
        </h2>
        <p className="archives-subtitle">Combat History & Performance Metrics</p>
      </div>
      
      {error && <div className="alert alert-danger">{error}</div>}
      
      {bets.length === 0 ? (
        <div className="no-battles">
          <div className="empty-state-icon">🏟️</div>
          <p>No combat records found, Commander.</p>
          <p className="empty-subtext">Your battle history will appear here after your first deployment.</p>
        </div>
      ) : (
        <>
          <div className="battle-stats-grid">
            <div className="stat-card">
              <div className="stat-icon">⚔️</div>
              <div className="stat-value">{bets.length}</div>
              <div className="stat-label">Total Sorties</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🏆</div>
              <div className="stat-value">{bets.filter(bet => parseFloat(bet.winnings) > 0).length}</div>
              <div className="stat-label">Victories</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">💀</div>
              <div className="stat-value">{bets.filter(bet => parseFloat(bet.winnings) === 0).length}</div>
              <div className="stat-label">Defeats</div>
            </div>
          </div>

          <div className="battle-table">
            <table>
              <thead>
                <tr>
                  <th><span className="table-icon">📅</span>Mission Date</th>
                  <th><span className="table-icon">💰</span>Deployment</th>
                  <th><span className="table-icon">📈</span>Combat Multi</th>
                  <th><span className="table-icon">💥</span>Crash Point</th>
                  <th><span className="table-icon">🎯</span>Spoils</th>
                  <th><span className="table-icon">⚡</span>Type</th>
                </tr>
              </thead>
              <tbody>
                {bets.map(bet => (
                  <tr key={bet.bet_id} className={parseFloat(bet.winnings) > 0 ? 'victory' : 'defeat'}>
                    <td>{formatDate(bet.created_at)}</td>
                    <td>${parseFloat(bet.bet_amount).toFixed(2)}</td>
                    <td>{parseFloat(bet.multiplier).toFixed(2)}x</td>
                    <td>{parseFloat(bet.crash_point).toFixed(2)}x</td>
                    <td className="spoils-cell">
                      <span className="spoils-amount">${parseFloat(bet.winnings || 0).toFixed(2)}</span>
                      {parseFloat(bet.winnings) > 0 ? 
                        <span className="victory-badge">🏆</span> : 
                        <span className="defeat-badge">💀</span>
                      }
                    </td>
                    <td>
                      <span className={`battle-type ${bet.cashout_trigger}`}>
                        {bet.cashout_trigger === 'manual' ? '⚡ Tactical' : '🤖 Auto-Pilot'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="archive-pagination">
            <button 
              className="nav-btn prev-btn"
              onClick={() => handlePageChange(pagination.currentPage - 1)} 
              disabled={pagination.currentPage === 1}
            >
              ◀️
            </button>
            
            <span className="page-info">
              {pagination.currentPage} / {pagination.totalPages}
            </span>
            
            <button 
              className="nav-btn next-btn"
              onClick={() => handlePageChange(pagination.currentPage + 1)} 
              disabled={!pagination.hasMore}
            >
              ▶️
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default BetHistoryComponent;