// services/syncWorkflowService.js
// High-level workflow for status sync back to marketplaces

const marketplaceSyncService = require('./marketplaceSyncService');
const odooIntegrationService = require('./odooIntegrationService');
const mappingEngine = require('./mappingEngine');

class SyncWorkflowService {
  
  // === COMPLETE SYNC WORKFLOW ===
  
  async syncOrderStatusToMarketplace(orderData) {
    try {
      console.log('🔄 Starting order status sync workflow...');
      
      const {
        odoo_order_id,
        marketplace_order_id,
        marketplace,
        shop_id,
        status,
        tracking_number,
        courier_name,
        notes,
        images = []
      } = orderData;

      // Step 1: Get shop mapping
      const shopMapping = await mappingEngine.getShopMapping(marketplace, shop_id);
      if (!shopMapping) {
        throw new Error(`Shop mapping not found: ${marketplace} - ${shop_id}`);
      }

      console.log(`✅ Shop mapping found: ${shopMapping.id}`);

      // Step 2: Get status mapping from shop configuration
      const syncSettings = shopMapping.sync_settings || {};
      const statusMapping = syncSettings.order_status_mapping || {};
      
      // Map Odoo status to marketplace status
      const marketplaceStatus = statusMapping[status] || status;
      console.log(`📊 Status mapping: ${status} -> ${marketplaceStatus}`);

      // Step 3: Update order status in marketplace
      const statusResult = await marketplaceSyncService.updateOrderStatus(
        marketplace,
        shop_id,
        marketplace_order_id,
        {
          status: marketplaceStatus,
          notes: notes,
          images: images
        }
      );

      console.log(`✅ Order status synced to marketplace: ${marketplace_order_id}`);

      // Step 4: Update tracking number if provided
      let trackingResult = null;
      if (tracking_number && ['shipped', 'delivered'].includes(status)) {
        trackingResult = await marketplaceSyncService.updateTrackingNumber(
          marketplace,
          shop_id,
          marketplace_order_id,
          {
            tracking_number: tracking_number,
            courier_name: courier_name || 'Standard Courier',
            shipping_method: 'Standard',
            notes: `Order ${status} - ${notes || ''}`
          }
        );

        console.log(`✅ Tracking number synced to marketplace: ${tracking_number}`);
      }

      // Step 5: Update Odoo with sync status
      await this.updateOdooSyncStatus(odoo_order_id, {
        marketplace_sync_status: 'synced',
        marketplace_sync_time: new Date().toISOString(),
        marketplace_status: marketplaceStatus,
        tracking_number: tracking_number
      });

      const result = {
        success: true,
        odoo_order_id: odoo_order_id,
        marketplace_order_id: marketplace_order_id,
        marketplace: marketplace,
        shop_id: shop_id,
        odoo_status: status,
        marketplace_status: marketplaceStatus,
        tracking_number: tracking_number,
        status_sync: statusResult,
        tracking_sync: trackingResult,
        synced_at: new Date().toISOString()
      };

      console.log(`✅ Order sync workflow completed:`, {
        order_id: result.marketplace_order_id,
        status: result.marketplace_status,
        tracking: result.tracking_number
      });

      return result;
    } catch (error) {
      console.error('❌ Order sync workflow failed:', error.message);
      throw error;
    }
  }

  // === TRACKING NUMBER SYNC WORKFLOW ===
  
  async syncTrackingNumberToMarketplace(trackingData) {
    try {
      console.log('📦 Starting tracking number sync workflow...');
      
      const {
        odoo_order_id,
        marketplace_order_id,
        marketplace,
        shop_id,
        tracking_number,
        courier_name,
        shipping_method = 'Standard',
        notes
      } = trackingData;

      // Step 1: Get shop mapping
      const shopMapping = await mappingEngine.getShopMapping(marketplace, shop_id);
      if (!shopMapping) {
        throw new Error(`Shop mapping not found: ${marketplace} - ${shop_id}`);
      }

      // Step 2: Update tracking number in marketplace
      const result = await marketplaceSyncService.updateTrackingNumber(
        marketplace,
        shop_id,
        marketplace_order_id,
        {
          tracking_number: tracking_number,
          courier_name: courier_name,
          shipping_method: shipping_method,
          notes: notes
        }
      );

      // Step 3: Update Odoo with tracking sync status
      await this.updateOdooSyncStatus(odoo_order_id, {
        tracking_sync_status: 'synced',
        tracking_sync_time: new Date().toISOString(),
        tracking_number: tracking_number
      });

      const syncResult = {
        success: true,
        odoo_order_id: odoo_order_id,
        marketplace_order_id: marketplace_order_id,
        marketplace: marketplace,
        shop_id: shop_id,
        tracking_number: tracking_number,
        courier_name: courier_name,
        result: result,
        synced_at: new Date().toISOString()
      };

      console.log(`✅ Tracking number sync workflow completed:`, {
        order_id: syncResult.marketplace_order_id,
        tracking: syncResult.tracking_number
      });

      return syncResult;
    } catch (error) {
      console.error('❌ Tracking number sync workflow failed:', error.message);
      throw error;
    }
  }

