/**
 * Unit Tests for Payment Module Client
 * Tests the client that communicates with the standalone payment module
 */

const PaymentModuleClient = require('../../services/paymentModuleClient');

// Mock axios for HTTP requests
jest.mock('axios');
const axios = require('axios');

describe('PaymentModuleClient', () => {
  let client;
  const mockConfig = {
    baseURL: 'http://localhost:3001',
    timeout: 5000,
    retries: 3
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock axios create before creating client
    const mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    };

    axios.create = jest.fn(() => mockAxiosInstance);

    client = new PaymentModuleClient(mockConfig);
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const defaultClient = new PaymentModuleClient();

      expect(defaultClient.config.baseURL).toBe('http://localhost:3001');
      expect(defaultClient.config.timeout).toBe(30000);
      expect(defaultClient.config.retries).toBe(3);
    });

    test('should initialize with custom configuration', () => {
      const customConfig = {
        baseURL: 'http://custom-payment-service:8080',
        timeout: 10000,
        retries: 5,
        apiKey: 'test-key'
      };

      const customClient = new PaymentModuleClient(customConfig);

      expect(customClient.config.baseURL).toBe('http://custom-payment-service:8080');
      expect(customClient.config.timeout).toBe(10000);
      expect(customClient.config.retries).toBe(5);
      expect(customClient.config.apiKey).toBe('test-key');
    });

    test('should create axios instance with correct configuration', () => {
      new PaymentModuleClient(mockConfig);

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:3001',
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'StakeOut-Backend/1.0.0'
        }
      });
    });
  });

  describe('Service Availability', () => {
    test('should return true when service is available', async () => {
      const mockAxios = {
        get: jest.fn().mockResolvedValue({
          status: 200,
          data: { status: 'healthy' }
        })
      };
      client.axiosInstance = mockAxios;

      const isAvailable = await client.isAvailable();

      expect(isAvailable).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledWith('/health');
    });

    test('should return false when service is unavailable', async () => {
      const mockAxios = {
        get: jest.fn().mockRejectedValue(new Error('Connection refused'))
      };
      client.axiosInstance = mockAxios;

      const isAvailable = await client.isAvailable();

      expect(isAvailable).toBe(false);
    });

    test('should cache availability status', async () => {
      const mockAxios = {
        get: jest.fn().mockResolvedValue({
          status: 200,
          data: { status: 'healthy' }
        })
      };
      client.axiosInstance = mockAxios;

      // Call multiple times
      await client.isAvailable();
      await client.isAvailable();
      await client.isAvailable();

      // Should only make one HTTP request within cache period
      expect(mockAxios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('Payment Initiation', () => {
    test('should initiate payment successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          transactionId: 'TXN123',
          checkoutRequestId: 'ws_CO_123',
          message: 'Payment initiated'
        }
      };

      const mockAxios = {
        post: jest.fn().mockResolvedValue(mockResponse)
      };
      client.axiosInstance = mockAxios;

      const paymentData = {
        phoneNumber: '254712345678',
        amount: 100,
        userId: 1,
        description: 'Test payment'
      };

      const result = await client.initiatePayment(paymentData);

      expect(mockAxios.post).toHaveBeenCalledWith('/payments/initiate', paymentData);
      expect(result).toEqual(mockResponse.data);
    });

    test('should validate payment data before sending', async () => {
      await expect(
        client.initiatePayment({})
      ).rejects.toThrow('Invalid payment data');

      await expect(
        client.initiatePayment({ phoneNumber: '', amount: 100 })
      ).rejects.toThrow('Invalid payment data');

      await expect(
        client.initiatePayment({ phoneNumber: '254712345678', amount: 0 })
      ).rejects.toThrow('Invalid payment data');
    });

    test('should handle payment initiation errors', async () => {
      const mockAxios = {
        post: jest.fn().mockRejectedValue({
          response: {
            status: 400,
            data: { error: 'Invalid phone number' }
          }
        })
      };
      client.axiosInstance = mockAxios;

      await expect(
        client.initiatePayment({
          phoneNumber: 'invalid',
          amount: 100,
          userId: 1
        })
      ).rejects.toThrow('Invalid phone number');
    });

    test('should retry failed requests', async () => {
      const mockAxios = {
        post: jest.fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            data: { success: true, transactionId: 'TXN123' }
          })
      };
      client.axiosInstance = mockAxios;

      const result = await client.initiatePayment({
        phoneNumber: '254712345678',
        amount: 100,
        userId: 1
      });

      expect(mockAxios.post).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });

    test('should fail after max retries', async () => {
      const mockAxios = {
        post: jest.fn().mockRejectedValue(new Error('Persistent network error'))
      };
      client.axiosInstance = mockAxios;

      await expect(
        client.initiatePayment({
          phoneNumber: '254712345678',
          amount: 100,
          userId: 1
        })
      ).rejects.toThrow('Persistent network error');

      expect(mockAxios.post).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Payment Status Checking', () => {
    test('should check payment status successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          status: 'completed',
          amount: 100,
          phoneNumber: '254712345678',
          completedAt: new Date().toISOString()
        }
      };

      const mockAxios = {
        get: jest.fn().mockResolvedValue(mockResponse)
      };
      client.axiosInstance = mockAxios;

      const result = await client.checkPaymentStatus('TXN123');

      expect(mockAxios.get).toHaveBeenCalledWith('/payments/TXN123/status');
      expect(result).toEqual(mockResponse.data);
    });

    test('should handle non-existent transaction', async () => {
      const mockAxios = {
        get: jest.fn().mockRejectedValue({
          response: {
            status: 404,
            data: { error: 'Transaction not found' }
          }
        })
      };
      client.axiosInstance = mockAxios;

      await expect(
        client.checkPaymentStatus('INVALID_TXN')
      ).rejects.toThrow('Transaction not found');
    });

    test('should validate transaction ID', async () => {
      await expect(
        client.checkPaymentStatus('')
      ).rejects.toThrow('Invalid transaction ID');

      await expect(
        client.checkPaymentStatus(null)
      ).rejects.toThrow('Invalid transaction ID');
    });
  });

  describe('User Payments Retrieval', () => {
    test('should get user payments with default parameters', async () => {
      const mockResponse = {
        data: {
          success: true,
          payments: [
            {
              id: 'TXN123',
              amount: 100,
              status: 'completed',
              createdAt: new Date().toISOString()
            }
          ],
          pagination: {
            page: 1,
            limit: 20,
            totalCount: 1,
            totalPages: 1
          }
        }
      };

      const mockAxios = {
        get: jest.fn().mockResolvedValue(mockResponse)
      };
      client.axiosInstance = mockAxios;

      const result = await client.getUserPayments(1);

      expect(mockAxios.get).toHaveBeenCalledWith('/payments/user/1', {
        params: {
          page: 1,
          limit: 20
        }
      });
      expect(result).toEqual(mockResponse.data);
    });

    test('should get user payments with custom parameters', async () => {
      const mockAxios = {
        get: jest.fn().mockResolvedValue({ data: { success: true, payments: [] } })
      };
      client.axiosInstance = mockAxios;

      const options = {
        page: 2,
        limit: 10,
        status: 'pending',
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31'
      };

      await client.getUserPayments(1, options);

      expect(mockAxios.get).toHaveBeenCalledWith('/payments/user/1', {
        params: options
      });
    });

    test('should validate user ID', async () => {
      await expect(
        client.getUserPayments(null)
      ).rejects.toThrow('Invalid user ID');

      await expect(
        client.getUserPayments('')
      ).rejects.toThrow('Invalid user ID');
    });
  });

  describe('Payment Cancellation', () => {
    test('should cancel payment successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Payment cancelled successfully'
        }
      };

      const mockAxios = {
        post: jest.fn().mockResolvedValue(mockResponse)
      };
      client.axiosInstance = mockAxios;

      const result = await client.cancelPayment('TXN123', 1);

      expect(mockAxios.post).toHaveBeenCalledWith('/payments/TXN123/cancel', {
        userId: 1
      });
      expect(result).toEqual(mockResponse.data);
    });

    test('should handle cancellation of non-cancellable payment', async () => {
      const mockAxios = {
        post: jest.fn().mockRejectedValue({
          response: {
            status: 400,
            data: { error: 'Payment cannot be cancelled' }
          }
        })
      };
      client.axiosInstance = mockAxios;

      await expect(
        client.cancelPayment('TXN123', 1)
      ).rejects.toThrow('Payment cannot be cancelled');
    });

    test('should validate cancellation parameters', async () => {
      await expect(
        client.cancelPayment('', 1)
      ).rejects.toThrow('Invalid transaction ID');

      await expect(
        client.cancelPayment('TXN123', null)
      ).rejects.toThrow('Invalid user ID');
    });
  });

  describe('Health Status', () => {
    test('should get comprehensive health status', async () => {
      const mockResponse = {
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            database: { status: 'online', responseTime: 5 },
            mpesa: { status: 'online', responseTime: 150 },
            redis: { status: 'online', responseTime: 2 }
          },
          metrics: {
            totalPayments: 1000,
            successRate: 98.5,
            averageResponseTime: 120
          }
        }
      };

      const mockAxios = {
        get: jest.fn().mockResolvedValue(mockResponse)
      };
      client.axiosInstance = mockAxios;

      const result = await client.getHealthStatus();

      expect(mockAxios.get).toHaveBeenCalledWith('/health');
      expect(result).toEqual(mockResponse.data);
    });

    test('should handle health check failures', async () => {
      const mockAxios = {
        get: jest.fn().mockRejectedValue(new Error('Service unavailable'))
      };
      client.axiosInstance = mockAxios;

      await expect(
        client.getHealthStatus()
      ).rejects.toThrow('Service unavailable');
    });
  });

  describe('Error Handling', () => {
    test('should handle network timeouts', async () => {
      const mockAxios = {
        post: jest.fn().mockRejectedValue({
          code: 'ECONNABORTED',
          message: 'timeout of 5000ms exceeded'
        })
      };
      client.axiosInstance = mockAxios;

      await expect(
        client.initiatePayment({
          phoneNumber: '254712345678',
          amount: 100,
          userId: 1
        })
      ).rejects.toThrow('timeout');
    });

    test('should handle service unavailable errors', async () => {
      const mockAxios = {
        get: jest.fn().mockRejectedValue({
          response: {
            status: 503,
            data: { error: 'Service temporarily unavailable' }
          }
        })
      };
      client.axiosInstance = mockAxios;

      await expect(
        client.checkPaymentStatus('TXN123')
      ).rejects.toThrow('Service temporarily unavailable');
    });

    test('should handle malformed responses', async () => {
      const mockAxios = {
        get: jest.fn().mockResolvedValue({
          data: 'Invalid JSON response'
        })
      };
      client.axiosInstance = mockAxios;

      const result = await client.checkPaymentStatus('TXN123');

      // Should handle gracefully
      expect(result).toBe('Invalid JSON response');
    });
  });

  describe('Request Interceptors', () => {
    test('should add authentication headers when API key provided', () => {
      const clientWithAuth = new PaymentModuleClient({
        ...mockConfig,
        apiKey: 'test-api-key'
      });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
    });

    test('should add request ID for tracing', async () => {
      const mockAxios = {
        post: jest.fn().mockResolvedValue({ data: { success: true } }),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() }
        }
      };
      client.axiosInstance = mockAxios;

      await client.initiatePayment({
        phoneNumber: '254712345678',
        amount: 100,
        userId: 1
      });

      // Check that request interceptor was configured
      expect(mockAxios.interceptors.request.use).toHaveBeenCalled();
    });
  });

  describe('Response Caching', () => {
    test('should cache successful status checks', async () => {
      const mockResponse = {
        data: {
          success: true,
          status: 'completed'
        }
      };

      const mockAxios = {
        get: jest.fn().mockResolvedValue(mockResponse)
      };
      client.axiosInstance = mockAxios;

      // Call multiple times
      await client.checkPaymentStatus('TXN123');
      await client.checkPaymentStatus('TXN123');

      // Should only make one request for completed transactions
      expect(mockAxios.get).toHaveBeenCalledTimes(1);
    });

    test('should not cache pending status checks', async () => {
      const mockResponse = {
        data: {
          success: true,
          status: 'pending'
        }
      };

      const mockAxios = {
        get: jest.fn().mockResolvedValue(mockResponse)
      };
      client.axiosInstance = mockAxios;

      // Call multiple times
      await client.checkPaymentStatus('TXN123');
      await client.checkPaymentStatus('TXN123');

      // Should make multiple requests for pending transactions
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('Rate Limiting', () => {
    test('should respect rate limits', async () => {
      const mockAxios = {
        post: jest.fn().mockRejectedValue({
          response: {
            status: 429,
            headers: {
              'retry-after': '5'
            },
            data: { error: 'Rate limit exceeded' }
          }
        })
      };
      client.axiosInstance = mockAxios;

      await expect(
        client.initiatePayment({
          phoneNumber: '254712345678',
          amount: 100,
          userId: 1
        })
      ).rejects.toThrow('Rate limit exceeded');
    });
  });
});