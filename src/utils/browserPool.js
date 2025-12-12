/**
 * Browser Pool Manager
 * Manages a pool of reusable Puppeteer browser instances for better performance
 * Reduces overhead of launching new browsers for each request
 */

const puppeteer = require('puppeteer');
const logger = require('./logger');
const { BROWSER_POOL } = require('../config/constants');

class BrowserPool {
  constructor(options = {}) {
    this.minInstances = options.minInstances || BROWSER_POOL.MIN_INSTANCES;
    this.maxInstances = options.maxInstances || BROWSER_POOL.MAX_INSTANCES;
    this.instanceTimeout = options.instanceTimeout || BROWSER_POOL.INSTANCE_TIMEOUT;
    this.launchOptions = options.launchOptions || {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    };

    this.pool = [];
    this.available = [];
    this.inUse = new Set();
    this.initialized = false;
  }

  /**
   * Initialize the pool with minimum instances
   */
  async initialize() {
    if (this.initialized) {
      logger.warn('Browser pool already initialized');
      return;
    }

    logger.info(`Initializing browser pool with ${this.minInstances} instances`);

    try {
      for (let i = 0; i < this.minInstances; i++) {
        const instance = await this.createInstance();
        this.pool.push(instance);
        this.available.push(instance);
      }

      this.initialized = true;
      logger.info(`Browser pool initialized successfully with ${this.pool.length} instances`);
    } catch (error) {
      logger.error('Failed to initialize browser pool', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a new browser instance
   */
  async createInstance() {
    const browser = await puppeteer.launch(this.launchOptions);
    const instance = {
      id: `browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      browser,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: 0
    };

    logger.debug(`Created browser instance: ${instance.id}`);
    return instance;
  }

  /**
   * Acquire a browser instance from the pool
   */
  async acquire() {
    if (!this.initialized) {
      await this.initialize();
    }

    // Try to get an available instance
    let instance = this.available.pop();

    // If no available instances, create a new one if under max
    if (!instance && this.pool.length < this.maxInstances) {
      logger.debug('No available instances, creating new one');
      instance = await this.createInstance();
      this.pool.push(instance);
    }

    // If still no instance, wait for one to become available
    if (!instance) {
      logger.debug('Pool at max capacity, waiting for available instance');
      instance = await this.waitForAvailable();
    }

    // Check if instance is still valid
    if (!instance.browser.isConnected()) {
      logger.warn(`Browser instance ${instance.id} is disconnected, creating new one`);
      await this.removeInstance(instance);
      instance = await this.createInstance();
      this.pool.push(instance);
    }

    // Mark as in use
    this.inUse.add(instance);
    instance.lastUsed = Date.now();
    instance.usageCount++;

    logger.debug(`Acquired browser instance: ${instance.id} (usage: ${instance.usageCount})`);
    return instance.browser;
  }

  /**
   * Release a browser instance back to the pool
   */
  async release(browser) {
    const instance = this.pool.find(inst => inst.browser === browser);
    
    if (!instance) {
      logger.warn('Attempted to release browser not in pool');
      return;
    }

    // Check if instance should be retired (too old or too many uses)
    const age = Date.now() - instance.createdAt;
    const shouldRetire = 
      age > this.instanceTimeout || 
      instance.usageCount > BROWSER_POOL.MAX_USAGE_COUNT;

    if (shouldRetire) {
      logger.info(`Retiring browser instance ${instance.id} (age: ${Math.floor(age/1000)}s, usage: ${instance.usageCount})`);
      await this.removeInstance(instance);
      
      // Create replacement if below minimum
      if (this.pool.length < this.minInstances) {
        const newInstance = await this.createInstance();
        this.pool.push(newInstance);
        this.available.push(newInstance);
      }
    } else {
      // Close all pages except one to clean up
      const pages = await browser.pages();
      for (let i = 1; i < pages.length; i++) {
        await pages[i].close();
      }

      // Return to available pool
      this.inUse.delete(instance);
      this.available.push(instance);
      logger.debug(`Released browser instance: ${instance.id}`);
    }
  }

  /**
   * Wait for an instance to become available
   */
  async waitForAvailable() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const instance = this.available.pop();
        if (instance) {
          clearInterval(checkInterval);
          resolve(instance);
        }
      }, 100);
    });
  }

  /**
   * Remove an instance from the pool
   */
  async removeInstance(instance) {
    try {
      await instance.browser.close();
    } catch (error) {
      logger.error(`Error closing browser instance ${instance.id}`, { error: error.message });
    }

    this.pool = this.pool.filter(inst => inst.id !== instance.id);
    this.available = this.available.filter(inst => inst.id !== instance.id);
    this.inUse.delete(instance);
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      total: this.pool.length,
      available: this.available.length,
      inUse: this.inUse.size,
      instances: this.pool.map(inst => ({
        id: inst.id,
        age: Math.floor((Date.now() - inst.createdAt) / 1000),
        usageCount: inst.usageCount,
        lastUsed: Math.floor((Date.now() - inst.lastUsed) / 1000) + 's ago',
        isConnected: inst.browser.isConnected()
      }))
    };
  }

  /**
   * Shutdown the pool and close all browsers
   */
  async shutdown() {
    logger.info('Shutting down browser pool');

    const closePromises = this.pool.map(instance => 
      instance.browser.close().catch(err => 
        logger.error(`Error closing browser ${instance.id}`, { error: err.message })
      )
    );

    await Promise.all(closePromises);

    this.pool = [];
    this.available = [];
    this.inUse.clear();
    this.initialized = false;

    logger.info('Browser pool shut down successfully');
  }

  /**
   * Health check for the pool
   */
  async healthCheck() {
    const stats = this.getStats();
    const health = {
      healthy: true,
      stats,
      issues: []
    };

    // Check if any instances are disconnected
    for (const instance of this.pool) {
      if (!instance.browser.isConnected()) {
        health.healthy = false;
        health.issues.push(`Browser instance ${instance.id} is disconnected`);
      }
    }

    // Check if pool is below minimum
    if (this.pool.length < this.minInstances) {
      health.healthy = false;
      health.issues.push(`Pool below minimum size: ${this.pool.length}/${this.minInstances}`);
    }

    return health;
  }
}

// Singleton instance
let browserPool = null;

/**
 * Get the singleton browser pool instance
 */
function getBrowserPool(options) {
  if (!browserPool) {
    browserPool = new BrowserPool(options);
  }
  return browserPool;
}

module.exports = {
  BrowserPool,
  getBrowserPool
};