  // === AUTOMATIC SYNC ON PICKING COMPLETION ===
  
  async syncOnPickingCompletion(pickingId) {
    try {
      console.log(`📦 Auto-sync on picking completion: ${pickingId}`);
      
      // Step 1: Get picking details
      const picking = await odooIntegrationService.execute('stock.picking', 'read', [
        [pickingId],
        ['id', 'name', 'state', 'origin', 'carrier_id', 'tracking_number']
      ]).then(pickings => pickings[0]);

      if (!picking) {
        throw new Error(`Picking not found: ${pickingId}`);
      }

      // Step 2: Get sale order from picking
      const saleOrderIds = await odooIntegrationService.execute('sale.order', 'search', [
        [['name', '=', picking.origin]]
      ]);

      if (saleOrderIds.length === 0) {
        throw new Error(`Sale order not found for picking: ${pickingId}`);
      }

      const saleOrder = await odooIntegrationService.execute('sale.order', 'read', [
        saleOrderIds,
        ['id', 'name', 'state', 'x_marketplace_order_id', 'x_marketplace_name', 'x_shop_id']
      ]).then(orders => orders[0]);

      // Step 3: Get carrier information
      let courierName = 'Standard Courier';
      if (picking.carrier_id) {
        const carrier = await odooIntegrationService.execute('delivery.carrier', 'read', [
          [picking.carrier_id],
          ['id', 'name']
        ]).then(carriers => carriers[0]);
        courierName = carrier ? carrier.name : 'Standard Courier';
      }

      // Step 4: Sync to marketplace if it's a marketplace order
      if (saleOrder.x_marketplace_order_id && saleOrder.x_marketplace_name && saleOrder.x_shop_id) {
        const syncData = {
          odoo_order_id: saleOrder.id,
          marketplace_order_id: saleOrder.x_marketplace_order_id,
          marketplace: saleOrder.x_marketplace_name,
          shop_id: saleOrder.x_shop_id,
          status: 'shipped',
          tracking_number: picking.tracking_number,
          courier_name: courierName,
          notes: `Order shipped via ${courierName}`
        };

        return await this.syncOrderStatusToMarketplace(syncData);
      } else {
        console.log(`ℹ️ Not a marketplace order, skipping sync: ${saleOrder.name}`);
        return {
          success: true,
          skipped: true,
          reason: 'Not a marketplace order',
          sale_order: saleOrder.name
        };
      }
    } catch (error) {
      console.error('❌ Auto-sync on picking completion failed:', error.message);
      throw error;
    }
  }

  // === BATCH SYNC WORKFLOW ===
  
