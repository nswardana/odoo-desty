// services/inventorySyncService.js
// Main inventory synchronization orchestrator

const odooInventoryService = require('./odooInventoryService');
const destyInventoryService = require('./destyInventoryService');
const inventoryMappingService = require('./inventoryMappingService');

class InventorySyncService {
  constructor() {
    this.odooService = odooInventoryService;
    this.destyService = destyInventoryService;
    this.mappingService = inventoryMappingService;
  }

  // Sync stock from Odoo to Desty
  async syncOdooToDesty(productId, stock) {
    console.log(`🔄 Syncing Odoo→Desty: Product ${productId}, Stock: ${stock}`);
    
    try {
      const mapping = await this.mappingService.getByOdooId(productId);
      
      if (!mapping) {
        console.warn(`⚠️ No mapping found for Odoo product ${productId}`);
        return { success: false, message: 'No product mapping found' };
      }

      const result = await this.destyService.updateStock(
        mapping.desty_external_code,
        stock,
        mapping.desty_shop_id,
        mapping.desty_warehouse_id
      );
      
      await this.logSync(mapping.odoo_sku, 'odoo', 'desty', stock, 'success', null, result);
      
      console.log(`✅ Synced Odoo→Desty: ${mapping.odoo_sku} -> ${stock}`);
      return { success: true, data: result };
      
    } catch (error) {
      console.error(`❌ Failed to sync Odoo→Desty for product ${productId}:`, error.message);
      await this.logSync(null, 'odoo', 'desty', stock, 'failed', error.message, null);
      
      // Schedule retry if needed
      await this.handleFailedSync(productId, 'odoo', 'desty', stock, error);
      
      return { success: false, error: error.message };
    }
  }

  // Sync stock from Desty to Odoo
  async syncDestyToOdoo(sku, stock) {
    console.log(`🔄 Syncing Desty→Odoo: SKU ${sku}, Stock: ${stock}`);
    
    try {
      const mapping = await this.mappingService.getBySku(sku);
      
      if (!mapping) {
        console.warn(`⚠️ No mapping found for SKU ${sku}`);
        return { success: false, message: 'No product mapping found' };
      }

      const result = await this.odooService.adjustStock(mapping.odoo_product_id, stock);
      
      await this.logSync(sku, 'desty', 'odoo', stock, 'success', null, result);
      
      console.log(`✅ Synced Desty→Odoo: ${sku} -> ${stock}`);
      return { success: true, data: result };
      
    } catch (error) {
      console.error(`❌ Failed to sync Desty→Odoo for SKU ${sku}:`, error.message);
      await this.logSync(sku, 'desty', 'odoo', stock, 'failed', error.message, null);
      
      // Schedule retry if needed
      await this.handleFailedSync(sku, 'desty', 'odoo', stock, error);
      
      return { success: false, error: error.message };
    }
  }

  // Handle Odoo stock move event
  async onOdooStockMove(moveData) {
    const { product_id, product_qty, location_id, location_dest_id } = moveData;
    
    // Only process internal location moves (not customer/supplier)
    if (location_id && location_dest_id) {
      const currentStock = await this.odooService.getCurrentStock(product_id);
      await this.syncOdooToDesty(product_id, currentStock);
    }
  }

  // Scheduled sync from Desty to Odoo
  async scheduledDestyToOdooSync() {
    console.log('🕐 Starting scheduled Desty→Odoo sync...');
    
    try {
      const mappings = await this.mappingService.getActiveMappings();
      const results = [];
      
      for (const mapping of mappings) {
        try {
          // Get current stock from Desty
          const destyStock = await this.destyService.getProductStock(
            mapping.desty_item_id,
            mapping.desty_shop_id
          );
          
          // Get current stock from Odoo
          const odooStock = await this.odooService.getCurrentStock(
            mapping.odoo_product_id
          );
          
          // Sync if different (with tolerance)
          if (Math.abs(destyStock - odooStock) > 1) {
            const result = await this.syncDestyToOdoo(mapping.odoo_sku, destyStock);
            results.push({
              sku: mapping.odoo_sku,
              oldStock: odooStock,
              newStock: destyStock,
              result
            });
          }
          
        } catch (error) {
          console.error(`❌ Sync failed for ${mapping.odoo_sku}:`, error.message);
          results.push({
            sku: mapping.odoo_sku,
            error: error.message
          });
        }
      }
      
      console.log(`✅ Scheduled sync completed. Processed ${mappings.length} products`);
      return results;
      
    } catch (error) {
      console.error('❌ Scheduled sync failed:', error.message);
      throw error;
    }
  }

