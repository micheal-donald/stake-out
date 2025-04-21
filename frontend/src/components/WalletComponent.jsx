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
  Smartphone,
  Check,
  X,
  RefreshCw
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
  const [currentTransaction, setCurrentTransaction] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const navigate = useNavigate();

  // Load wallet data on component mount
  useEffect(() => {
    fetchWalletData();
  }, [user, navigate]);

  // Function to fetch wallet balance and transaction data
  const fetchWalletData = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return navigate('/login');

      setLoading(true);
      // Get balance from user context if available, otherwise fetch it
      if (user) {
        setBalance(parseFloat(user.balance) || 0);
      } else {
        const res = await axios.get('http://localhost:4000/api/wallet/balance', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setBalance(parseFloat(res.data.balance) || 0);
      }
      setLoading(false);
      
      // Always fetch transactions
      fetchTransactions();
    } catch (err) {
      console.error('Error fetching wallet data:', err);
      setError('Failed to load wallet data. Please try again.');
      setLoading(false);
    }
  };

  // Function to fetch transaction history
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
      
      // Check if there's a pending M-Pesa transaction
      const pendingMpesa = res.data.transactions.find(
        t => t.transaction_type === 'deposit' && 
        t.status === 'pending' && 
        t.description && 
        t.description.includes('M-Pesa')
      );
      
      if (pendingMpesa) {
        setCurrentTransaction(pendingMpesa);
      } else {
        setCurrentTransaction(null);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setTransactionsLoading(false);
    }
  };

  // Handle page change for transaction history
  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, currentPage: newPage }));
      fetchTransactions(newPage);
    }
  };

  // Handle deposit action
  const handleDeposit = () => {
    if (depositMethod === 'mpesa') handleMpesaDeposit();
    else if (depositMethod === 'card') handleStandardDeposit();
  };

  // Handle M-Pesa deposit
  const handleMpesaDeposit = async () => {
    setError('');
    setSuccess('');

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      return setError('Please enter a valid deposit amount');
    }

    // Validate phone number format
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(mpesaPhone)) {
      return setError('Please enter a valid M-Pesa phone number (format: 07XXXXXXXX)');
    }

    setProcessingDeposit(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('http://localhost:4000/api/mpesa/stk-push', 
        { amount, phoneNumber: mpesaPhone }, 
        { headers: { Authorization: `Bearer ${token}` }}
      );

      // Set success message with transaction ID
      setSuccess('M-Pesa payment request sent! Check your phone to complete the transaction.');
      
      // Store transaction info for status checking
      if (res.data.transactionId) {
        setCurrentTransaction({
          transaction_id: res.data.transactionId,
          request_id: res.data.requestId,
          amount: amount,
          status: 'pending'
        });
        
        // Start checking status after 5 seconds
        setTimeout(() => checkTransactionStatus(res.data.requestId), 5000);
      }
      
      // Reset form
      setDepositAmount('');
      setMpesaPhone('');
      
      // Refresh transactions list
      fetchTransactions();
    } catch (err) {
      setError(err.response?.data?.error || 'M-Pesa deposit failed. Please try again.');
    } finally {
      setProcessingDeposit(false);
    }
  };

  // Check M-Pesa transaction status
  const checkTransactionStatus = async (requestId) => {
    if (!requestId || checkingStatus) return;
    
    setCheckingStatus(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`http://localhost:4000/api/mpesa/transaction-status/${requestId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data.success) {
        // Transaction successful
        setSuccess('Payment completed successfully!');
        fetchWalletData(); // Refresh wallet data
        setCurrentTransaction(null);
      } else if (res.data.resultCode === '1032') {
        // Transaction cancelled by user
        setError('Transaction was cancelled or timed out.');
        setCurrentTransaction(prev => prev ? {...prev, status: 'failed'} : null);
      } else if (res.data.resultCode !== '2001') { // Not 'pending'
        // Failed with other error
        setError(`Transaction failed: ${res.data.status}`);
        setCurrentTransaction(prev => prev ? {...prev, status: 'failed'} : null);
      } else {
        // Still pending, check again in 5 seconds
        setTimeout(() => checkTransactionStatus(requestId), 5000);
      }
    } catch (err) {
      console.error('Error checking transaction status:', err);
      // Still try again in 5 seconds if we have a current transaction
      if (currentTransaction) {
        setTimeout(() => checkTransactionStatus(requestId), 5000);
      }
    } finally {
      setCheckingStatus(false);
    }
  };

  // Handle standard (simulated) deposit
  const handleStandardDeposit = async () => {
    setError('');
    setSuccess('');
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      return setError('Please enter a valid deposit amount');
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
      if (updateUserBalance) updateUserBalance(newBalance);
      fetchTransactions();
    } catch (err) {
      setError(err.response?.data?.error || 'Deposit failed.');
    }
  };

  // Handle withdrawal
  const handleWithdraw = async () => {
    setError('');
    setSuccess('');
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      return setError('Please enter a valid withdrawal amount');
    }
    if (amount > balance) {
      return setError('Insufficient balance');
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
      if (updateUserBalance) updateUserBalance(newBalance);
      fetchTransactions();
    } catch (err) {
      setError(err.response?.data?.error || 'Withdrawal failed.');
    }
  };

  // Force refresh wallet data
  const refreshWallet = () => {
    fetchWalletData();
    setSuccess('Wallet data refreshed');
  };

  // Format date for readability
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

  // Get appropriate icon for transaction type
  const getTransactionIcon = (type) => {
    switch (type) {
      case 'deposit': return <ArrowUpCircle size={20} className="transaction-icon deposit" />;
      case 'withdrawal': return <ArrowDownCircle size={20} className="transaction-icon withdrawal" />;
      case 'bet': return <DollarSign size={20} className="transaction-icon bet" />;
      case 'win': return <DollarSign size={20} className="transaction-icon win" />;
      default: return <Clock size={20} className="transaction-icon" />;
    }
  };

  // Render deposit tab form
  const renderDepositForm = () => (
    <div className="deposit-form">
      <h3>Deposit Funds</h3>
      
      {currentTransaction && currentTransaction.status === 'pending' ? (
        <div className="pending-transaction">
          <h4>Pending M-Pesa Transaction</h4>
          <p>Amount: ${parseFloat(currentTransaction.amount).toFixed(2)}</p>
          <p>Status: {checkingStatus ? 'Checking status...' : 'Waiting for confirmation'}</p>
          <div className="transaction-actions">
            <button 
              className="check-status-button" 
              onClick={() => checkTransactionStatus(currentTransaction.request_id)}
              disabled={checkingStatus}
            >
              {checkingStatus ? <RefreshCw size={16} className="spin" /> : 'Check Status'}
            </button>
            <button className="refresh-button" onClick={refreshWallet}>
              Refresh Wallet
            </button>
          </div>
          <p className="note">Note: If you've already completed the payment on your phone, click "Refresh Wallet" to update your balance.</p>
        </div>
      ) : (
        <>
          <div className="payment-method-selector">
            <label>Select Payment Method:</label>
            <div className="method-options">
              <button 
                className={`method-option ${depositMethod === 'mpesa' ? 'active' : ''}`} 
                onClick={() => setDepositMethod('mpesa')}
              >
                <Smartphone size={18} /> M-Pesa
              </button>
              <button 
                className={`method-option ${depositMethod === 'card' ? 'active' : ''}`} 
                onClick={() => setDepositMethod('card')}
              >
                <CreditCard size={18} /> Card
              </button>
            </div>
          </div>

          {depositMethod && (
            <div className="method-details">
              <div className="form-group">
                <label>Amount</label>
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input 
                    type="number" 
                    value={depositAmount} 
                    onChange={(e) => setDepositAmount(e.target.value)} 
                    min="1" 
                    step="0.01" 
                    placeholder="Enter amount" 
                  />
                </div>
              </div>

              {depositMethod === 'mpesa' && (
                <>
                  <div className="form-group">
                    <label>M-Pesa Phone Number</label>
                    <div className="input-with-icon">
                      <Phone size={18} className="input-icon" />
                      <input 
                        type="text" 
                        value={mpesaPhone} 
                        onChange={(e) => setMpesaPhone(e.target.value)} 
                        placeholder="e.g. 0712345678" 
                      />
                    </div>
                    <div className="input-hint">Enter your phone number in format: 07XXXXXXXX</div>
                  </div>
                  <p className="form-note">You'll receive an M-Pesa payment prompt on your phone to complete the transaction.</p>
                </>
              )}

              {depositMethod === 'card' && (
                <p className="form-note">This is a simulated deposit for demonstration purposes.</p>
              )}

              <button 
                className="deposit-button" 
                onClick={handleDeposit} 
                disabled={
                  processingDeposit || 
                  !depositAmount || 
                  (depositMethod === 'mpesa' && !mpesaPhone)
                }
              >
                {processingDeposit ? 'Processing...' : 'Deposit Funds'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  // Render withdraw tab form
  const renderWithdrawForm = () => (
    <div className="withdraw-form">
      <h3>Withdraw Funds</h3>
      <div className="form-group">
        <label>Amount</label>
        <div className="input-with-prefix">
          <span className="input-prefix">$</span>
          <input 
            type="number" 
            value={withdrawAmount} 
            onChange={(e) => setWithdrawAmount(e.target.value)} 
            min="1" 
            max={balance} 
            step="0.01" 
            placeholder="Enter withdrawal amount" 
          />
        </div>
        <div className="input-hint">Available balance: ${balance.toFixed(2)}</div>
      </div>
      <button 
        className="withdraw-button" 
        onClick={handleWithdraw} 
        disabled={
          !withdrawAmount || 
          parseFloat(withdrawAmount) <= 0 || 
          parseFloat(withdrawAmount) > balance
        }
      >
        Withdraw Funds
      </button>
    </div>
  );

  // Loading state
  if (loading) return <div className="wallet-loading">Loading wallet...</div>;

  return (
    <div className="wallet-container">
      <h2>Your Wallet</h2>

      <div className="balance-display">
        <h3>Current Balance</h3>
        <div className="balance-amount">${balance.toFixed(2)}</div>
        <button className="refresh-balance" onClick={refreshWallet} title="Refresh wallet data">
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div className="alert alert-danger">
          <X size={20} />
          <span>{error}</span>
        </div>
      )}
      
      {success && (
        <div className="alert alert-success">
          <Check size={20} />
          <span>{success}</span>
        </div>
      )}

      <div className="wallet-tabs">
        <button 
          className={`tab-button ${activeTab === 'deposit' ? 'active' : ''}`} 
          onClick={() => setActiveTab('deposit')}
        >
          <ArrowUpCircle size={18} /> Deposit
        </button>
        <button 
          className={`tab-button ${activeTab === 'withdraw' ? 'active' : ''}`} 
          onClick={() => setActiveTab('withdraw')}
        >
          <ArrowDownCircle size={18} /> Withdraw
        </button>
      </div>

      <div className="wallet-tab-content">
        {activeTab === 'deposit' && renderDepositForm()}
        {activeTab === 'withdraw' && renderWithdrawForm()}
      </div>

      <div className="transaction-history-section">
        <h3>Transaction History</h3>

        {transactionsLoading ? (
          <div className="loading-transactions">
            <RefreshCw size={24} className="spin" />
            <span>Loading transactions...</span>
          </div>
        ) : transactions.length > 0 ? (
          <>
            <div className="transaction-list">
              {transactions.map(t => (
                <div key={t.transaction_id} className={`transaction ${t.status}`}>
                  <div className="transaction-left">
                    {getTransactionIcon(t.transaction_type)}
                    <div className="transaction-details">
                      <div className="transaction-type-label">
                        {t.transaction_type.charAt(0).toUpperCase() + t.transaction_type.slice(1)}
                        {t.description && t.description.includes('M-Pesa') && ' (M-Pesa)'}
                      </div>
                      <div className="transaction-date">{formatDate(t.created_at)}</div>
                    </div>
                  </div>
                  <div className="transaction-right">
                    <div className={`transaction-amount ${t.transaction_type}`}>
                      {['deposit', 'win'].includes(t.transaction_type) ? '+' : '-'}
                      ${parseFloat(t.amount).toFixed(2)}
                    </div>
                    <div className={`transaction-status status-${t.status}`}>
                      {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                    </div>
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
          <div className="no-transactions">No transactions found.</div>
        )}
      </div>
    </div>
  );
};

export default WalletComponent;