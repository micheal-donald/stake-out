import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BetHistoryComponent = () => {
  const [bets, setBets] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasMore: false
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Load bet history on component mount and when page changes
  useEffect(() => {
    const fetchBetHistory = async () => {
      try {
        const token = localStorage.getItem('token');
        
        if (!token) {
          throw new Error('Not authenticated');
        }
        
        const res = await axios.get(`http://localhost:4000/api/bet-history?page=${pagination.currentPage}&limit=10`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
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
  }, [pagination.currentPage]);

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
    <div className="bet-history-container">
      <h2>Betting History</h2>
      
      {error && <div className="alert alert-danger">{error}</div>}
      
      {bets.length === 0 ? (
        <div className="no-bets">
          <p>You haven't placed any bets yet.</p>
        </div>
      ) : (
        <>
          <div className="bet-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bet Amount</th>
                  <th>Multiplier</th>
                  <th>Crash Point</th>
                  <th>Winnings</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {bets.map(bet => (
                  <tr key={bet.bet_id} className={parseFloat(bet.winnings) > 0 ? 'win' : 'loss'}>
                    <td>{formatDate(bet.created_at)}</td>
                    <td>${parseFloat(bet.bet_amount).toFixed(2)}</td>
                    <td>{parseFloat(bet.multiplier).toFixed(2)}x</td>
                    <td>{parseFloat(bet.crash_point).toFixed(2)}x</td>
                    <td>${parseFloat(bet.winnings || 0).toFixed(2)}</td>
                    <td>{bet.cashout_trigger === 'manual' ? 'Manual' : 'Auto'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="pagination">
            <button 
              onClick={() => handlePageChange(pagination.currentPage - 1)} 
              disabled={pagination.currentPage === 1}
            >
              Previous
            </button>
            
            <span>
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            
            <button 
              onClick={() => handlePageChange(pagination.currentPage + 1)} 
              disabled={!pagination.hasMore}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default BetHistoryComponent;