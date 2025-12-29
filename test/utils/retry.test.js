const { retryWithBackoff } = require('../../src/utils/retry');

describe('Retry Utility', () => {
  it('should succeed on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    
    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      initialDelay: 10,
      operationName: 'test-op'
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      initialDelay: 10,
      operationName: 'test-op'
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts exhausted', async () => {
    const error = new Error('Persistent failure');
    const fn = jest.fn().mockRejectedValue(error);

    await expect(retryWithBackoff(fn, {
      maxAttempts: 2,
      initialDelay: 10,
      operationName: 'test-op'
    })).rejects.toThrow('Persistent failure');
    
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should apply exponential backoff', async () => {
    let attemptCount = 0;
    
    const fn = jest.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount < 3) {
        return Promise.reject(new Error('Retry'));
      }
      return Promise.resolve('success');
    });

    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      initialDelay: 10,
      backoffMultiplier: 2,
      operationName: 'test-op'
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
