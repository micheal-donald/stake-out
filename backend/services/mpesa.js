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
    this.baseUrl = process.env.MPESA_API_URL;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    // Return existing token if valid
    if (this.accessToken && this.tokenExpiry && moment().isBefore(this.tokenExpiry)) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = moment().add(1, 'hour');
      return this.accessToken;
    } catch (error) {
      console.error('Error getting M-Pesa access token:', error);
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
      const token = await this.getAccessToken();
      const timestamp = moment().format('YYYYMMDDHHmmss');
      const password = this.generatePassword(timestamp);

      // Format phone number (remove leading 0 or +254 and prepend 254)
      const formattedPhone = phoneNumber.replace(/^(0|\+254)/, '254');

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: this.shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: amount,
          PartyA: formattedPhone,
          PartyB: this.shortcode,
          PhoneNumber: formattedPhone,
          CallBackURL: this.callbackUrl,
          AccountReference: accountReference,
          TransactionDesc: 'Stake Out Bet Deposit'
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('STK Push error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.errorMessage || 'Failed to initiate payment');
    }
  }

  async saveTransaction(userId, checkoutRequestId, amount, phoneNumber, status = 'pending') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Save to transactions table
      const result = await client.query(
        `INSERT INTO transactions 
        (user_id, transaction_type, amount, status, reference_id, description) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING transaction_id`,
        [userId, 'deposit', amount, status, checkoutRequestId, `M-Pesa deposit from ${phoneNumber}`]
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
    const client = await pool.connect();
    try {
      const Body = callbackData.Body;
      const stkCallback = Body.stkCallback;
      const checkoutRequestId = stkCallback.CheckoutRequestID;
      
      // Find transaction by checkoutRequestId
      const transactionResult = await client.query(
        'SELECT transaction_id, user_id, amount FROM transactions WHERE reference_id = $1',
        [checkoutRequestId]
      );
      
      if (transactionResult.rows.length === 0) {
        throw new Error('Transaction not found');
      }
      
      const transaction = transactionResult.rows[0];
      const userId = transaction.user_id;
      const amount = parseFloat(transaction.amount);
      
      await client.query('BEGIN');

      if (stkCallback.ResultCode === 0) {
        // Success - update transaction status and add to user balance
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
        // Failed - update transaction status
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
      const token = await this.getAccessToken();
      const timestamp = moment().format('YYYYMMDDHHmmss');
      const password = this.generatePassword(timestamp);
  
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
  
      return response.data;
    } catch (error) {
      console.error('STK Query error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.errorMessage || 'Failed to query transaction status');
    }
  }
}

module.exports = new MpesaService();