// controllers/syncController.js
// Controller for marketplace sync operations

const syncWorkflowService = require('../services/syncWorkflowService');
const marketplaceSyncService = require('../services/marketplaceSyncService');

class SyncController {
  
  // === ORDER SYNC ENDPOINTS ===
  
  // Sync order status to marketplace
  async syncOrderStatus(req, res) {
    try {
      const syncData = req.body;
      
      // Validate required fields
      if (!syncData.marketplace || !syncData.shop_id || !syncData.marketplace_order_id) {
        return res.status(400).json({ 
          error: 'Required fields: marketplace, shop_id, marketplace_order_id' 
        });
      }

      const result = await syncWorkflowService.syncOrderStatusToMarketplace(syncData);
      
      res.json({
        status: 'success',
        sync: result
      });
    } catch (error) {
      console.error('❌ Sync order status error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Sync tracking number to marketplace
  async syncTrackingNumber(req, res) {
    try {
      const trackingData = req.body;
      
      // Validate required fields
      if (!trackingData.marketplace || !trackingData.shop_id || !trackingData.marketplace_order_id || !trackingData.tracking_number) {
        return res.status(400).json({ 
          error: 'Required fields: marketplace, shop_id, marketplace_order_id, tracking_number' 
        });
      }

      const result = await syncWorkflowService.syncTrackingNumberToMarketplace(trackingData);
      
      res.json({
        status: 'success',
        sync: result
      });
    } catch (error) {
      console.error('❌ Sync tracking number error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Auto-sync on picking completion
  async syncOnPicking(req, res) {
    try {
      const { picking_id } = req.params;
      
      if (!picking_id) {
        return res.status(400).json({ error: 'picking_id is required' });
      }

      const result = await syncWorkflowService.syncOnPickingCompletion(parseInt(picking_id));
      
      res.json({
        status: 'success',
        sync: result
      });
    } catch (error) {
      console.error('❌ Sync on picking error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === BATCH SYNC ENDPOINTS ===
  
  // Batch sync order status
  async batchSyncOrders(req, res) {
    try {
      const { sync_requests } = req.body;
      
      if (!sync_requests || !Array.isArray(sync_requests)) {
        return res.status(400).json({ error: 'sync_requests array is required' });
      }

      const results = await syncWorkflowService.batchSyncOrders(sync_requests);
      
      res.json({
        status: 'success',
        results: results,
        total: sync_requests.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Batch sync orders error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Batch sync tracking numbers
  async batchSyncTrackingNumbers(req, res) {
    try {
      const { tracking_requests } = req.body;
      
      if (!tracking_requests || !Array.isArray(tracking_requests)) {
        return res.status(400).json({ error: 'tracking_requests array is required' });
      }

      const results = await syncWorkflowService.batchSyncTrackingNumbers(tracking_requests);
      
      res.json({
        status: 'success',
        results: results,
        total: tracking_requests.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Batch sync tracking numbers error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === SYNC STATUS ENDPOINTS ===
  
  // Get sync status for order
  async getSyncStatus(req, res) {
    try {
      const { order_id } = req.params;
      
      if (!order_id) {
        return res.status(400).json({ error: 'order_id is required' });
      }

      const syncStatus = await syncWorkflowService.getSyncStatus(parseInt(order_id));
      
      res.json({
        status: 'success',
        sync_status: syncStatus
      });
    } catch (error) {
      console.error('❌ Get sync status error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === FAILED SYNC MANAGEMENT ===
  
  // Retry failed syncs
  async retryFailedSyncs(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { marketplace, shop_id, hours = 24 } = req.query;
      
      const results = await syncWorkflowService.retryFailedSyncs(
        marketplace,
        shop_id,
        parseInt(hours)
      );
      
      res.json({
        status: 'success',
        results: results,
        total: results.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Retry failed syncs error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get sync history
  async getSyncHistory(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { marketplace, shop_id, limit = 100 } = req.query;
      
      const history = await marketplaceSyncService.getSyncHistory(
        marketplace,
        shop_id,
        parseInt(limit)
      );
      
      res.json({
        status: 'success',
        history: history
      });
    } catch (error) {
      console.error('❌ Get sync history error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get failed syncs
  async getFailedSyncs(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { marketplace, shop_id, hours = 24 } = req.query;
      
      const failedSyncs = await marketplaceSyncService.getFailedSyncs(
        marketplace,
        shop_id,
        parseInt(hours)
      );
      
      res.json({
        status: 'success',
        failed_syncs: failedSyncs
      });
    } catch (error) {
      console.error('❌ Get failed syncs error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === SCHEDULED SYNC ENDPOINTS ===
  
  // Run scheduled sync check
  async runScheduledSync(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const result = await syncWorkflowService.scheduledSyncCheck();
      
      res.json({
        status: 'success',
        scheduled_sync: result
      });
    } catch (error) {
      console.error('❌ Run scheduled sync error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === HEALTH CHECK ENDPOINTS ===
  
  // Sync service health check
  async healthCheck(req, res) {
    try {
      const health = await syncWorkflowService.healthCheck();
      
      res.json({
        status: health.status,
        health: health
      });
    } catch (error) {
      console.error('❌ Health check error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Marketplace sync service health check
  async marketplaceHealthCheck(req, res) {
    try {
      const health = await marketplaceSyncService.healthCheck();
      
      res.json({
        status: health.status,
        health: health
      });
    } catch (error) {
      console.error('❌ Marketplace health check error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === UTILITY ENDPOINTS ===
  
  // Test marketplace connection
  async testMarketplaceConnection(req, res) {
    try {
      const { marketplace, shop_id } = req.body;
      
      if (!marketplace || !shop_id) {
        return res.status(400).json({ 
          error: 'Required fields: marketplace, shop_id' 
        });
      }

      // Test connection by making a simple API call
      const health = await marketplaceSyncService.healthCheck();
      
      if (health.marketplaces[marketplace]) {
        res.json({
          status: 'success',
          marketplace: marketplace,
          shop_id: shop_id,
          connection: 'healthy',
          config: health.marketplaces[marketplace]
        });
      } else {
        res.status(404).json({
          status: 'error',
          marketplace: marketplace,
          error: 'Marketplace not configured'
        });
      }
    } catch (error) {
      console.error('❌ Test marketplace connection error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get marketplace configurations
  async getMarketplaceConfigs(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const health = await marketplaceSyncService.healthCheck();
      
      res.json({
        status: 'success',
        marketplaces: health.marketplaces
      });
    } catch (error) {
      console.error('❌ Get marketplace configs error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === ADMIN ENDPOINTS ===
  
  // Validate admin token
  validateAdminToken(req) {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken) {
      console.warn("⚠️ Admin token not configured - skipping validation");
      return true;
    }

    const authHeader = req.headers['x-admin-token'];
    return authHeader === adminToken;
  }

  // Admin middleware
  adminMiddleware() {
    return (req, res, next) => {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }
      next();
    };
  }
}

module.exports = new SyncController();
