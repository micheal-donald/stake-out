import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext'; 
import { 
  ArrowUpCircle, 
  ArrowDownCircle,
  DollarSign, 
  Clock, 
  Phone, 
  CreditCard,
  Smartphone
} from 'lucide-react';
import '../style/WalletComponent.css';

const WalletComponent = () => {
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
  const [depositMethod, setDepositMethod] = useState(null);
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [processingDeposit, setProcessingDeposit] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        if (user) {
          setBalance(parseFloat(user.balance) || 0);
          setLoading(false);
        } else {
          const token = localStorage.getItem('token');
          if (!token) return navigate('/login');

          const res = await axios.get('http://localhost:4000/api/wallet/balance', {
            headers: { Authorization: `Bearer ${token}` }
          });

          setBalance(parseFloat(res.data.balance) || 0);
          setLoading(false);
        }
        fetchTransactions();
      } catch (err) {
        console.error('Error fetching user data:', err);
        setError('Failed to load wallet data. Please try again.');
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user, navigate]);

  const fetchTransactions = async (page = 1) => {
    setTransactionsLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) return navigate('/login');

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

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, currentPage: newPage }));
      fetchTransactions(newPage);
    }
  };

  const handleDeposit = () => {
    if (depositMethod === 'mpesa') handleMpesaDeposit();
    else if (depositMethod === 'card') handleStandardDeposit();
  };

  const handleMpesaDeposit = async () => {
    setError('');
    setSuccess('');

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return setError('Please enter a valid deposit amount');

    const phoneRegex = /^(?:254|\+254|0)?(7[0-9]{8})$/;
    if (!phoneRegex.test(mpesaPhone)) return setError('Please enter a valid M-Pesa phone number');

    let formattedPhone = mpesaPhone;
    if (mpesaPhone.startsWith('0')) formattedPhone = '254' + mpesaPhone.substring(1);
    else if (mpesaPhone.startsWith('+254')) formattedPhone = mpesaPhone.substring(1);

    setProcessingDeposit(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('http://localhost:4000/api/mpesa/stk-push', 
        { amount, phoneNumber: mpesaPhone }, 
        { headers: { Authorization: `Bearer ${token}` }}
      );

      setSuccess('M-Pesa payment request sent!');
      setDepositAmount('');
      setMpesaPhone('');
      setTimeout(() => fetchTransactions(), 5000);
    } catch (err) {
      setError(err.response?.data?.error || 'M-Pesa deposit failed.');
    } finally {
      setProcessingDeposit(false);
    }
  };

  const handleStandardDeposit = async () => {
    setError('');
    setSuccess('');
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return setError('Please enter a valid deposit amount');

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
      if (updateUserBalance) updateUserBalance(newBalance);
      fetchTransactions();
    } catch (err) {
      setError(err.response?.data?.error || 'Deposit failed.');
    }
  };

  const handleWithdraw = async () => {
    setError('');
    setSuccess('');
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) return setError('Please enter a valid withdrawal amount');
    if (amount > balance) return setError('Insufficient balance');

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
      if (updateUserBalance) updateUserBalance(newBalance);
      fetchTransactions();
    } catch (err) {
      setError(err.response?.data?.error || 'Withdrawal failed.');
    }
  };

  const formatDate = (dateString) => new Date(dateString).toLocaleString();

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'deposit': return <ArrowUpCircle size={20} className="transaction-icon deposit" />;
      case 'withdrawal': return <ArrowDownCircle size={20} className="transaction-icon withdrawal" />;
      case 'bet': return <DollarSign size={20} className="transaction-icon bet" />;
      case 'win': return <DollarSign size={20} className="transaction-icon win" />;
      default: return <Clock size={20} className="transaction-icon" />;
    }
  };

  const renderDepositForm = () => (
    <div className="deposit-form">
      <h3>Deposit Funds</h3>
      <div className="payment-method-selector">
        <button className={`method-option ${depositMethod === 'mpesa' ? 'active' : ''}`} onClick={() => setDepositMethod('mpesa')}>
          <Smartphone size={18} /> M-Pesa
        </button>
        <button className={`method-option ${depositMethod === 'card' ? 'active' : ''}`} onClick={() => setDepositMethod('card')}>
          <CreditCard size={18} /> Card
        </button>
      </div>

      {depositMethod && (
        <div className="method-details">
          <div className="form-group">
            <label>Amount</label>
            <div className="input-with-prefix">
              <span className="input-prefix">$</span>
              <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} min="1" step="0.01" placeholder="Enter amount" />
            </div>
          </div>

          {depositMethod === 'mpesa' && (
            <>
              <div className="form-group">
                <label>M-Pesa Phone</label>
                <div className="input-with-icon">
                  <Phone size={18} className="input-icon" />
                  <input type="text" value={mpesaPhone} onChange={(e) => setMpesaPhone(e.target.value)} placeholder="e.g. 0712345678" />
                </div>
              </div>
              <p className="form-note">Note: You'll receive an M-Pesa prompt to complete the payment.</p>
            </>
          )}

          {depositMethod === 'card' && (
            <p className="form-note">Note: This will connect to a card payment processor (e.g. Stripe).</p>
          )}

          <button className="deposit-button" onClick={handleDeposit} disabled={processingDeposit || !depositAmount || (depositMethod === 'mpesa' && !mpesaPhone)}>
            {processingDeposit ? 'Processing...' : 'Deposit Funds'}
          </button>
        </div>
      )}
    </div>
  );

  if (loading) return <div className="wallet-loading">Loading wallet...</div>;

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
        <button className={`tab-button ${activeTab === 'deposit' ? 'active' : ''}`} onClick={() => setActiveTab('deposit')}>
          <ArrowUpCircle size={18} /> Deposit
        </button>
        <button className={`tab-button ${activeTab === 'withdraw' ? 'active' : ''}`} onClick={() => setActiveTab('withdraw')}>
          <ArrowDownCircle size={18} /> Withdraw
        </button>
      </div>

      <div className="wallet-tab-content">
        {activeTab === 'deposit' && renderDepositForm()}

        {activeTab === 'withdraw' && (
          <div className="withdraw-form">
            <h3>Withdraw Funds</h3>
            <div className="form-group">
              <label>Amount</label>
              <div className="input-with-prefix">
                <span className="input-prefix">$</span>
                <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} min="1" max={balance} step="0.01" placeholder="Enter withdrawal amount" />
              </div>
            </div>
            <button className="withdraw-button" onClick={handleWithdraw} disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > balance}>
              Withdraw Funds
            </button>
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
              {transactions.map(t => (
                <div key={t.transaction_id} className={`transaction ${t.transaction_type}`}>
                  <div className="transaction-left">
                    {getTransactionIcon(t.transaction_type)}
                    <div className="transaction-details">
                      <div className="transaction-type-label">{t.transaction_type.charAt(0).toUpperCase() + t.transaction_type.slice(1)}</div>
                      <div className="transaction-date">{formatDate(t.created_at)}</div>
                    </div>
                  </div>
                  <div className="transaction-right">
                    <div className={`transaction-amount ${t.transaction_type}`}>{['deposit', 'win'].includes(t.transaction_type) ? '+' : '-'}${parseFloat(t.amount).toFixed(2)}</div>
                    <div className="transaction-status">{t.status}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pagination">
              <button onClick={() => handlePageChange(pagination.currentPage - 1)} disabled={pagination.currentPage === 1} className="pagination-button">Previous</button>
              <span className="pagination-info">Page {pagination.currentPage} of {pagination.totalPages || 1}</span>
              <button onClick={() => handlePageChange(pagination.currentPage + 1)} disabled={!pagination.hasMore} className="pagination-button">Next</button>
            </div>
          </>
        ) : (
          <div className="no-transactions">No transactions found.</div>
        )}
      </div>
    </div>
  );
};

export default WalletComponent;
