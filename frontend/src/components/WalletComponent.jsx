import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext'; // Make sure this path is correct
import { ArrowUpCircle, ArrowDownCircle, DollarSign, Clock } from 'lucide-react';
import '../style/WalletComponent.css';

const WalletComponent = () => {
  // Use a default empty object if context is null to prevent destructuring errors
  const context = useContext(AuthContext) || {};
  const { user, updateUserBalance } = context;
  
  const [balance, setBalance] = useState(0);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasMore: false
  });
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('deposit');
  
  const navigate = useNavigate();

  // Fetch user balance if not available in context
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        if (user) {
          setBalance(parseFloat(user.balance) || 0);
          setLoading(false);
        } else {
          // Fallback to fetch balance directly
          const token = localStorage.getItem('token');
          if (!token) {
            navigate('/login');
            return;
          }
          
          const res = await axios.get('http://localhost:4000/api/wallet/balance', {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          setBalance(parseFloat(res.data.balance) || 0);
          setLoading(false);
        }
        
        // Fetch transactions
        fetchTransactions();
      } catch (err) {
        console.error('Error fetching user data:', err);
        setError('Failed to load wallet data. Please try again.');
        setLoading(false);
      }
    };
    
    fetchUserData();
  }, [user, navigate]);

  // Fetch transaction history
  const fetchTransactions = async (page = 1) => {
    setTransactionsLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const res = await axios.get(`http://localhost:4000/api/wallet/transactions?page=${page}&limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setTransactions(res.data.transactions);
      setPagination(res.data.pagination);
      setTransactionsLoading(false);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setTransactionsLoading(false);
    }
  };

  // Handle page change for transactions
  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, currentPage: newPage }));
      fetchTransactions(newPage);
    }
  };

  // Handle deposit submission
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
      const res = await axios.post('http://localhost:4000/api/wallet/deposit', 
        { amount }, 
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      const newBalance = parseFloat(res.data.user.balance);
      
      setSuccess(`Successfully deposited $${amount.toFixed(2)}`);
      setBalance(newBalance);
      setDepositAmount('');
      
      // Update the global user balance if function exists
      if (updateUserBalance) {
        updateUserBalance(newBalance);
      }
      
      // Refresh transactions
      fetchTransactions();
    } catch (err) {
      setError(err.response?.data?.error || 'Deposit failed. Please try again.');
    }
  };

  // Handle withdrawal submission
  const handleWithdraw = async () => {
    setError('');
    setSuccess('');
    
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid withdrawal amount');
      return;
    }
    
    if (amount > balance) {
      setError('Insufficient balance');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('http://localhost:4000/api/wallet/withdraw', 
        { amount }, 
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      const newBalance = parseFloat(res.data.user.balance);
      
      setSuccess(`Successfully withdrew $${amount.toFixed(2)}`);
      setBalance(newBalance);
      setWithdrawAmount('');
      
      // Update the global user balance if function exists
      if (updateUserBalance) {
        updateUserBalance(newBalance);
      }
      
      // Refresh transactions
      fetchTransactions();
    } catch (err) {
      setError(err.response?.data?.error || 'Withdrawal failed. Please try again.');
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

  // Get transaction icon
  const getTransactionIcon = (type) => {
    switch (type) {
      case 'deposit':
        return <ArrowUpCircle size={20} className="transaction-icon deposit" />;
      case 'withdrawal':
        return <ArrowDownCircle size={20} className="transaction-icon withdrawal" />;
      case 'bet':
        return <DollarSign size={20} className="transaction-icon bet" />;
      case 'win':
        return <DollarSign size={20} className="transaction-icon win" />;
      default:
        return <Clock size={20} className="transaction-icon" />;
    }
  };

  if (loading) {
    return <div className="wallet-loading">Loading wallet...</div>;
  }

  return (
    <div className="wallet-container">
      <h2>Your Wallet</h2>
      
      <div className="balance-display">
        <h3>Current Balance</h3>
        <div className="balance-amount">${balance.toFixed(2)}</div>
      </div>
      
      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      
      <div className="wallet-tabs">
        <button 
          className={`tab-button ${activeTab === 'deposit' ? 'active' : ''}`}
          onClick={() => setActiveTab('deposit')}
        >
          <ArrowUpCircle size={18} className="tab-icon" />
          Deposit
        </button>
        <button 
          className={`tab-button ${activeTab === 'withdraw' ? 'active' : ''}`}
          onClick={() => setActiveTab('withdraw')}
        >
          <ArrowDownCircle size={18} className="tab-icon" />
          Withdraw
        </button>
      </div>
      
      <div className="wallet-tab-content">
        {activeTab === 'deposit' && (
          <div className="deposit-form">
            <h3>Deposit Funds</h3>
            <div className="form-group">
              <label htmlFor="depositAmount">Amount</label>
              <input
                type="number"
                id="depositAmount"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                min="1"
                step="0.01"
                placeholder="Enter amount to deposit"
                required
              />
            </div>
            <button 
              className="deposit-button"
              onClick={handleDeposit}
              disabled={!depositAmount || parseFloat(depositAmount) <= 0}
            >
              Deposit Funds
            </button>
            <p className="form-note">
              Note: In a real application, this would connect to a payment processor.
            </p>
          </div>
        )}
        
        {activeTab === 'withdraw' && (
          <div className="withdraw-form">
            <h3>Withdraw Funds</h3>
            <div className="form-group">
              <label htmlFor="withdrawAmount">Amount</label>
              <input
                type="number"
                id="withdrawAmount"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                min="1"
                max={balance}
                step="0.01"
                placeholder="Enter amount to withdraw"
                required
              />
            </div>
            <button 
              className="withdraw-button"
              onClick={handleWithdraw}
              disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > balance}
            >
              Withdraw Funds
            </button>
            <p className="form-note">
              Note: In a real application, you would enter bank or payment details here.
            </p>
          </div>
        )}
      </div>
      
      <div className="transaction-history-section">
        <h3>Transaction History</h3>
        
        {transactionsLoading ? (
          <div className="loading-transactions">Loading transactions...</div>
        ) : transactions.length > 0 ? (
          <>
            <div className="transaction-list">
              {transactions.map(transaction => (
                <div key={transaction.transaction_id} className={`transaction ${transaction.transaction_type}`}>
                  <div className="transaction-left">
                    {getTransactionIcon(transaction.transaction_type)}
                    <div className="transaction-details">
                      <div className="transaction-type-label">
                        {transaction.transaction_type.charAt(0).toUpperCase() + transaction.transaction_type.slice(1)}
                      </div>
                      <div className="transaction-date">{formatDate(transaction.created_at)}</div>
                    </div>
                  </div>
                  <div className="transaction-right">
                    <div className={`transaction-amount ${transaction.transaction_type}`}>
                      {transaction.transaction_type === 'deposit' || transaction.transaction_type === 'win' ? '+' : '-'}
                      ${parseFloat(transaction.amount).toFixed(2)}
                    </div>
                    <div className="transaction-status">{transaction.status}</div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="pagination">
              <button 
                onClick={() => handlePageChange(pagination.currentPage - 1)} 
                disabled={pagination.currentPage === 1}
                className="pagination-button"
              >
                Previous
              </button>
              
              <span className="pagination-info">
                Page {pagination.currentPage} of {pagination.totalPages || 1}
              </span>
              
              <button 
                onClick={() => handlePageChange(pagination.currentPage + 1)} 
                disabled={!pagination.hasMore}
                className="pagination-button"
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <div className="no-transactions">
            <p>No transactions found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WalletComponent;