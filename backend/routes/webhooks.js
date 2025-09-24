const express = require('express');
const router = express.Router();
const PaymentAdapter = require('../services/paymentAdapter');
const mpesaService = require('../services/mpesa');

// Initialize payment adapter with configuration
const paymentAdapter = new PaymentAdapter({
  usePaymentModule: process.env.USE_PAYMENT_MODULE !== 'false',
  fallbackToLegacy: process.env.FALLBACK_TO_LEGACY !== 'false',
  legacyService: mpesaService,
  paymentModule: {
    baseUrl: process.env.PAYMENT_MODULE_URL,
    apiKey: process.env.PAYMENT_MODULE_API_KEY,
    timeout: parseInt(process.env.PAYMENT_MODULE_TIMEOUT) || 30000
  }
});

// M-Pesa callback endpoint - this will handle webhooks from M-Pesa
router.post('/mpesa/callback', async (req, res) => {
  try {
    console.log('M-Pesa Callback received at:', new Date().toISOString());
    console.log('Callback Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Callback Body:', JSON.stringify(req.body, null, 2));
    
    // Always respond with 200 OK quickly to the M-Pesa API
    // This prevents retries that could cause duplicate processing
    const responsePromise = res.status(200).json({ 
      success: true,
      message: "Callback received and processing" 
    });
    
    // Validate the callback data structure
    if (!req.body || !req.body.Body) {
      console.error('Invalid callback data received - missing Body');
      return responsePromise;
    }
    
    // Process the callback asynchronously via payment adapter
    // This allows us to return 200 OK to M-Pesa immediately
    paymentAdapter.processCallback(req.body)
      .then(result => {
        console.log('Callback processing result:', result);
      })
      .catch(error => {
        console.error('Critical error in callback processing:', error);
      });
    
    // Response already sent
    return responsePromise;
  } catch (error) {
    console.error('Critical error in callback handler:', error);
    // Still return 200 to prevent retries
    return res.status(200).json({ 
      success: false, 
      message: "Callback received but had processing errors" 
    });
  }
});

module.exports = router;