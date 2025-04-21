// backend/services/mpesa.js
const axios = require('axios');
const moment = require('moment');
const pool = require('../config/db');

class MpesaService {
  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.shortcode = process.env.MPESA_SHORTCODE;
    this.passkey = process.env.MPESA_PASSKEY;
    this.callbackUrl = process.env.MPESA_CALLBACK_URL;
    this.baseUrl = process.env.MPESA_API_URL || 'https://api.safaricom.co.ke';
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    // Check if we have a valid token already
    if (this.accessToken && this.tokenExpiry && moment().isBefore(this.tokenExpiry)) {
      return this.accessToken;
    }

    try {
      console.log('Requesting new M-Pesa access token...');
      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = moment().add(1, 'hour');
      console.log('M-Pesa token obtained successfully');
      return this.accessToken;
    } catch (error) {
      console.error('Error getting M-Pesa access token:', error.response?.data || error.message);
      throw new Error('Failed to get M-Pesa access token');
    }
  }

  generatePassword(timestamp) {
    const password = Buffer.from(
      `${this.shortcode}${this.passkey}${timestamp}`
    ).toString('base64');
    return password;
  }

  async initiateSTKPush(phoneNumber, amount, accountReference) {
    try {
      // Format phone number (ensure it's in the format 2547XXXXXXXX)
      let formattedPhone = phoneNumber;
      if (phoneNumber.startsWith('0')) {
        formattedPhone = '254' + phoneNumber.substring(1);
      } else if (phoneNumber.startsWith('+254')) {
        formattedPhone = phoneNumber.substring(1);
      }
      
      console.log(`Initiating STK Push to ${formattedPhone} for amount ${amount}`);
      
      // Get access token
      const token = await this.getAccessToken();
      
      // Generate timestamp and password
      const timestamp = moment().format('YYYYMMDDHHmmss');
      const password = this.generatePassword(timestamp);
      
      // Log the callback URL being used
      console.log(`Using callback URL: ${this.callbackUrl}`);
      
      // Prepare the request payload
      const payload = {
        BusinessShortCode: this.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: parseInt(amount), // Mpesa requires integer amount
        PartyA: formattedPhone,
        PartyB: this.shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: this.callbackUrl,
        AccountReference: accountReference,
        TransactionDesc: 'Stake Out Bet Deposit'
      };
      
      // Log the request payload for debugging
      console.log('STK Push request payload:', JSON.stringify(payload));

      // Make the API request
      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Log the response
      console.log('STK Push response:', response.data);
      
      // Return the response data
      return response.data;
    } catch (error) {
      console.error('STK Push error:', error.response?.data || error.message);
      
      // Throw a more informative error
      if (error.response && error.response.data) {
        throw new Error(
          error.response.data.errorMessage || 
          'Failed to initiate M-Pesa payment. Please try again.'
        );
      } else {
        throw new Error('Network error when connecting to M-Pesa. Please try again.');
      }
    }
  }

  async saveTransaction(userId, checkoutRequestId, amount, phoneNumber, status = 'pending') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Insert into transactions table
      const result = await client.query(
        `INSERT INTO transactions 
        (user_id, transaction_type, amount, status, reference_id, description) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING transaction_id`,
        [
          userId, 
          'deposit', 
          amount, 
          status, 
          checkoutRequestId, 
          `M-Pesa deposit from ${phoneNumber}`
        ]
      );
      
      await client.query('COMMIT');
      return result.rows[0].transaction_id;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error saving transaction:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async processCallback(callbackData) {
    console.log('Processing M-Pesa callback:', JSON.stringify(callbackData, null, 2));
    
    const client = await pool.connect();
    try {
      // Extract data from callback
      if (!callbackData.Body || !callbackData.Body.stkCallback) {
        throw new Error('Invalid callback data format');
      }
      
      const Body = callbackData.Body;
      const stkCallback = Body.stkCallback;
      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = stkCallback.ResultCode;
      
      // Find transaction by checkoutRequestId
      const transactionResult = await client.query(
        'SELECT transaction_id, user_id, amount FROM transactions WHERE reference_id = $1',
        [checkoutRequestId]
      );
      
      if (transactionResult.rows.length === 0) {
        console.error(`Transaction with reference ${checkoutRequestId} not found`);
        throw new Error('Transaction not found');
      }
      
      const transaction = transactionResult.rows[0];
      const userId = transaction.user_id;
      const amount = parseFloat(transaction.amount);
      
      await client.query('BEGIN');

      if (parseInt(resultCode) === 0) {
        console.log(`Transaction ${checkoutRequestId} completed successfully`);
        
        // Payment successful - update transaction status and user balance
        await client.query(
          'UPDATE transactions SET status = $1, updated_at = NOW() WHERE transaction_id = $2',
          ['completed', transaction.transaction_id]
        );
        
        // Update user balance
        await client.query(
          'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
          [amount, userId]
        );
        
        await client.query('COMMIT');
        return { success: true, message: 'Transaction completed successfully' };
      } else {
        console.log(`Transaction ${checkoutRequestId} failed with code ${resultCode}`);
        
        // Payment failed - update transaction status
        await client.query(
          'UPDATE transactions SET status = $1, updated_at = NOW() WHERE transaction_id = $2',
          ['failed', transaction.transaction_id]
        );
        
        await client.query('COMMIT');
        return { success: false, message: stkCallback.ResultDesc };
      }
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error processing callback:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async querySTKStatus(checkoutRequestId) {
    try {
      console.log(`Querying status for transaction ${checkoutRequestId}`);
      
      // Get access token
      const token = await this.getAccessToken();
      
      // Generate timestamp and password
      const timestamp = moment().format('YYYYMMDDHHmmss');
      const password = this.generatePassword(timestamp);
  
      // Make the API request
      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
        {
          BusinessShortCode: this.shortcode,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('STK Query response:', response.data);
      return response.data;
    } catch (error) {
      console.error('STK Query error:', error.response?.data || error.message);
      throw new Error(
        error.response?.data?.errorMessage || 
        'Failed to query transaction status'
      );
    }
  }
  
  // Method to update transaction status and user balance if needed
  async updateTransactionStatus(transactionId, status, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get transaction details
      const transactionResult = await client.query(
        'SELECT * FROM transactions WHERE transaction_id = $1',
        [transactionId]
      );
      
      if (transactionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('Transaction not found');
      }
      
      const transaction = transactionResult.rows[0];
      
      // Update transaction status
      await client.query(
        'UPDATE transactions SET status = $1, updated_at = NOW() WHERE transaction_id = $2',
        [status, transactionId]
      );
      
      // If status is completed and current status is not completed, update user balance
      if (status === 'completed' && transaction.status !== 'completed') {
        await client.query(
          'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
          [transaction.amount, userId]
        );
      }
      
      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating transaction:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new MpesaService();