import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import apiClient from '../utils/api';
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
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Clock as ClockIcon,
  XCircle,
  CheckCircle
} from 'lucide-react';
import '../style/WalletComponent.css';

const WalletComponent = () => {
  const context = useContext(AuthContext) || {};
  const { user, updateUserBalance, isAuthenticated } = context;

  const [balance, setBalance] = useState(0);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [pendingTransactions, setPendingTransactions] = useState([]);
  const [pendingExpanded, setPendingExpanded] = useState(true);

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasMore: false
  });

  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('deposit');
  const [depositMethod, setDepositMethod] = useState(null);
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [processingDeposit, setProcessingDeposit] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);

  const navigate = useNavigate();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Load wallet data on component mount
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchWalletData();

    // Set up interval to check for pending transactions every 30 seconds
    const interval = setInterval(() => {
      fetchPendingTransactions();
    }, 30000);

    // Clean up interval on unmount
    return () => clearInterval(interval);
  }, [isAuthenticated, user]);

  // Function to fetch wallet balance and transaction data
  const fetchWalletData = async () => {
    try {
      setLoading(true);
      // Get balance from user context if available, otherwise fetch it
      if (user) {
        setBalance(parseFloat(user.balance) || 0);
      } else {
        const res = await apiClient.get('/api/wallet/balance');
        setBalance(parseFloat(res.data.balance) || 0);
      }
      setLoading(false);

      // Always fetch transactions and pending transactions
      fetchTransactions();
      fetchPendingTransactions();
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
      const res = await apiClient.get(`/api/wallet/transactions?page=${page}&limit=10`);

      setTransactions(res.data.transactions);
      setPagination(res.data.pagination);
      setTransactionsLoading(false);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setTransactionsLoading(false);
    }
  };

  // Function to fetch pending M-Pesa transactions
  const fetchPendingTransactions = async () => {
    try {
      setPendingLoading(true);
      const res = await apiClient.get('/api/mpesa/pending-transactions');

      setPendingTransactions(res.data.transactions || []);
      setPendingLoading(false);

      // If we have new completed transactions, refresh the balance
      const hasPendingCompleted = res.data.transactions.some(t =>
        t.stk_status === 'completed' && t.transaction_status !== 'completed'
      );

      if (hasPendingCompleted) {
        refreshBalance();
      }
    } catch (err) {
      console.error('Error fetching pending transactions:', err);
      setPendingLoading(false);
    }
  };

  // Handle page change for transaction history
  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, currentPage: newPage }));
      fetchTransactions(newPage);
    }
  };

  // Refresh just the balance
  const refreshBalance = async () => {
    try {
      const res = await apiClient.get('/api/wallet/balance');

      const newBalance = parseFloat(res.data.balance) || 0;
      setBalance(newBalance);

      // Update in auth context if available
      if (updateUserBalance) {
        updateUserBalance(newBalance);
      }
    } catch (err) {
      console.error('Error refreshing balance:', err);
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
      const res = await apiClient.post('/api/mpesa/stk-push',
        { amount, phoneNumber: mpesaPhone }
      );

      // Set success message with transaction ID
      setSuccess('M-Pesa payment request sent! Check your phone to complete the transaction.');

      // Reset form
      setDepositAmount('');
      setMpesaPhone('');

      // Refresh pending transactions list to show the new one
      fetchPendingTransactions();
    } catch (err) {
      setError(err.response?.data?.error || 'M-Pesa deposit failed. Please try again.');
    } finally {
      setProcessingDeposit(false);
    }
  };

  // Check transaction status
  const checkTransactionStatus = async (checkoutRequestId, transactionId) => {
    try {
      // Find the transaction in the pendingTransactions array
      const transaction = pendingTransactions.find(tx => tx.transaction_id === transactionId);
      if (!transaction) return;

      // Update the transaction's checking status
      setPendingTransactions(prev => prev.map(tx =>
        tx.transaction_id === transactionId
          ? { ...tx, isChecking: true }
          : tx
      ));

      const res = await apiClient.get(`/api/mpesa/transaction-status/${checkoutRequestId}`);

      // Update the transaction status in the list
      setPendingTransactions(prev => prev.map(tx =>
        tx.transaction_id === transactionId
          ? {
            ...tx,
            isChecking: false,
            stk_status: res.data.transaction.stkStatus,
            transaction_status: res.data.transaction.status,
            result_desc: res.data.description
          }
          : tx
      ));

      // If transaction is now completed, refresh balance and transactions
      if (res.data.transaction.stkStatus === 'completed') {
        setSuccess('Payment completed successfully!');
        refreshBalance();
        fetchTransactions();

        // Remove from pending after a short delay
        setTimeout(() => {
          setPendingTransactions(prev =>
            prev.filter(tx => tx.transaction_id !== transactionId)
          );
        }, 5000);
      } else if (['failed', 'canceled', 'timeout'].includes(res.data.transaction.stkStatus)) {
        setError(`Transaction ${res.data.transaction.stkStatus}: ${res.data.description}`);
      }
    } catch (err) {
      console.error('Error checking transaction status:', err);

      // Update transaction to reflect the error
      setPendingTransactions(prev => prev.map(tx =>
        tx.transaction_id === transactionId
          ? { ...tx, isChecking: false, error: err.message }
          : tx
      ));
    }
  };

  // Cancel a transaction
  const cancelTransaction = async (transactionId) => {
    try {
      await apiClient.post(`/api/mpesa/cancel-transaction/${transactionId}`, {});

      // Update the transaction in the list
      setPendingTransactions(prev => prev.map(tx =>
        tx.transaction_id === transactionId
          ? { ...tx, stk_status: 'canceled', transaction_status: 'failed' }
          : tx
      ));

      setSuccess('Transaction cancelled successfully');

      // Remove from pending after a short delay
      setTimeout(() => {
        setPendingTransactions(prev =>
          prev.filter(tx => tx.transaction_id !== transactionId)
        );
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel transaction');
    }
  };

  // Check all pending transactions at once
  const checkAllPendingTransactions = async () => {
    try {
      setCheckingAll(true);
      await apiClient.post('/api/mpesa/check-pending', {});

      // Refresh data
      refreshBalance();
      fetchTransactions();
      fetchPendingTransactions();

      setSuccess('All pending transactions checked');
    } catch (err) {
      setError('Failed to check all transactions');
    } finally {
      setCheckingAll(false);
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
      const res = await apiClient.post('/api/wallet/deposit',
        { amount }
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
      const res = await apiClient.post('/api/wallet/withdraw',
        { amount }
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

  // Format time remaining for transaction
  const formatTimeRemaining = (expiresAt) => {
    const expires = new Date(expiresAt);
    const now = new Date();

    if (expires <= now) {
      return 'Expired';
    }

    const secondsRemaining = Math.floor((expires - now) / 1000);
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;

    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
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

  // Get status icon for pending transaction
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={18} className="status-icon completed" />;
      case 'failed':
        return <XCircle size={18} className="status-icon failed" />;
      case 'canceled':
        return <XCircle size={18} className="status-icon canceled" />;
      case 'timeout':
        return <ClockIcon size={18} className="status-icon timeout" />;
      default:
        return <Clock size={18} className="status-icon pending" />;
    }
  };

  const renderPendingTransactions = () => {
    if (pendingTransactions.length === 0) {
      return null;
    }

    return (
      <div className="pending-transactions-section">
        <div
          className="section-header"
          onClick={() => setPendingExpanded(!pendingExpanded)}
        >
          <div className="section-title">
            <Clock size={20} />
            <h3>PENDING TOP UPS</h3>
            <span className="transaction-count">{pendingTransactions.length}</span>
          </div>
          <div className="header-right">
            <button
              className="check-all-button"
              onClick={(e) => {
                e.stopPropagation();
                checkAllPendingTransactions();
              }}
              disabled={checkingAll || pendingTransactions.length === 0}
            >
              <RefreshCw size={16} className={checkingAll ? 'spin' : ''} />
              <span>REFRESH ALL</span>
            </button>
            {pendingExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>

        {pendingExpanded && (
          <>


            <div className="pending-list">
              {pendingTransactions.map(transaction => {
                const isExpired = new Date(transaction.expires_at) < new Date();
                const isPending = ['initiated', 'delivered'].includes(transaction.stk_status);

                return (
                  <div
                    key={transaction.transaction_id}
                    className={`pending-transaction-card ${transaction.stk_status}`}
                  >
                    <div className="card-header">
                      <div className="transaction-status-wrapper">
                        {getStatusIcon(transaction.stk_status)}
                        <span className="transaction-status-text">
                          {transaction.stk_status.toUpperCase()}
                        </span>
                      </div>
                      <div className="transaction-amount">
                        ${parseFloat(transaction.amount).toFixed(2)}
                      </div>
                    </div>

                    <div className="card-details">
                      <div className="detail-row">
                        <span className="detail-label">PHONE:</span>
                        <span className="detail-value">{transaction.phone_number}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">TIMESTAMP:</span>
                        <span className="detail-value">{formatDate(transaction.created_at)}</span>
                      </div>
                      {isPending && !isExpired && (
                        <div className="detail-row">
                          <span className="detail-label">EXPIRES:</span>
                          <span className="detail-value countdown">{formatTimeRemaining(transaction.expires_at)}</span>
                        </div>
                      )}
                      {transaction.result_desc && (
                        <div className="detail-row">
                          <span className="detail-label">STATUS:</span>
                          <span className="detail-value">{transaction.result_desc}</span>
                        </div>
                      )}
                    </div>

                    <div className="card-actions">
                      {isPending && !isExpired && (
                        <>
                          <button
                            className="check-button"
                            onClick={() => checkTransactionStatus(transaction.checkout_request_id, transaction.transaction_id)}
                            disabled={transaction.isChecking}
                          >
                            {transaction.isChecking ?
                              <RefreshCw size={18} className="spin" /> :
                              <RefreshCw size={18} />
                            }
                            REFRESH
                          </button>
                          <button
                            className="cancel-button"
                            onClick={() => cancelTransaction(transaction.transaction_id)}
                          >
                            <X size={18} />
                            CANCEL
                          </button>
                        </>
                      )}
                      {(isExpired || ['failed', 'canceled', 'timeout'].includes(transaction.stk_status)) && (
                        <button
                          className="minimal-close-button"
                          onClick={() => setPendingTransactions(prev =>
                            prev.filter(t => t.transaction_id !== transaction.transaction_id)
                          )}
                          title="Dismiss"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  // Render deposit tab form
  const renderDepositForm = () => (
    <div className="deposit-form">
      <div className="payment-method-selector">
        <label>PAYMENT METHOD</label>
        <div className="method-options">
          <button
            className={`method-option ${depositMethod === 'mpesa' ? 'active' : ''}`}
            onClick={() => setDepositMethod('mpesa')}
          >
            <Smartphone size={20} /> M-PESA
          </button>
          <button
            className={`method-option ${depositMethod === 'card' ? 'active' : ''}`}
            onClick={() => setDepositMethod('card')}
          >
            <CreditCard size={20} /> CARD
          </button>
        </div>
      </div>

      {depositMethod && (
        <div className="method-details">
          <div className="form-group">
            <label>AMOUNT</label>
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
                <label>M-PESA PHONE NUMBER</label>
                <div className="input-with-icon">
                  <Phone size={20} className="input-icon" />
                  <input
                    type="text"
                    value={mpesaPhone}
                    onChange={(e) => setMpesaPhone(e.target.value)}
                    placeholder="e.g. 0712345678"
                  />
                </div>
                <div className="input-hint">FORMAT: 07XXXXXXXX</div>
              </div>
              <p className="form-note">You'll receive an M-Pesa payment prompt on your device to finalize the top up.</p>
            </>
          )}

          {depositMethod === 'card' && (
            <p className="form-note">Simulation Mode: Credits will be added instantly for testing.</p>
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
            {processingDeposit ? 'PROCESSING...' : 'CONFIRM TOP UP'}
          </button>
        </div>
      )}
    </div>
  );

  // Render withdraw tab form
  const renderWithdrawForm = () => (
    <div className="withdraw-form">
      <h3>WITHDRAW FUNDS</h3>
      <div className="form-group">
        <label>AMOUNT</label>
        <div className="input-with-prefix">
          <span className="input-prefix">$</span>
          <input
            type="number"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            min="1"
            max={balance}
            step="0.01"
            placeholder="Enter extraction amount"
          />
        </div>
        <div className="input-hint">AVAILABLE: ${(parseFloat(balance) || 0).toFixed(2)}</div>
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
        CONFIRM WITHDRAWAL
      </button>
    </div>
  );

  // Loading state
  if (loading) return <div className="wallet-loading">Loading wallet...</div>;

  return (
    <div className="wallet-container">
      <h2>WALLET ARSENAL</h2>

      <div className="balance-display">
        <h3>Current Balance</h3>
        <div className="balance-amount">${(parseFloat(balance) || 0).toFixed(2)}</div>
        <button className="refresh-balance" onClick={refreshWallet} title="Refresh balance">
          <RefreshCw size={18} />
        </button>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <Check size={20} />
          <span>{success}</span>
        </div>
      )}

      {/* Render pending transactions section first */}
      {renderPendingTransactions()}

      <div className="wallet-tabs">
        <button
          className={`tab-button ${activeTab === 'deposit' ? 'active' : ''}`}
          onClick={() => setActiveTab('deposit')}
        >
          <ArrowUpCircle size={20} /> TOP UP
        </button>
        <button
          className={`tab-button ${activeTab === 'withdraw' ? 'active' : ''}`}
          onClick={() => setActiveTab('withdraw')}
        >
          <ArrowDownCircle size={20} /> WITHDRAW
        </button>
      </div>

      <div className="wallet-tab-content">
        {activeTab === 'deposit' && renderDepositForm()}
        {activeTab === 'withdraw' && renderWithdrawForm()}
      </div>

      <div className="transaction-history-section">
        <h3>TRANSACTION HISTORY</h3>

        {transactionsLoading ? (
          <div className="loading-transactions">
            <RefreshCw size={32} className="spin" />
            <span>Syncing combat logs...</span>
          </div>
        ) : transactions.length > 0 ? (
          <>
            <div className="transaction-list">
              {transactions.map(t => (
                <div key={t.transaction_id} className={`transaction ${t.status}`}>
                  <div className="transaction-left">
                    <div className={`transaction-icon ${t.transaction_type}`}>
                      {getTransactionIcon(t.transaction_type)}
                    </div>
                    <div className="transaction-details">
                      <div className="transaction-type-label">
                        {t.transaction_type === 'deposit' ? 'TOP UP' :
                          t.transaction_type === 'withdrawal' ? 'WITHDRAWAL' :
                            t.transaction_type.toUpperCase()}
                        {t.description && t.description.includes('M-Pesa') && ' [M-PESA]'}
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
                      {t.status.toUpperCase()}
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
                PREVIOUS
              </button>
              <span className="pagination-info">
                LOG {pagination.currentPage} / {pagination.totalPages || 1}
              </span>
              <button
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={!pagination.hasMore}
                className="pagination-button"
              >
                NEXT
              </button>
            </div>
          </>
        ) : (
          <div className="no-transactions">NO COMBAT LOGS FOUND.</div>
        )}
      </div>
    </div>
  );
};

export default WalletComponent;