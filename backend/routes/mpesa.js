// backend/routes/mpesa.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');
const mpesaService = require('../services/mpesa');
const pool = require('../config/db');

// Initiate STK Push
router.post('/stk-push', authenticateToken, async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;
    const userId = req.user.userId;
    
    console.log('Received phone number:', phoneNumber);
    console.log('Received amount:', amount);
    
    // Validate input
    if (!phoneNumber || !amount) {
      return res.status(400).json({ error: 'Phone number and amount are required' });
    }

    // Validate phone number format (start with 0 followed by 9 digits)
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({ error: 'Phone number must be 10 digits and start with 0 (format: 07XXXXXXXX)' });
    }
    
    // Validate amount
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount < 10) {
      return res.status(400).json({ error: 'Minimum deposit amount is 10' });
    }
    
    // Generate a unique reference
    const accountReference = `STAKEOUT${userId}${Date.now().toString().slice(-6)}`;
    
    // Initiate STK Push
    const response = await mpesaService.initiateSTKPush(
      phoneNumber, 
      numericAmount,
      accountReference
    );
    
    // Check if STK push was successful
    if (response.ResponseCode !== '0') {
      return res.status(400).json({ 
        error: response.ResponseDescription || 'Failed to initiate payment' 
      });
    }
    
    // Save transaction record
    const transactionId = await mpesaService.saveTransaction(
      userId,
      response.CheckoutRequestID,
      numericAmount,
      phoneNumber
    );
    
    // Clean up any expired transactions
    await mpesaService.cleanupExpiredTransactions();
    
    res.json({
      success: true,
      message: 'Please check your phone to complete the transaction',
      requestId: response.CheckoutRequestID,
      transactionId: transactionId,
      amount: numericAmount,
      phoneNumber: phoneNumber,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
    });
    
  } catch (error) {
    console.error('STK Push error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to initiate payment'
    });
  }
});

// Callback URL for M-Pesa
router.post('/callback', async (req, res) => {
  try {
    console.log('M-Pesa Callback received at:', new Date().toISOString());
    console.log('Callback Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Callback Body:', JSON.stringify(req.body, null, 2));
    
    // Validate the callback data structure
    if (!req.body || !req.body.Body) {
      console.error('Invalid callback data received - missing Body');
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid callback data structure' 
      });
    }
    
    // Process the callback
    const result = await mpesaService.processCallback(req.body);
    
    console.log('Callback processing result:', result);
    
    // Always return 200 to Safaricom, even on errors
    // This prevents them from retrying the callback which could lead to duplicate processing
    res.status(200).json({ 
      success: true,
      message: "Callback received and processed" 
    });
  } catch (error) {
    console.error('Critical error in callback processing:', error);
    // Still return 200 to prevent retries
    res.status(200).json({ 
      success: false, 
      message: "Callback received but had processing errors" 
    });
  }
});

// Check transaction status with M-Pesa API
router.get('/transaction-status/:requestId', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    // Validate request ID
    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required' });
    }
    
    // Query the M-Pesa API for status
    const statusResponse = await mpesaService.querySTKStatus(requestId);
    
    // Get updated transaction details from database after the query
    const result = await pool.query(
      `SELECT 
        t.transaction_id, 
        t.amount, 
        t.status as transaction_status, 
        t.created_at,
        m.checkout_request_id, 
        m.phone_number, 
        m.stk_status, 
        m.result_desc,
        m.expires_at,
        m.retry_count
      FROM transactions t
      JOIN mpesa_transactions m ON t.transaction_id = m.transaction_id
      WHERE m.checkout_request_id = $1`,
      [requestId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const transaction = result.rows[0];
    
    // Process the response
    return res.json({
      success: statusResponse.ResponseCode === '0',
      status: transaction.stk_status,
      description: statusResponse.ResultDesc || transaction.result_desc,
      requestId: requestId,
      resultCode: statusResponse.ResponseCode,
      transaction: {
        id: transaction.transaction_id,
        amount: transaction.amount,
        status: transaction.transaction_status,
        stkStatus: transaction.stk_status,
        createdAt: transaction.created_at,
        expiresAt: transaction.expires_at,
        retryCount: transaction.retry_count
      }
    });
  } catch (error) {
    console.error('Transaction status check error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to check transaction status'
    });
  }
});