  async batchSyncOrders(syncRequests) {
    try {
      console.log(`🔄 Starting batch order sync: ${syncRequests.length} orders`);
      
      const results = [];
      for (const request of syncRequests) {
        try {
          const result = await this.syncOrderStatusToMarketplace(request);
          results.push({ success: true, request, result });
        } catch (error) {
          results.push({ success: false, request, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Batch order sync completed: ${successCount}/${syncRequests.length} successful`);
      
      return results;
    } catch (error) {
      console.error('❌ Batch order sync failed:', error.message);
      throw error;
    }
  }

  async batchSyncTrackingNumbers(trackingRequests) {
    try {
      console.log(`🔄 Starting batch tracking sync: ${trackingRequests.length} requests`);
      
      const results = [];
      for (const request of trackingRequests) {
        try {
          const result = await this.syncTrackingNumberToMarketplace(request);
          results.push({ success: true, request, result });
        } catch (error) {
          results.push({ success: false, request, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Batch tracking sync completed: ${successCount}/${trackingRequests.length} successful`);
      
      return results;
    } catch (error) {
      console.error('❌ Batch tracking sync failed:', error.message);
      throw error;
    }
  }

  // === ODOO SYNC STATUS UPDATE ===
  
  async updateOdooSyncStatus(orderId, syncData) {
    try {
      console.log(`📊 Updating Odoo sync status for order: ${orderId}`);
      
      // Update sale order with sync information
      const updateValues = {
        x_marketplace_sync_status: syncData.marketplace_sync_status || 'synced',
        x_marketplace_sync_time: syncData.marketplace_sync_time || new Date().toISOString(),
        x_tracking_sync_status: syncData.tracking_sync_status || 'synced',
        x_tracking_sync_time: syncData.tracking_sync_time || new Date().toISOString()
      };

      if (syncData.marketplace_status) {
        updateValues.x_marketplace_status = syncData.marketplace_status;
      }

      if (syncData.tracking_number) {
        updateValues.x_tracking_number = syncData.tracking_number;
      }

      await odooIntegrationService.execute('sale.order', 'write', [
        [orderId],
        updateValues
      ]);

      console.log(`✅ Odoo sync status updated: ${orderId}`);
      return true;
    } catch (error) {
      console.error('❌ Error updating Odoo sync status:', error.message);
      // Don't throw - sync status update failure shouldn't stop the process
    }
  }

  // === FAILED SYNC RETRY WORKFLOW ===
  
  async retryFailedSyncs(marketplace = null, shopId = null, hours = 24) {
    try {
      console.log(`🔄 Starting failed sync retry workflow...`);
      
      const results = await marketplaceSyncService.retryFailedSyncs(marketplace, shopId, hours);
      
      console.log(`✅ Failed sync retry completed:`, {
        total: results.length,
        success: results.filter(r => r.success).length
      });

      return results;
    } catch (error) {
      console.error('❌ Failed sync retry workflow failed:', error.message);
      throw error;
    }
  }

  // === SYNC MONITORING ===
  
  async getSyncStatus(orderId) {
    try {
      console.log(`📊 Getting sync status for order: ${orderId}`);
      
      // Get sale order details
      const saleOrder = await odooIntegrationService.execute('sale.order', 'read', [
        [orderId],
        [
          'id', 'name', 'state', 'x_marketplace_order_id', 'x_marketplace_name',
          'x_marketplace_sync_status', 'x_marketplace_sync_time',
          'x_tracking_sync_status', 'x_tracking_sync_time', 'x_tracking_number'
        ]
      ]).then(orders => orders[0]);

      if (!saleOrder) {
        throw new Error(`Sale order not found: ${orderId}`);
      }

      const syncStatus = {
        odoo_order_id: saleOrder.id,
        odoo_order_name: saleOrder.name,
        odoo_status: saleOrder.state,
        marketplace_order_id: saleOrder.x_marketplace_order_id,
        marketplace_name: saleOrder.x_marketplace_name,
        marketplace_sync_status: saleOrder.x_marketplace_sync_status,
        marketplace_sync_time: saleOrder.x_marketplace_sync_time,
        tracking_sync_status: saleOrder.x_tracking_sync_status,
        tracking_sync_time: saleOrder.x_tracking_sync_time,
        tracking_number: saleOrder.x_tracking_number
      };

      console.log(`✅ Sync status retrieved:`, syncStatus);
      return syncStatus;
    } catch (error) {
      console.error('❌ Error getting sync status:', error.message);
      throw error;
    }
  }

  // === HEALTH CHECK ===
  
  async healthCheck() {
    try {
      const marketplaceHealth = await marketplaceSyncService.healthCheck();
      const mappingStats = await mappingEngine.getShopMappingStats();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        marketplace_sync: marketplaceHealth,
        mapping_engine: {
          total_shops: mappingStats.total,
          active_shops: mappingStats.active
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // === SCHEDULED SYNC WORKFLOW ===
  
  async scheduledSyncCheck() {
    try {
      console.log('⏰ Starting scheduled sync check...');
      
      // Get orders that need sync (based on last sync time)
      const ordersNeedingSync = await this.getOrdersNeedingSync();
      
      if (ordersNeedingSync.length === 0) {
        console.log('ℹ️ No orders need sync');
        return { processed: 0, results: [] };
      }

      console.log(`📊 Found ${ordersNeedingSync.length} orders needing sync`);
      
      // Process orders that need sync
      const results = [];
      for (const order of ordersNeedingSync) {
        try {
          const result = await this.syncOrderStatusToMarketplace(order);
          results.push({ success: true, order, result });
        } catch (error) {
          results.push({ success: false, order, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Scheduled sync completed: ${successCount}/${ordersNeedingSync.length} successful`);
      
      return {
        processed: ordersNeedingSync.length,
        success: successCount,
        results: results
      };
    } catch (error) {
      console.error('❌ Scheduled sync check failed:', error.message);
      throw error;
    }
  }

  async getOrdersNeedingSync() {
    try {
      // This would query orders that need sync based on last sync time
      // For now, return empty array
      console.log('📊 Getting orders needing sync...');
      return [];
    } catch (error) {
      console.error('❌ Error getting orders needing sync:', error.message);
      return [];
    }
  }
}

module.exports = new SyncWorkflowService();
