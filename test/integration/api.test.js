const request = require('supertest');

// Mock services before requiring app
jest.mock('../../src/services/order/OrderNotificationService', () => ({
  processOrder: jest.fn().mockResolvedValue({
    orderId: 'TEST-123',
    customerId: 'C123',
    status: 'success'
  })
}));

jest.mock('../../src/services/crawler/EcForceOrderCrawler', () => {
  return jest.fn().mockImplementation(() => ({
    createOrder: jest.fn().mockResolvedValue({ success: true })
  }));
});

const app = require('../../src/app');

describe('API Integration Tests', () => {
  // Close server after all tests
  afterAll((done) => {
    if (app && app.close) {
      app.close(done);
    } else {
      done();
    }
  });

  describe('GET /healthz', () => {
    it('should return 200 with healthy status', async () => {
      const response = await request(app)
        .get('/healthz')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('message', 'OK');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('environment');
    });
  });

  describe('POST /api/orders/create', () => {
    const validOrderData = {
      account: 'test-account',
      customer: 'test-customer',
      form_data: {
        customer_id: 'C123',
        product: {
          name: 'Test Product',
          quantity: 1
        },
        shipping_address_id: 'A123'
      }
    };

    it('should require API key', async () => {
      const response = await request(app)
        .post('/api/orders/create')
        .send(validOrderData)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should accept API key in header', async () => {
      const response = await request(app)
        .post('/api/orders/create')
        .set('x-api-key', 'test-api-key')
        .send(validOrderData);

      // Should pass auth (200 or other non-401)
      expect(response.status).not.toBe(401);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/orders/create')
        .set('x-api-key', 'test-api-key')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject missing account', async () => {
      const invalidData = { ...validOrderData };
      delete invalidData.account;

      const response = await request(app)
        .post('/api/orders/create')
        .set('x-api-key', 'test-api-key')
        .send(invalidData)
        .expect(400);

      expect(response.body.error.details.errors).toContain('account is required');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown/route')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle multiple concurrent requests', async () => {
      // Make multiple requests quickly
      const requests = Array(20).fill(null).map(() =>
        request(app)
          .get('/healthz')
      );

      const responses = await Promise.all(requests);
      
      // At least some should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });
});
