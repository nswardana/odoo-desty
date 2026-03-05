// workers/masterWorker.js
// Master worker controller to manage all queue workers

const queueManager = require('../queues/queueManager');
const orderWorker = require('./orderWorker');
const stockWorker = require('./stockWorker');
const cancelWorker = require('./cancelWorker');

class MasterWorker {
  constructor() {
    this.workers = new Map();
    this.isRunning = false;
  }

  // Start all workers
  async start() {
    try {
      console.log('🚀 Starting Master Worker Controller...');
      
      // Start individual workers
      await orderWorker.start();
      await stockWorker.start();
      await cancelWorker.start();

      this.workers.set('order', orderWorker);
      this.workers.set('stock', stockWorker);
      this.workers.set('cancel', cancelWorker);

      this.isRunning = true;

      console.log('✅ All workers started successfully');
      console.log('📊 Active workers:', Array.from(this.workers.keys()));

      // Start health monitoring
      this.startHealthMonitoring();

    } catch (error) {
      console.error('❌ Error starting master worker:', error.message);
      throw error;
    }
  }

  // Stop all workers
  async stop() {
    try {
      console.log('🛑 Stopping Master Worker Controller...');
      
      // Stop individual workers
      await orderWorker.stop();
      await stockWorker.stop();
      await cancelWorker.stop();

      this.isRunning = false;
      console.log('✅ All workers stopped successfully');

    } catch (error) {
      console.error('❌ Error stopping master worker:', error.message);
      throw error;
    }
  }

  // Start health monitoring
  startHealthMonitoring() {
    // Monitor queue health every 30 seconds
    setInterval(async () => {
      if (this.isRunning) {
        try {
          const health = await queueManager.healthCheck();
          
          if (health.status !== 'healthy') {
            console.warn('⚠️ Queue health warning:', health);
          }

          // Log queue statistics
          const stats = await queueManager.getAllQueueStats();
          console.log('📊 Queue Statistics:', {
            timestamp: new Date().toISOString(),
            queues: stats
          });

        } catch (error) {
          console.error('❌ Health monitoring error:', error.message);
        }
      }
    }, 30000); // 30 seconds
  }

  // Get all worker statistics
  async getAllWorkerStats() {
    try {
      const stats = {
        timestamp: new Date().toISOString(),
        workers: {},
        queue_health: await queueManager.healthCheck()
      };

      // Get stats from each worker
      for (const [workerName, worker] of this.workers.entries()) {
        stats.workers[workerName] = await worker.getStats();
      }

      return stats;
    } catch (error) {
      console.error('❌ Error getting worker stats:', error.message);
      throw error;
    }
  }

  // Restart specific worker
  async restartWorker(workerName) {
    try {
      const worker = this.workers.get(workerName);
      if (!worker) {
        throw new Error(`Worker not found: ${workerName}`);
      }

      console.log(`🔄 Restarting worker: ${workerName}`);
      await worker.stop();
      await worker.start();

      console.log(`✅ Worker restarted: ${workerName}`);
    } catch (error) {
      console.error(`❌ Error restarting worker ${workerName}:`, error.message);
      throw error;
    }
  }

  // Add order to order queue
  async addOrder(source, order, options = {}) {
    return await orderWorker.addOrder(source, order, options);
  }

  // Add urgent order
  async addUrgentOrder(source, order) {
    return await orderWorker.addUrgentOrder(source, order);
  }

  // Add stock update
  async addStockUpdate(marketplace, shopId, productId, stockData, options = {}) {
    return await stockWorker.addStockUpdate(marketplace, shopId, productId, stockData, options);
  }

  // Add critical stock update
  async addCriticalStockUpdate(marketplace, shopId, productId, stockData) {
    return await stockWorker.addCriticalStockUpdate(marketplace, shopId, productId, stockData);
  }

  // Add cancellation
  async addCancellation(marketplace, shopId, orderId, cancelData, options = {}) {
    return await cancelWorker.addCancellation(marketplace, shopId, orderId, cancelData, options);
  }

  // Add urgent cancellation
  async addUrgentCancellation(marketplace, shopId, orderId, cancelData) {
    return await cancelWorker.addUrgentCancellation(marketplace, shopId, orderId, cancelData);
  }

  // Get queue manager instance
  getQueueManager() {
    return queueManager;
  }

  // Graceful shutdown
  async gracefulShutdown() {
    try {
      console.log('🔄 Initiating graceful shutdown...');
      
      // Stop accepting new jobs
      await queueManager.pauseQueue('marketplace-order-queue');
      await queueManager.pauseQueue('marketplace-stock-queue');
      await queueManager.pauseQueue('marketplace-cancel-queue');

      // Wait for current jobs to complete (with timeout)
      console.log('⏳ Waiting for jobs to complete...');
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds

      // Stop all workers
      await this.stop();

      // Close queue manager
      await queueManager.close();

      console.log('✅ Graceful shutdown completed');
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error.message);
      throw error;
    }
  }
}

module.exports = new MasterWorker();