  // Conflict resolution
  resolveConflict(source, target, sourceStock, targetStock) {
    // Rule 1: Odoo is master for physical inventory
    if (source === 'odoo' && target === 'desty') {
      return sourceStock;
    }
    
    // Rule 2: For Desty → Odoo, use conservative approach
    if (source === 'desty' && target === 'odoo') {
      return Math.min(sourceStock, targetStock);
    }
    
    // Rule 3: Manual intervention for large discrepancies
    if (Math.abs(sourceStock - targetStock) > 100) {
      this.flagForManualReview(source, target, sourceStock, targetStock);
      return targetStock; // Keep current until review
    }
    
    return sourceStock;
  }

  // Log sync operation
  async logSync(sku, source, target, stock, status, error = null, apiResponse = null) {
    try {
      await db.query(`
        INSERT INTO inventory_sync_log 
        (sku, source, target, stock, status, error_message, api_response)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [sku, source, target, stock, status, error, JSON.stringify(apiResponse)]);
    } catch (logError) {
      console.error('❌ Failed to log sync operation:', logError.message);
    }
  }

  // Handle failed sync with retry logic
  async handleFailedSync(identifier, source, target, stock, error) {
    const retryCount = await this.getRetryCount(identifier, source, target);
    const maxRetries = process.env.INVENTORY_SYNC_RETRY_ATTEMPTS || 3;
    
    if (retryCount < maxRetries) {
      console.log(`🔄 Scheduling retry ${retryCount + 1}/${maxRetries} for ${identifier}`);
      
      // Schedule retry with exponential backoff
      const delay = Math.pow(2, retryCount) * 60000; // 1min, 2min, 4min
      setTimeout(async () => {
        if (source === 'odoo' && target === 'desty') {
          await this.syncOdooToDesty(identifier, stock);
        } else if (source === 'desty' && target === 'odoo') {
          await this.syncDestyToOdoo(identifier, stock);
        }
      }, delay);
      
      await this.incrementRetryCount(identifier, source, target);
      
    } else {
      console.error(`🚨 Max retries exceeded for ${identifier}, escalating to manual review`);
      await this.escalateToManualReview(identifier, source, target, stock, error);
    }
  }

  // Get retry count
  async getRetryCount(identifier, source, target) {
    try {
      const result = await db.query(`
        SELECT COUNT(*) as count FROM inventory_sync_log 
        WHERE sku = $1 AND source = $2 AND target = $3 
        AND status = 'failed' 
        AND sync_time > NOW() - INTERVAL '24 hours'
      `, [identifier, source, target]);
      
      return result.rows[0].count;
    } catch (error) {
      return 0;
    }
  }

  // Increment retry count
  async incrementRetryCount(identifier, source, target) {
    // This would be implemented based on your retry tracking mechanism
    console.log(`📊 Incremented retry count for ${identifier}`);
  }

  // Escalate to manual review
  async escalateToManualReview(identifier, source, target, stock, error) {
    try {
      await db.query(`
        INSERT INTO manual_review_queue 
        (identifier, source, target, stock, error_message, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [identifier, source, target, stock, error.message]);
      
      // Send notification (email, Slack, etc.)
      await this.sendManualReviewNotification(identifier, source, target, error);
      
    } catch (escalationError) {
      console.error('❌ Failed to escalate to manual review:', escalationError.message);
    }
  }

  // Send manual review notification
  async sendManualReviewNotification(identifier, source, target, error) {
    console.log(`📧 Manual review required: ${identifier} (${source}→${target})`);
    // Implement notification logic (email, Slack, etc.)
  }

  // Flag for manual review
  flagForManualReview(source, target, sourceStock, targetStock) {
    console.log(`🚨 Large stock discrepancy detected: ${source}→${target}`);
    console.log(`   Source stock: ${sourceStock}, Target stock: ${targetStock}`);
    console.log(`   Difference: ${Math.abs(sourceStock - targetStock)}`);
    // Implement manual review flagging logic
  }

  // Get sync statistics
  async getSyncStats(hours = 24) {
    try {
      const result = await db.query(`
        SELECT 
          source,
          target,
          status,
          COUNT(*) as count,
          MAX(sync_time) as last_sync
        FROM inventory_sync_log 
        WHERE sync_time > NOW() - INTERVAL '${hours} hours'
        GROUP BY source, target, status
        ORDER BY last_sync DESC
      `);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get sync stats:', error.message);
      return [];
    }
  }

  // Get failed syncs
  async getFailedSyncs(hours = 24, limit = 100) {
    try {
      const result = await db.query(`
        SELECT * FROM inventory_sync_log 
        WHERE status = 'failed' 
        AND sync_time > NOW() - INTERVAL '${hours} hours'
        ORDER BY sync_time DESC
        LIMIT $1
      `, [limit]);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get failed syncs:', error.message);
      return [];
    }
  }
}

module.exports = new InventorySyncService();
