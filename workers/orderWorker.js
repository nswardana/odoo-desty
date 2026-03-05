// workers/orderWorker.js
// Worker for marketplace order processing queue

const queueManager = require('../queues/queueManager');
const { processMarketplaceOrder } = require('../services/orderService');

class OrderWorker {
  constructor() {
    this.queueName = 'marketplace-order-queue';
    this.worker = null;
  }

  // Start the order worker
  async start() {
    try {
      console.log('🚀 Starting Order Worker...');
      
      this.worker = queueManager.createWorker(this.queueName, async (job) => {
        try {
          console.log(`📦 Processing order job:`, {
            id: job.id,
            data: job.data
          });

          // Process the marketplace order
          const result = await processMarketplaceOrder(
            job.data.source,
            job.data.order
          );

          console.log(`✅ Order processed successfully:`, {
            jobId: job.id,
            result: result
          });

          return result;
        } catch (error) {
          console.error(`❌ Order processing failed:`, {
            jobId: job.id,
            error: error.message,
            data: job.data
          });
          throw error;
        }
      });

      console.log(`✅ Order Worker started for queue: ${this.queueName}`);
      
    } catch (error) {
      console.error('❌ Error starting Order Worker:', error.message);
      throw error;
    }
  }

  // Stop the order worker
  async stop() {
    try {
      if (this.worker) {
        await this.worker.close();
        console.log(`🔌 Order Worker stopped for queue: ${this.queueName}`);
      }
    } catch (error) {
      console.error('❌ Error stopping Order Worker:', error.message);
      throw error;
    }
  }

  // Add order to queue
  async addOrder(source, order, options = {}) {
    return await queueManager.addJob(this.queueName, {
      source,
      order,
      timestamp: new Date().toISOString()
    }, options);
  }

  // Add high priority order
  async addUrgentOrder(source, order) {
    return await queueManager.addHighPriorityJob(this.queueName, {
      source,
      order,
      priority: 'urgent',
      timestamp: new Date().toISOString()
    });
  }

  // Get queue statistics
  async getStats() {
    return await queueManager.getQueueStats(this.queueName);
  }
}

module.exports = new OrderWorker();
