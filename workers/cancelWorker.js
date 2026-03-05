// workers/cancelWorker.js
// Worker for marketplace cancel processing queue

const queueManager = require('../queues/queueManager');
const accountService = require('../services/accountService');

class CancelWorker {
  constructor() {
    this.queueName = 'marketplace-cancel-queue';
    this.worker = null;
  }

  // Start the cancel worker
  async start() {
    try {
      console.log('🚀 Starting Cancel Worker...');
      
      this.worker = queueManager.createWorker(this.queueName, async (job) => {
        try {
          console.log(`❌ Processing cancel job:`, {
            id: job.id,
            data: job.data
          });

          const result = await this.processCancel(job.data);
          
          console.log(`✅ Cancel processed successfully:`, {
            jobId: job.id,
            result: result
          });

          return result;
        } catch (error) {
          console.error(`❌ Cancel processing failed:`, {
            jobId: job.id,
            error: error.message,
            data: job.data
          });
          throw error;
        }
      });

      console.log(`✅ Cancel Worker started for queue: ${this.queueName}`);
      
    } catch (error) {
      console.error('❌ Error starting Cancel Worker:', error.message);
      throw error;
    }
  }

  // Process cancellation
  async processCancel(cancelData) {
    try {
      const {
        marketplace,
        shop_id,
        order_id,
        marketplace_order_id,
        reason,
        cancel_type,
        priority = 'normal'
      } = cancelData;

      // Validate required fields
      if (!marketplace || !order_id || !cancel_type) {
        throw new Error('Required fields: marketplace, order_id, cancel_type');
      }

      // Get account for API access
      const account = await accountService.getAccountByShop(marketplace, shop_id);
      if (!account) {
        throw new Error(`Account not found for ${marketplace} - ${shop_id}`);
      }

      // Perform cancellation based on marketplace
      const cancelResult = await this.performMarketplaceCancel(
        marketplace,
        account,
        {
          order_id,
          marketplace_order_id,
          reason,
          cancel_type
        }
      );

      // Log the cancellation
      await this.logCancellation({
        marketplace,
        shop_id,
        order_id,
        marketplace_order_id,
        reason,
        cancel_type,
        result: cancelResult
      });

      return {
        success: true,
        marketplace,
        order_id,
        cancel_result: cancelResult,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Error processing cancellation:', error.message);
      throw error;
    }
  }

  // Perform marketplace-specific cancellation
  async performMarketplaceCancel(marketplace, account, cancelData) {
    try {
      // This would integrate with each marketplace's API
      console.log(`🔄 Performing ${marketplace} cancellation:`, cancelData);

      // Mock implementation - replace with actual API calls
      const mockResults = {
        'shopee': { cancelled: true, refund_initiated: false },
        'tokopedia': { cancelled: true, refund_initiated: true },
        'lazada': { cancelled: true, refund_initiated: false },
        'tiktok': { cancelled: true, refund_initiated: false }
      };

      const result = mockResults[marketplace] || { cancelled: false };

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      return result;
    } catch (error) {
      console.error(`❌ Error performing ${marketplace} cancellation:`, error.message);
      throw error;
    }
  }

  // Log cancellation to database (optional)
  async logCancellation(logData) {
    try {
      // This would log to a cancellations table for audit trail
      console.log('📝 Cancellation logged:', logData);
      return true;
    } catch (error) {
      console.error('❌ Error logging cancellation:', error.message);
    }
  }

  // Add cancellation to queue
  async addCancellation(marketplace, shopId, orderId, cancelData, options = {}) {
    return await queueManager.addJob(this.queueName, {
      marketplace,
      shop_id: shopId,
      order_id: orderId,
      ...cancelData,
      timestamp: new Date().toISOString()
    }, options);
  }

  // Add urgent cancellation
  async addUrgentCancellation(marketplace, shopId, orderId, cancelData) {
    return await queueManager.addHighPriorityJob(this.queueName, {
      marketplace,
      shop_id: shopId,
      order_id: orderId,
      ...cancelData,
      priority: 'urgent',
      timestamp: new Date().toISOString()
    });
  }

  // Add bulk cancellations
  async addBulkCancellations(cancellations) {
    const jobs = cancellations.map(cancel => ({
      ...cancel,
      timestamp: new Date().toISOString()
    }));

    const results = [];
    for (const job of jobs) {
      try {
        const result = await queueManager.addJob(this.queueName, job);
        results.push({ success: true, job: result });
      } catch (error) {
        results.push({ success: false, job, error: error.message });
      }
    }

    return results;
  }

  // Stop the cancel worker
  async stop() {
    try {
      if (this.worker) {
        await this.worker.close();
        console.log(`🔌 Cancel Worker stopped for queue: ${this.queueName}`);
      }
    } catch (error) {
      console.error('❌ Error stopping Cancel Worker:', error.message);
      throw error;
    }
  }

  // Get queue statistics
  async getStats() {
    return await queueManager.getQueueStats(this.queueName);
  }
}

module.exports = new CancelWorker();
