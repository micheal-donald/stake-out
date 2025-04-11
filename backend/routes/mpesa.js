// backend/routes/mpesa.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');
const mpesaService = require('../services/mpesa');
const mpesaUrl = "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

// Initiate STK Push
router.post('/stk-push', authenticateToken, async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;
    const userId = req.user.userId;
    const phoneRegex = /^0\d{9}$/;
    console.log('Received phone number:', phoneNumber);
    console.log('Received amount:', amount);
    
    if (!phoneNumber || !amount) {
      return res.status(400).json({ error: 'Phone number and amount are required' });
    }

    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({ error: 'Phone number must be 10 digits and start with 0' });
    }
    
    if (amount < 1) {
      return res.status(400).json({ error: 'Minimum deposit amount is 10' });
    }
    
    // Generate a unique reference
    const accountReference = `STAKEOUT${userId}${Date.now().toString().slice(-6)}`;
    
    // Initiate STK Push
    const response = await mpesaService.initiateSTKPush(
      phoneNumber, 
      amount, 
      accountReference
    );
    
    // Save pending transaction
    const transactionId = await mpesaService.saveTransaction(
      userId,
      response.CheckoutRequestID,
      amount,
      phoneNumber
    );
    
    res.json({
      success: true,
      message: 'Please check your phone to complete the transaction',
      requestId: response.CheckoutRequestID,
      transactionId: transactionId
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
    await mpesaService.processCallback(req.body);
    console.log('Callback data:', req.body);
    console.log(JSON.stringify(req.body));
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Callback processing error:', error);
    res.status(500).json({ error: 'Failed to process callback' });
  }
});

// Check transaction status
router.get('/transaction/:id', authenticateToken, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const userId = req.user.userId;
    
    const result = await pool.query(
      'SELECT * FROM transactions WHERE transaction_id = $1 AND user_id = $2',
      [transactionId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json({
      transaction: result.rows[0]
    });
  } catch (error) {
    console.error('Transaction status error:', error);
    res.status(500).json({ error: 'Failed to check transaction status' });
  }
});

// Query STK transaction status
router.get('/transaction-status/:requestId', authenticateToken, async (req, res) => {
    try {
      const { requestId } = req.params;
      
      // Query the M-Pesa API for status
      const statusResponse = await mpesaService.querySTKStatus(requestId);
      
      // Process the response
      if (statusResponse.ResponseCode === '0') {
        // Success response
        return res.json({
          success: true,
          status: statusResponse.ResultDesc,
          requestId: requestId,
          resultCode: statusResponse.ResultCode
        });
      } else {
        // Failed or pending
        return res.json({
          success: false,
          status: statusResponse.ResultDesc,
          requestId: requestId,
          resultCode: statusResponse.ResultCode
        });
      }
    } catch (error) {
      console.error('Transaction status check error:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to check transaction status'
      });
    }
  });

  // Update transaction status
router.post('/update-transaction', authenticateToken, async (req, res) => {
    try {
      const { transactionId, status } = req.body;
      const userId = req.user.userId;
      
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Get transaction details
        const transactionResult = await client.query(
          'SELECT * FROM transactions WHERE transaction_id = $1 AND user_id = $2',
          [transactionId, userId]
        );
        
        if (transactionResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Transaction not found' });
        }
        
        const transaction = transactionResult.rows[0];
        
        // Update transaction status
        await client.query(
          'UPDATE transactions SET status = $1, updated_at = NOW() WHERE transaction_id = $2',
          [status, transactionId]
        );
        
        // If status is completed, update user balance
        if (status === 'completed') {
          // Update user balance
          await client.query(
            'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
            [transaction.amount, userId]
          );
        }
        
        await client.query('COMMIT');
        
        res.json({
          success: true,
          message: 'Transaction status updated',
          status: status
        });
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Transaction update error:', error);
      res.status(500).json({ error: 'Failed to update transaction status' });
    }
  });
module.exports = router;