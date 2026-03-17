// jobs/inventorySyncJob.js
// Scheduled job for inventory synchronization

const inventorySyncService = require('../services/inventorySyncService');
const inventoryMappingService = require('../services/inventoryMappingService');

class InventorySyncJob {
  constructor() {
    this.syncService = inventorySyncService;
    this.mappingService = inventoryMappingService;
    this.isRunning = false;
  }

  // Main scheduled sync job
  async run() {
    if (this.isRunning) {
      console.log('⚠️ Inventory sync job already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('🕐 Starting scheduled inventory sync job...');
    
    try {
      const startTime = Date.now();
      const results = await this.scheduledDestyToOdooSync();
      const duration = Date.now() - startTime;
      
      console.log(`✅ Inventory sync job completed in ${duration}ms`);
      console.log(`📊 Results: ${results.successful || 0} successful, ${results.failed || 0} failed`);
      
      // Send notifications if needed
      await this.sendSyncSummary(results);
      
      return results;
      
    } catch (error) {
      console.error('❌ Inventory sync job failed:', error.message);
      await this.sendErrorNotification(error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Scheduled sync from Desty to Odoo
  async scheduledDestyToOdooSync() {
    console.log('🔄 Starting Desty → Odoo inventory sync...');
    
    try {
      const mappings = await this.mappingService.getActiveMappings();
      const results = {
        total: mappings.length,
        successful: 0,
        failed: 0,
        errors: [],
        processed: []
      };
      
      console.log(`📋 Processing ${mappings.length} product mappings`);
      
      // Process in batches to avoid overwhelming the APIs
      const batchSize = parseInt(process.env.INVENTORY_SYNC_BATCH_SIZE) || 50;
      
      for (let i = 0; i < mappings.length; i += batchSize) {
        const batch = mappings.slice(i, i + batchSize);
        console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(mappings.length/batchSize)} (${batch.length} items)`);
        
        const batchResults = await this.processBatch(batch);
        
        results.successful += batchResults.successful;
        results.failed += batchResults.failed;
        results.errors.push(...batchResults.errors);
        results.processed.push(...batchResults.processed);
        
        // Small delay between batches to avoid rate limiting
        if (i + batchSize < mappings.length) {
          await this.delay(1000);
        }
      }
      
      console.log(`✅ Desty → Odoo sync completed: ${results.successful}/${results.total} successful`);
      return results;
      
    } catch (error) {
      console.error('❌ Desty → Odoo sync failed:', error.message);
      throw error;
    }
  }

  // Process a batch of mappings
  async processBatch(mappings) {
    const results = {
      successful: 0,
      failed: 0,
      errors: [],
      processed: []
    };
    
    // Process mappings concurrently within the batch
    const promises = mappings.map(async (mapping) => {
      try {
        // Get current stock from Desty
        const destyStock = await this.getDestyStockWithRetry(mapping);
        
        // Get current stock from Odoo
        const odooStock = await this.getOdooStockWithRetry(mapping);
        
        // Check if sync is needed
        const stockDifference = Math.abs(destyStock - odooStock);
        const tolerance = parseInt(process.env.INVENTORY_STOCK_TOLERANCE) || 1;
        
        if (stockDifference > tolerance) {
          console.log(`🔄 Sync needed: ${mapping.odoo_sku} (Odoo: ${odooStock}, Desty: ${destyStock})`);
          
          const syncResult = await this.syncService.syncDestyToOdoo(mapping.odoo_sku, destyStock);
          
          if (syncResult.success) {
            results.successful++;
            results.processed.push({
              sku: mapping.odoo_sku,
              oldStock: odooStock,
              newStock: destyStock,
              status: 'synced'
            });
          } else {
            results.failed++;
            results.errors.push({
              sku: mapping.odoo_sku,
              error: syncResult.error
            });
          }
        } else {
          console.log(`ℹ️ No sync needed: ${mapping.odoo_sku} (difference: ${stockDifference})`);
          results.processed.push({
            sku: mapping.odoo_sku,
            oldStock: odooStock,
            newStock: destyStock,
            status: 'no_change'
          });
        }
        
        // Update last sync timestamp
        await this.mappingService.updateLastSync(mapping.id);
        
      } catch (error) {
        console.error(`❌ Failed to process mapping ${mapping.odoo_sku}:`, error.message);
        results.failed++;
        results.errors.push({
          sku: mapping.odoo_sku,
          error: error.message
        });
      }
    });
    
    await Promise.allSettled(promises);
    return results;
  }

  // Get Desty stock with retry logic
  async getDestyStockWithRetry(mapping, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const stock = await this.syncService.destyService.getProductStock(
          mapping.desty_item_id,
          mapping.desty_shop_id
        );
        return stock;
      } catch (error) {
        console.warn(`⚠️ Desty stock fetch attempt ${attempt} failed for ${mapping.odoo_sku}:`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
  }

  // Get Odoo stock with retry logic
  async getOdooStockWithRetry(mapping, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const stock = await this.syncService.odooService.getCurrentStock(mapping.odoo_product_id);
        return stock;
      } catch (error) {
        console.warn(`⚠️ Odoo stock fetch attempt ${attempt} failed for ${mapping.odoo_sku}:`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
  }

  // Real-time sync from Odoo to Desty (triggered by stock moves)
  async handleOdooStockMove(moveData) {
    console.log('🔄 Handling Odoo stock move for real-time sync...');
    
    try {
      const { product_id, product_qty, location_id, location_dest_id } = moveData;
      
      // Only process internal location moves
      if (location_id && location_dest_id) {
        const currentStock = await this.syncService.odooService.getCurrentStock(product_id);
        await this.syncService.syncOdooToDesty(product_id, currentStock);
        
        console.log(`✅ Real-time sync completed for product ${product_id}`);
      }
      
    } catch (error) {
      console.error('❌ Real-time sync failed:', error.message);
      // Queue for retry if real-time sync fails
      await this.queueForRetry(moveData);
    }
  }

  // Queue failed sync for retry
  async queueForRetry(moveData) {
    try {
      // This would integrate with your queue system
      console.log(`🔄 Queuing failed sync for retry: ${moveData.product_id}`);
      
      // Add to retry queue with exponential backoff
      // Implementation depends on your queue system (Redis, BullMQ, etc.)
      
    } catch (error) {
      console.error('❌ Failed to queue for retry:', error.message);
    }
  }

  // Health check for sync job
  async healthCheck() {
    try {
      const stats = await this.syncService.getSyncStats(24);
      const failedSyncs = await this.syncService.getFailedSyncs(24);
      
      const health = {
        status: 'healthy',
        lastRun: null,
        successRate: 0,
        failedCount: failedSyncs.length,
        isRunning: this.isRunning,
        stats
      };
      
      // Calculate success rate
      const totalSyncs = stats.reduce((sum, stat) => sum + parseInt(stat.count), 0);
      const successSyncs = stats
        .filter(stat => stat.status === 'success')
        .reduce((sum, stat) => sum + parseInt(stat.count), 0);
      
      health.successRate = totalSyncs > 0 ? (successSyncs / totalSyncs) * 100 : 0;
      
      // Determine health status
      if (health.successRate < 90 || health.failedCount > 50) {
        health.status = 'unhealthy';
      } else if (health.successRate < 95 || health.failedCount > 10) {
        health.status = 'warning';
      }
      
      return health;
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      return {
        status: 'error',
        error: error.message,
        isRunning: this.isRunning
      };
    }
  }

  // Send sync summary notification
  async sendSyncSummary(results) {
    try {
      const threshold = parseInt(process.env.INVENTORY_NOTIFICATION_THRESHOLD) || 10;
      
      if (results.failed > threshold) {
        console.log(`📧 High failure rate detected: ${results.failed}/${results.total} failed`);
        
        // Send notification (email, Slack, etc.)
        await this.sendNotification({
          type: 'sync_summary',
          subject: `Inventory Sync Alert: ${results.failed} failures`,
          message: `Inventory sync completed with ${results.failed} failures out of ${results.total} total mappings.`,
          details: results
        });
      }
      
    } catch (error) {
      console.error('❌ Failed to send sync summary:', error.message);
    }
  }

  // Send error notification
  async sendErrorNotification(error) {
    try {
      await this.sendNotification({
        type: 'sync_error',
        subject: 'Inventory Sync Job Failed',
        message: `The scheduled inventory sync job failed with error: ${error.message}`,
        details: {
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (notificationError) {
      console.error('❌ Failed to send error notification:', notificationError.message);
    }
  }

  // Send notification (email, Slack, etc.)
  async sendNotification(notification) {
    console.log(`📧 Sending notification: ${notification.subject}`);
    
    // Implementation depends on your notification system
    // Example: email, Slack webhook, Microsoft Teams, etc.
    
    const emailConfig = process.env.INVENTORY_NOTIFICATION_EMAIL;
    const slackWebhook = process.env.INVENTORY_SLACK_WEBHOOK;
    
    if (emailConfig) {
      // Send email notification
      console.log(`📧 Email would be sent to: ${emailConfig}`);
    }
    
    if (slackWebhook) {
      // Send Slack notification
      console.log(`💬 Slack notification would be sent to webhook`);
    }
  }

  // Utility delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get job status
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: null, // Would be stored in database
      nextRun: null, // Would be calculated based on schedule
      stats: null   // Would be fetched from database
    };
  }
}

module.exports = new InventorySyncJob();