// Get all pending transactions for the current user
router.get('/pending-transactions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // First clean up any expired transactions
    await mpesaService.cleanupExpiredTransactions();
    
    // Get pending transactions
    const pendingTransactions = await mpesaService.getPendingTransactionsForUser(userId);
    
    res.json({
      success: true,
      count: pendingTransactions.length,
      transactions: pendingTransactions
    });
  } catch (error) {
    console.error('Error fetching pending transactions:', error);
    res.status(500).json({ error: 'Failed to fetch pending transactions' });
  }
});

// Cancel a pending transaction
router.post('/cancel-transaction/:transactionId', authenticateToken, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.userId;
    
    // Validate transaction ID
    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }
    
    // Cancel the transaction
    const result = await mpesaService.cancelTransaction(parseInt(transactionId), userId);
    
    res.json({
      success: true,
      message: 'Transaction cancelled successfully'
    });
  } catch (error) {
    console.error('Transaction cancellation error:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to cancel transaction'
    });
  }
});

// Get transaction details
router.get('/transaction/:id', authenticateToken, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const userId = req.user.userId;
    
    const result = await pool.query(
      `SELECT 
        t.transaction_id, 
        t.amount, 
        t.status as transaction_status, 
        t.created_at,
        t.updated_at,
        m.checkout_request_id, 
        m.phone_number, 
        m.stk_status, 
        m.result_desc,
        m.expires_at,
        m.retry_count,
        m.mpesa_receipt_number
      FROM transactions t
      JOIN mpesa_transactions m ON t.transaction_id = m.transaction_id
      WHERE t.transaction_id = $1 AND t.user_id = $2`,
      [transactionId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Check if transaction is expired
    const transaction = result.rows[0];
    const isExpired = new Date(transaction.expires_at) < new Date();
    
    // If expired but not marked as timeout, update it
    if (isExpired && ['initiated', 'delivered'].includes(transaction.stk_status)) {
      await mpesaService.cleanupExpiredTransactions();
      
      // Fetch updated transaction details
      const updatedResult = await pool.query(
        `SELECT 
          t.status as transaction_status, 
          m.stk_status
        FROM transactions t
        JOIN mpesa_transactions m ON t.transaction_id = m.transaction_id
        WHERE t.transaction_id = $1`,
        [transactionId]
      );
      
      if (updatedResult.rows.length > 0) {
        transaction.transaction_status = updatedResult.rows[0].transaction_status;
        transaction.stk_status = updatedResult.rows[0].stk_status;
      }
    }
    
    res.json({
      transaction: {
        id: transaction.transaction_id,
        amount: transaction.amount,
        status: transaction.transaction_status,
        stkStatus: transaction.stk_status,
        createdAt: transaction.created_at,
        updatedAt: transaction.updated_at,
        checkoutRequestId: transaction.checkout_request_id,
        phoneNumber: transaction.phone_number,
        resultDesc: transaction.result_desc,
        expiresAt: transaction.expires_at,
        isExpired,
        retryCount: transaction.retry_count,
        receiptNumber: transaction.mpesa_receipt_number
      }
    });
  } catch (error) {
    console.error('Transaction fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction details' });
  }
});

// Manually check all pending transactions
router.post('/check-pending', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // First clean up expired transactions
    await mpesaService.cleanupExpiredTransactions();
    
    // Get all pending transactions
    const pendingTransactions = await mpesaService.getPendingTransactionsForUser(userId);
    
    // Check status for each transaction
    const results = [];
    for (const transaction of pendingTransactions) {
      try {
        if (new Date(transaction.expires_at) > new Date()) {
          // Only check unexpired transactions
          const statusResponse = await mpesaService.querySTKStatus(transaction.checkout_request_id);
          results.push({
            transactionId: transaction.transaction_id,
            status: transaction.stk_status,
            resultCode: statusResponse.ResponseCode,
            resultDesc: statusResponse.ResultDesc
          });
        }
      } catch (error) {
        console.error(`Error checking transaction ${transaction.transaction_id}:`, error);
        results.push({
          transactionId: transaction.transaction_id,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      checkedCount: results.length,
      results
    });
  } catch (error) {
    console.error('Error checking pending transactions:', error);
    res.status(500).json({ error: 'Failed to check pending transactions' });
  }
});

module.exports = router;