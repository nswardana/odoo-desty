// workers/stockWorker.js
// Worker for marketplace stock processing queue

const queueManager = require('../queues/queueManager');
const productMappingService = require('../services/productMappingService');
const odooMasterService = require('../services/odooMasterService');

class StockWorker {
  constructor() {
    this.queueName = 'marketplace-stock-queue';
    this.worker = null;
  }

  // Start the stock worker
  async start() {
    try {
      console.log('🚀 Starting Stock Worker...');
      
      this.worker = queueManager.createWorker(this.queueName, async (job) => {
        try {
          console.log(`📊 Processing stock job:`, {
            id: job.id,
            data: job.data
          });

          const result = await this.processStockUpdate(job.data);
          
          console.log(`✅ Stock processed successfully:`, {
            jobId: job.id,
            result: result
          });

          return result;
        } catch (error) {
          console.error(`❌ Stock processing failed:`, {
            jobId: job.id,
            error: error.message,
            data: job.data
          });
          throw error;
        }
      });

      console.log(`✅ Stock Worker started for queue: ${this.queueName}`);
      
    } catch (error) {
      console.error('❌ Error starting Stock Worker:', error.message);
      throw error;
    }
  }

  // Process stock update
  async processStockUpdate(stockData) {
    try {
      const {
        marketplace,
        shop_id,
        product_id,
        marketplace_product_id,
        stock_quantity,
        operation_type,
        priority = 'normal'
      } = stockData;

      // Find product mapping
      const mapping = await productMappingService.getMappingByMarketplaceProduct(
        marketplace,
        marketplace_product_id
      );

      if (!mapping) {
        throw new Error(`No product mapping found for ${marketplace_product_id}`);
      }

      // Update stock in Odoo
      const updateResult = await odooMasterService.updateProductStock(
        mapping.odoo_product_id,
        stock_quantity
      );

      // Log the stock update
      await this.logStockUpdate({
        mapping_id: mapping.id,
        marketplace,
        shop_id,
        product_id,
        old_stock: stock_quantity.old_stock,
        new_stock: stock_quantity,
        operation_type,
        priority
      });

      return {
        success: true,
        mapping_id: mapping.id,
        odoo_product_id: mapping.odoo_product_id,
        stock_updated: stock_quantity,
        operation: operation_type
      };

    } catch (error) {
      console.error('❌ Error processing stock update:', error.message);
      throw error;
    }
  }

  // Log stock update to database (optional)
  async logStockUpdate(logData) {
    try {
      // This would log to a stock_updates table for audit trail
      console.log('📝 Stock update logged:', logData);
      return true;
    } catch (error) {
      console.error('❌ Error logging stock update:', error.message);
      // Don't throw - logging failure shouldn't stop the process
    }
  }

  // Add stock update to queue
  async addStockUpdate(marketplace, shopId, productId, stockData, options = {}) {
    return await queueManager.addJob(this.queueName, {
      marketplace,
      shop_id: shopId,
      product_id: productId,
      ...stockData,
      timestamp: new Date().toISOString()
    }, options);
  }

  // Add critical stock update (high priority)
  async addCriticalStockUpdate(marketplace, shopId, productId, stockData) {
    return await queueManager.addHighPriorityJob(this.queueName, {
      marketplace,
      shop_id: shopId,
      product_id: productId,
      ...stockData,
      priority: 'critical',
      timestamp: new Date().toISOString()
    });
  }

  // Add bulk stock updates
  async addBulkStockUpdates(stockUpdates) {
    const jobs = stockUpdates.map(update => ({
      ...update,
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

  // Stop the stock worker
  async stop() {
    try {
      if (this.worker) {
        await this.worker.close();
        console.log(`🔌 Stock Worker stopped for queue: ${this.queueName}`);
      }
    } catch (error) {
      console.error('❌ Error stopping Stock Worker:', error.message);
      throw error;
    }
  }

  // Get queue statistics
  async getStats() {
    return await queueManager.getQueueStats(this.queueName);
  }
}

module.exports = new StockWorker();
