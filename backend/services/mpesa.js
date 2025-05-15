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
    this.baseUrl = process.env.MPESA_API_URL || 'https://sandbox.safaricom.co.ke';
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
      
      const transactionId = result.rows[0].transaction_id;
      
      // Insert into mpesa_transactions table
      await client.query(
        `INSERT INTO mpesa_transactions 
        (transaction_id, checkout_request_id, phone_number, stk_status, last_query_time) 
        VALUES ($1, $2, $3, $4, $5)`,
        [
          transactionId,
          checkoutRequestId,
          phoneNumber,
          'initiated',
          new Date()
        ]
      );
      
      await client.query('COMMIT');
      return transactionId;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error saving transaction:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async processCallback(callbackData) {
    console.log('Processing M-Pesa callback with data structure:', JSON.stringify(callbackData, null, 2));
    
    const client = await pool.connect();
    try {
      // Extract data from callback
      if (!callbackData.Body || !callbackData.Body.stkCallback) {
        throw new Error('Invalid callback data format - missing Body.stkCallback');
      }
      
      const Body = callbackData.Body;
      const stkCallback = Body.stkCallback;
      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = stkCallback.ResultCode;
      
      console.log(`Processing callback for checkout request ID: ${checkoutRequestId}`);
      console.log(`Result code: ${resultCode}`);
      
      // Find transaction by checkoutRequestId
      const transactionResult = await client.query(
        'SELECT transaction_id, user_id, amount FROM transactions WHERE reference_id = $1',
        [checkoutRequestId]
      );
      
      if (transactionResult.rows.length === 0) {
        console.error(`Transaction with reference ${checkoutRequestId} not found in database`);
        throw new Error('Transaction not found');
      }
      
      const transaction = transactionResult.rows[0];
      const userId = transaction.user_id;
      const amount = parseFloat(transaction.amount);
      
      console.log(`Found transaction ID: ${transaction.transaction_id} for user ID: ${userId}`);
      
      await client.query('BEGIN');
  
      if (parseInt(resultCode) === 0) {
        console.log(`Transaction ${checkoutRequestId} completed successfully`);
        
        // Extract additional details from the callback for better record-keeping
        let mpesaReceiptNumber = '';
        let phoneNumber = '';
        
        if (stkCallback.CallbackMetadata && stkCallback.CallbackMetadata.Item) {
          const metadata = stkCallback.CallbackMetadata.Item;
          
          const receiptItem = metadata.find(item => item.Name === 'MpesaReceiptNumber');
          if (receiptItem && receiptItem.Value) {
            mpesaReceiptNumber = receiptItem.Value;
          }
          
          const phoneItem = metadata.find(item => item.Name === 'PhoneNumber');
          if (phoneItem && phoneItem.Value) {
            phoneNumber = phoneItem.Value;
          }
        }
        
        console.log(`M-Pesa receipt number: ${mpesaReceiptNumber}`);
        
        // Update transaction status and store receipt number
        await client.query(
          'UPDATE transactions SET status = $1, updated_at = NOW(), description = CONCAT(description, \' | Receipt: \', $2) WHERE transaction_id = $3',
          ['completed', mpesaReceiptNumber, transaction.transaction_id]
        );
        
        // Try to insert into mpesa_transactions table if it exists (for detailed records)
        try {
          await client.query(
            `INSERT INTO mpesa_transactions (
              transaction_id, checkout_request_id, mpesa_receipt_number, 
              phone_number, transaction_date, result_code, 
              result_desc, raw_callback, stk_status
            ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
            ON CONFLICT (transaction_id) DO UPDATE SET
              mpesa_receipt_number = $3,
              result_code = $5,
              result_desc = $6,
              raw_callback = $7,
              stk_status = $8,
              transaction_date = NOW()`,
            [
              transaction.transaction_id,
              checkoutRequestId,
              mpesaReceiptNumber,
              phoneNumber,
              resultCode.toString(),
              stkCallback.ResultDesc,
              JSON.stringify(callbackData),
              'completed'
            ]
          );
        } catch (err) {
          // If the table doesn't exist, just log and continue
          console.log('Note: mpesa_transactions table may not exist:', err.message);
        }
        
        // Update user balance
        const userResult = await client.query(
          'UPDATE users SET balance = balance + $1 WHERE user_id = $2 RETURNING balance',
          [amount, userId]
        );
        
        await client.query('COMMIT');
        
        const newBalance = userResult.rows[0]?.balance || 0;
        console.log(`User ${userId} balance updated to ${newBalance}`);
        
        return { 
          success: true, 
          message: 'Transaction completed successfully',
          transactionId: transaction.transaction_id,
          newBalance
        };
      } else {
        console.log(`Transaction ${checkoutRequestId} failed with code ${resultCode} - ${stkCallback.ResultDesc}`);
        
        // Update transaction status
        await client.query(
          'UPDATE transactions SET status = $1, updated_at = NOW(), description = CONCAT(description, \' | Failed: \', $2) WHERE transaction_id = $3',
          ['failed', stkCallback.ResultDesc, transaction.transaction_id]
        );
        
        // Try to update mpesa_transactions table if it exists
        try {
          await client.query(
            `INSERT INTO mpesa_transactions (
              transaction_id, checkout_request_id, phone_number, 
              transaction_date, result_code, result_desc, 
              raw_callback, stk_status
            ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
            ON CONFLICT (transaction_id) DO UPDATE SET
              result_code = $4,
              result_desc = $5,
              raw_callback = $6,
              stk_status = $7,
              transaction_date = NOW()`,
            [
              transaction.transaction_id,
              checkoutRequestId,
              '',
              resultCode.toString(),
              stkCallback.ResultDesc,
              JSON.stringify(callbackData),
              'failed'
            ]
          );
        } catch (err) {
          console.log('Note: mpesa_transactions table may not exist:', err.message);
        }
        
        await client.query('COMMIT');
        
        return { 
          success: false, 
          message: stkCallback.ResultDesc,
          transactionId: transaction.transaction_id
        };
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
      
      // Update the transaction in the database
      await this.updateTransactionStatusFromQuery(checkoutRequestId, response.data);
      
      return response.data;
    } catch (error) {
      console.error('STK Query error:', error.response?.data || error.message);
      throw new Error(
        error.response?.data?.errorMessage || 
        'Failed to query transaction status'
      );
    }
  }
  
  async updateTransactionStatusFromQuery(checkoutRequestId, queryResult) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get the current transaction
      const transactionResult = await client.query(
        `SELECT 
          m.transaction_id, 
          t.user_id, 
          t.amount,
          t.status as transaction_status,
          m.stk_status,
          m.retry_count
        FROM mpesa_transactions m
        JOIN transactions t ON m.transaction_id = t.transaction_id
        WHERE m.checkout_request_id = $1
        FOR UPDATE`,
        [checkoutRequestId]
      );
      
      if (transactionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('Transaction not found');
      }
      
      const transaction = transactionResult.rows[0];
      
      // Increment retry count
      await client.query(
        'UPDATE mpesa_transactions SET retry_count = $1, last_query_time = NOW() WHERE transaction_id = $2',
        [transaction.retry_count + 1, transaction.transaction_id]
      );
      
      // Process the response from M-Pesa
      const resultCode = queryResult.ResultCode;
      let newStatus;
      
      if (resultCode === '0') {
        newStatus = 'completed';
      } else if (resultCode === '1032') {
        newStatus = 'canceled'; // Transaction canceled by user
      } else if (resultCode === '2001') {
        newStatus = 'initiated'; // Still waiting
      } else {
        newStatus = 'failed'; // Other failures
      }
      
      // If status has changed, update it
      if (newStatus !== transaction.stk_status) {
        // Update mpesa_transactions status
        await client.query(
          `UPDATE mpesa_transactions SET 
            stk_status = $1, 
            result_code = $2, 
            result_desc = $3, 
            updated_at = NOW() 
          WHERE transaction_id = $4`,
          [newStatus, resultCode.toString(), queryResult.ResultDesc, transaction.transaction_id]
        );
        
        // If completed or failed, update the main transaction record
        if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'canceled') {
          const transactionStatus = newStatus === 'completed' ? 'completed' : 'failed';
          
          // Update transaction status
          await client.query(
            'UPDATE transactions SET status = $1, updated_at = NOW() WHERE transaction_id = $2',
            [transactionStatus, transaction.transaction_id]
          );
          
          // If completed, update user balance (only if not already done)
          if (newStatus === 'completed' && transaction.transaction_status !== 'completed') {
            await client.query(
              'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
              [transaction.amount, transaction.user_id]
            );
          }
        }
      }
      
      await client.query('COMMIT');
      return { success: true, status: newStatus };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating transaction from query:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Fetch all pending transactions for a user
  async getPendingTransactionsForUser(userId) {
    try {
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
          m.retry_count,
          m.last_query_time
        FROM transactions t
        JOIN mpesa_transactions m ON t.transaction_id = m.transaction_id
        WHERE t.user_id = $1 
        AND m.stk_status IN ('initiated', 'delivered')
        AND t.transaction_type = 'deposit'
        ORDER BY t.created_at DESC`,
        [userId]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error fetching pending transactions:', error);
      throw error;
    }
  }
  
  // Check for expired transactions and mark them as timed out
  async cleanupExpiredTransactions() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Find all expired transactions that are still in pending status
      const expiredTransactions = await client.query(
        `SELECT 
          m.transaction_id, 
          t.user_id
        FROM mpesa_transactions m
        JOIN transactions t ON m.transaction_id = t.transaction_id
        WHERE m.stk_status IN ('initiated', 'delivered')
        AND m.expires_at < NOW()`,
      );
      
      if (expiredTransactions.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: true, processed: 0 };
      }
      
      // Update all expired transactions
      await client.query(
        `UPDATE mpesa_transactions 
         SET stk_status = 'timeout', updated_at = NOW()
         WHERE stk_status IN ('initiated', 'delivered')
         AND expires_at < NOW()`
      );
      
      // Update corresponding transactions
      await client.query(
        `UPDATE transactions t
         SET status = 'failed', updated_at = NOW()
         FROM mpesa_transactions m
         WHERE t.transaction_id = m.transaction_id
         AND m.stk_status = 'timeout'
         AND t.status = 'pending'`
      );
      
      await client.query('COMMIT');
      return { 
        success: true, 
        processed: expiredTransactions.rows.length 
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error cleaning up expired transactions:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Cancel a transaction (user initiated)
  async cancelTransaction(transactionId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Check if transaction belongs to user and is in a valid state
      const transactionResult = await client.query(
        `SELECT 
          t.transaction_id, 
          t.status as transaction_status,
          m.stk_status
        FROM transactions t
        JOIN mpesa_transactions m ON t.transaction_id = m.transaction_id
        WHERE t.transaction_id = $1 AND t.user_id = $2
        FOR UPDATE`,
        [transactionId, userId]
      );
      
      if (transactionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('Transaction not found or not authorized');
      }
      
      const transaction = transactionResult.rows[0];
      
      // Check if transaction can be canceled
      if (!['initiated', 'delivered'].includes(transaction.stk_status)) {
        await client.query('ROLLBACK');
        throw new Error(`Cannot cancel transaction in ${transaction.stk_status} status`);
      }
      
      // Update mpesa_transactions status
      await client.query(
        'UPDATE mpesa_transactions SET stk_status = $1, updated_at = NOW() WHERE transaction_id = $2',
        ['canceled', transactionId]
      );
      
      // Update transaction status
      await client.query(
        'UPDATE transactions SET status = $1, updated_at = NOW() WHERE transaction_id = $2',
        ['failed', transactionId]
      );
      
      await client.query('COMMIT');
      return { success: true, message: 'Transaction canceled successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error canceling transaction:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new MpesaService();