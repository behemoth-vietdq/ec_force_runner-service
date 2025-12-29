// Mock for OrderNotificationService
const mockProcessOrder = jest.fn().mockResolvedValue({
  orderId: 'TEST-ORDER-123',
  customerId: 'C123',
  status: 'success',
  message: 'Order created successfully'
});

module.exports = {
  processOrder: mockProcessOrder
};
