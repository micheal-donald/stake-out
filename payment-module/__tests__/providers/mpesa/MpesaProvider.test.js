/**
 * MpesaProvider Unit Tests
 *
 * Comprehensive test suite for the M-Pesa payment provider including
 * payment initiation, status queries, webhook handling, and error scenarios.
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const axios = require('axios');
const MpesaProvider = require('../../../src/providers/mpesa/MpesaProvider');
const PaymentError = require('../../../src/errors/PaymentError');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

// Mock payment events
jest.mock('../../../src/events/PaymentEventEmitter', () => ({
  paymentEvents: {
    emitPaymentEvent: jest.fn()
  },
  PAYMENT_EVENTS: {
    PAYMENT_INITIATED: 'payment.initiated'
  }
}));

describe('MpesaProvider', () => {
  let mpesaProvider;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      consumerKey: 'test_consumer_key',
      consumerSecret: 'test_consumer_secret',
      shortcode: '174379',
      passkey: 'test_passkey',
      callbackUrl: 'https://test.com/callback',
      environment: 'sandbox'
    };

    mpesaProvider = new MpesaProvider(mockConfig);
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with valid configuration', async () => {
      mockedAxios.mockResolvedValue({
        data: { access_token: 'test_token', expires_in: '3599' }
      });

      await mpesaProvider.initialize();

      expect(mpesaProvider.isInitialized()).toBe(true);
      expect(mpesaProvider.accessToken).toBe('test_token');
    });

    test('should validate required configuration fields', () => {
      const invalidConfig = { consumerKey: 'test' }; // Missing required fields

      expect(() => new MpesaProvider(invalidConfig)).toThrow(PaymentError);
    });

    test('should set correct API URLs for sandbox environment', () => {
      const provider = new MpesaProvider({ ...mockConfig, environment: 'sandbox' });

      expect(provider.baseUrl).toContain('sandbox.safaricom.co.ke');
    });

    test('should set correct API URLs for production environment', () => {
      const provider = new MpesaProvider({ ...mockConfig, environment: 'production' });

      expect(provider.baseUrl).toContain('api.safaricom.co.ke');
    });

    test('should handle token generation failure', async () => {
      mockedAxios.mockRejectedValue(new Error('Network error'));

      await expect(mpesaProvider.initialize()).rejects.toThrow(PaymentError);
    });

    test('should handle invalid token response', async () => {
      mockedAxios.mockResolvedValue({
        data: { error: 'invalid_grant' }
      });

      await expect(mpesaProvider.initialize()).rejects.toThrow(PaymentError);
    });
  });

  describe('Payment Initiation', () => {
    beforeEach(async () => {
      // Mock successful token generation
      mockedAxios.mockResolvedValue({
        data: { access_token: 'test_token', expires_in: '3599' }
      });

      await mpesaProvider.initialize();
      jest.clearAllMocks();
    });

    test('should initiate payment successfully', async () => {
      const paymentData = {
        amount: 1000,
        phoneNumber: '254708374149',
        accountReference: 'test-ref-123',
        transactionDesc: 'Test payment'
      };

      const mockResponse = {
        data: {
          MerchantRequestID: 'merchant-123',
          CheckoutRequestID: 'checkout-456',
          ResponseCode: '0',
          ResponseDescription: 'Success. Request accepted for processing'
        }
      };

      mockedAxios.mockResolvedValue(mockResponse);

      const result = await mpesaProvider.initiatePayment(paymentData);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('checkout-456');
      expect(result.providerData.merchantRequestId).toBe('merchant-123');
      expect(result.providerData.checkoutRequestId).toBe('checkout-456');
    });

    test('should validate payment data', async () => {
      const invalidPaymentData = {
        amount: -100, // Invalid amount
        phoneNumber: '254708374149'
      };

      await expect(mpesaProvider.initiatePayment(invalidPaymentData))
        .rejects.toThrow(PaymentError);
    });

    test('should format phone numbers correctly', () => {
      const testCases = [
        { input: '0708374149', expected: '254708374149' },
        { input: '+254708374149', expected: '254708374149' },
        { input: '254708374149', expected: '254708374149' },
        { input: '708374149', expected: '254708374149' }
      ];

      testCases.forEach(({ input, expected }) => {
        const formatted = mpesaProvider.formatPhoneNumber(input);
        expect(formatted).toBe(expected);
      });
    });

    test('should reject invalid phone numbers', () => {
      const invalidNumbers = [
        '12345', // Too short
        '254123456789012', // Too long
        '255708374149', // Wrong country code
        'invalid-number' // Non-numeric
      ];

      invalidNumbers.forEach(number => {
        expect(() => mpesaProvider.formatPhoneNumber(number)).toThrow(PaymentError);
      });
    });

    test('should handle STK push API errors', async () => {
      const paymentData = {
        amount: 1000,
        phoneNumber: '254708374149',
        accountReference: 'test-ref-123'
      };

      const errorResponse = {
        data: {
          ResponseCode: '1',
          ResponseDescription: 'Invalid phone number'
        }
      };

      mockedAxios.mockResolvedValue(errorResponse);

      await expect(mpesaProvider.initiatePayment(paymentData))
        .rejects.toThrow(PaymentError);
    });

    test('should handle network errors during payment initiation', async () => {
      const paymentData = {
        amount: 1000,
        phoneNumber: '254708374149',
        accountReference: 'test-ref-123'
      };

      mockedAxios.mockRejectedValue(new Error('Network timeout'));

      await expect(mpesaProvider.initiatePayment(paymentData))
        .rejects.toThrow(PaymentError);
    });

    test('should generate correct timestamp', () => {
      const timestamp = mpesaProvider.generateTimestamp();

      expect(timestamp).toMatch(/^\d{14}$/); // Format: YYYYMMDDHHMMSS
      expect(timestamp.length).toBe(14);
    });

    test('should generate correct password', () => {
      const timestamp = '20240115143000';
      const password = mpesaProvider.generatePassword(timestamp);

      expect(password).toBeTruthy();
      expect(typeof password).toBe('string');
    });
  });

  describe('Payment Status Query', () => {
    beforeEach(async () => {
      mockedAxios.mockResolvedValue({
        data: { access_token: 'test_token', expires_in: '3599' }
      });
      await mpesaProvider.initialize();
      jest.clearAllMocks();
    });

    test('should query payment status successfully', async () => {
      const mockResponse = {
        data: {
          ResponseCode: '0',
          ResponseDescription: 'The service request has been accepted successfully',
          MerchantRequestID: 'merchant-123',
          CheckoutRequestID: 'checkout-456',
          ResultCode: '0',
          ResultDesc: 'The service request is processed successfully.'
        }
      };

      mockedAxios.mockResolvedValue(mockResponse);

      const result = await mpesaProvider.getPaymentStatus('checkout-456');

      expect(result.status).toBe('completed');
      expect(result.providerData.resultCode).toBe('0');
    });

    test('should handle pending payment status', async () => {
      const mockResponse = {
        data: {
          ResponseCode: '0',
          ResponseDescription: 'Request pending',
          ResultCode: '1037'
        }
      };

      mockedAxios.mockResolvedValue(mockResponse);

      const result = await mpesaProvider.getPaymentStatus('checkout-456');

      expect(result.status).toBe('pending');
    });

    test('should handle failed payment status', async () => {
      const mockResponse = {
        data: {
          ResponseCode: '0',
          ResponseDescription: 'The service request has been accepted successfully',
          ResultCode: '1032',
          ResultDesc: 'Request cancelled by user'
        }
      };

      mockedAxios.mockResolvedValue(mockResponse);

      const result = await mpesaProvider.getPaymentStatus('checkout-456');

      expect(result.status).toBe('cancelled');
      expect(result.failureReason).toContain('cancelled by user');
    });

    test('should handle API errors during status query', async () => {
      mockedAxios.mockRejectedValue(new Error('API error'));

      await expect(mpesaProvider.getPaymentStatus('checkout-456'))
        .rejects.toThrow(PaymentError);
    });
  });

  describe('Webhook Handling', () => {
    test('should handle successful payment callback', async () => {
      const callback = global.testUtils.createTestMpesaCallback();

      const result = await mpesaProvider.handleWebhook(callback);

      expect(result.status).toBe('completed');
      expect(result.transactionReference).toBe('ws_CO_test123');
      expect(result.providerData.mpesaReceiptNumber).toBe('TEST123456');
    });

    test('should handle failed payment callback', async () => {
      const failedCallback = global.testUtils.createTestMpesaCallback({
        Body: {
          stkCallback: {
            MerchantRequestID: 'test-merchant-123',
            CheckoutRequestID: 'ws_CO_test123',
            ResultCode: 1032,
            ResultDesc: 'Request cancelled by user'
          }
        }
      });

      const result = await mpesaProvider.handleWebhook(failedCallback);

      expect(result.status).toBe('cancelled');
      expect(result.failureReason).toContain('cancelled by user');
    });

    test('should handle timeout callback', async () => {
      const timeoutCallback = global.testUtils.createTestMpesaCallback({
        Body: {
          stkCallback: {
            MerchantRequestID: 'test-merchant-123',
            CheckoutRequestID: 'ws_CO_test123',
            ResultCode: 1037,
            ResultDesc: 'STK Push Timeout'
          }
        }
      });

      const result = await mpesaProvider.handleWebhook(timeoutCallback);

      expect(result.status).toBe('timeout');
    });

    test('should extract callback metadata correctly', () => {
      const callback = global.testUtils.createTestMpesaCallback();

      const metadata = mpesaProvider.extractCallbackMetadata(
        callback.Body.stkCallback.CallbackMetadata.Item
      );

      expect(metadata.amount).toBe(1000);
      expect(metadata.mpesaReceiptNumber).toBe('TEST123456');
      expect(metadata.transactionDate).toBe(20240115143000);
      expect(metadata.phoneNumber).toBe(254708374149);
    });

    test('should handle malformed callback data', async () => {
      const malformedCallback = { invalid: 'data' };

      await expect(mpesaProvider.handleWebhook(malformedCallback))
        .rejects.toThrow(PaymentError);
    });

    test('should map M-Pesa result codes correctly', () => {
      const testCases = [
        { code: 0, expected: 'completed' },
        { code: 1032, expected: 'cancelled' },
        { code: 1037, expected: 'timeout' },
        { code: 1, expected: 'failed' }
      ];

      testCases.forEach(({ code, expected }) => {
        const status = mpesaProvider.mapMpesaResultCode(code);
        expect(status).toBe(expected);
      });
    });
  });

  describe('Token Management', () => {
    test('should refresh expired tokens automatically', async () => {
      // Set up expired token
      mpesaProvider.accessToken = 'expired_token';
      mpesaProvider.tokenExpiresAt = Date.now() - 1000; // Expired 1 second ago

      mockedAxios
        .mockResolvedValueOnce({ // Token refresh
          data: { access_token: 'new_token', expires_in: '3599' }
        })
        .mockResolvedValueOnce({ // Payment request
          data: {
            MerchantRequestID: 'merchant-123',
            CheckoutRequestID: 'checkout-456',
            ResponseCode: '0'
          }
        });

      const paymentData = {
        amount: 1000,
        phoneNumber: '254708374149',
        accountReference: 'test-ref-123'
      };

      await mpesaProvider.initiatePayment(paymentData);

      expect(mpesaProvider.accessToken).toBe('new_token');
    });

    test('should use valid tokens without refresh', async () => {
      // Set up valid token
      mpesaProvider.accessToken = 'valid_token';
      mpesaProvider.tokenExpiresAt = Date.now() + 3600000; // Valid for 1 hour

      mockedAxios.mockResolvedValueOnce({ // Payment request only
        data: {
          MerchantRequestID: 'merchant-123',
          CheckoutRequestID: 'checkout-456',
          ResponseCode: '0'
        }
      });

      const paymentData = {
        amount: 1000,
        phoneNumber: '254708374149',
        accountReference: 'test-ref-123'
      };

      await mpesaProvider.initiatePayment(paymentData);

      // Should only make one API call (payment, not token refresh)
      expect(mockedAxios).toHaveBeenCalledTimes(1);
    });

    test('should handle token generation errors', async () => {
      mpesaProvider.accessToken = null;

      mockedAxios.mockRejectedValue(new Error('Token generation failed'));

      const paymentData = {
        amount: 1000,
        phoneNumber: '254708374149',
        accountReference: 'test-ref-123'
      };

      await expect(mpesaProvider.initiatePayment(paymentData))
        .rejects.toThrow(PaymentError);
    });
  });

  describe('Provider Information', () => {
    test('should return correct provider name', () => {
      expect(mpesaProvider.getProviderName()).toBe('mpesa');
    });

    test('should return supported currencies', () => {
      const currencies = mpesaProvider.getSupportedCurrencies();
      expect(currencies).toContain('KES');
    });

    test('should return supported countries', () => {
      const countries = mpesaProvider.getSupportedCountries();
      expect(countries).toContain('KE');
    });

    test('should validate supported currencies', () => {
      expect(mpesaProvider.supportsCurrency('KES')).toBe(true);
      expect(mpesaProvider.supportsCurrency('USD')).toBe(false);
    });

    test('should get payment limits', () => {
      const limits = mpesaProvider.getPaymentLimits('KES');

      expect(limits.min).toBeGreaterThan(0);
      expect(limits.max).toBeGreaterThan(limits.min);
    });

    test('should validate payment amounts', () => {
      expect(mpesaProvider.validatePaymentAmount(1000, 'KES')).toBe(true);
      expect(mpesaProvider.validatePaymentAmount(0.5, 'KES')).toBe(false);
      expect(mpesaProvider.validatePaymentAmount(1000000, 'KES')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle network timeouts', async () => {
      mockedAxios.mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout of 30000ms exceeded'
      });

      await expect(mpesaProvider.initialize()).rejects.toThrow(PaymentError);
    });

    test('should handle API rate limiting', async () => {
      mockedAxios.mockRejectedValue({
        response: {
          status: 429,
          data: { error: 'Rate limit exceeded' }
        }
      });

      await expect(mpesaProvider.initialize()).rejects.toThrow(PaymentError);
    });

    test('should handle server errors', async () => {
      mockedAxios.mockRejectedValue({
        response: {
          status: 500,
          data: { error: 'Internal server error' }
        }
      });

      await expect(mpesaProvider.initialize()).rejects.toThrow(PaymentError);
    });

    test('should categorize errors correctly', () => {
      const networkError = new Error('Network Error');
      networkError.code = 'ENOTFOUND';

      const timeoutError = new Error('Timeout');
      timeoutError.code = 'ECONNABORTED';

      expect(mpesaProvider.categorizeError(networkError)).toBe('NETWORK_ERROR');
      expect(mpesaProvider.categorizeError(timeoutError)).toBe('TIMEOUT_ERROR');
    });
  });

  describe('Configuration Validation', () => {
    test('should validate all required configuration fields', () => {
      const requiredFields = [
        'consumerKey',
        'consumerSecret',
        'shortcode',
        'passkey',
        'callbackUrl'
      ];

      requiredFields.forEach(field => {
        const incompleteConfig = { ...mockConfig };
        delete incompleteConfig[field];

        expect(() => new MpesaProvider(incompleteConfig)).toThrow(PaymentError);
      });
    });

    test('should validate environment values', () => {
      const validConfig = { ...mockConfig, environment: 'production' };
      const invalidConfig = { ...mockConfig, environment: 'invalid' };

      expect(() => new MpesaProvider(validConfig)).not.toThrow();
      expect(() => new MpesaProvider(invalidConfig)).toThrow(PaymentError);
    });

    test('should validate shortcode format', () => {
      const invalidShortcode = { ...mockConfig, shortcode: 'invalid' };

      expect(() => new MpesaProvider(invalidShortcode)).toThrow(PaymentError);
    });

    test('should validate callback URL format', () => {
      const invalidUrl = { ...mockConfig, callbackUrl: 'not-a-url' };

      expect(() => new MpesaProvider(invalidUrl)).toThrow(PaymentError);
    });
  });
});