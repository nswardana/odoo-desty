// controllers/mappingController.js
// Controller for shop mapping management

const mappingEngine = require('../services/mappingEngine');

class MappingController {
  
  // === SHOP MAPPING ENDPOINTS ===
  
  // Create new shop mapping
  async createShopMapping(req, res) {
    try {
      // Validate admin token (if required)
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const shopData = req.body;
      const shop = await mappingEngine.createShopMapping(shopData);
      
      res.json({
        status: 'success',
        shop: shop,
        message: 'Shop mapping created successfully'
      });
    } catch (error) {
      console.error('❌ Create shop mapping error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Update shop mapping
  async updateShopMapping(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { shop_id } = req.params;
      const updateData = req.body;

      const shop = await mappingEngine.updateShopMapping(shop_id, updateData);
      
      res.json({
        status: 'success',
        shop: shop,
        message: 'Shop mapping updated successfully'
      });
    } catch (error) {
      console.error('❌ Update shop mapping error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get shop mapping by marketplace and shop
  async getShopMapping(req, res) {
    try {
      const { marketplace, shop_id } = req.params;
      
      const shop = await mappingEngine.getShopMapping(marketplace, shop_id);
      if (!shop) {
        return res.status(404).json({ error: 'Shop mapping not found' });
      }

      res.json({
        status: 'success',
        shop: shop
      });
    } catch (error) {
      console.error('❌ Get shop mapping error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get shop mapping by ID
  async getShopMappingById(req, res) {
    try {
      const { shop_id } = req.params;
      
      const shop = await mappingEngine.getShopMappingById(shop_id);
      if (!shop) {
        return res.status(404).json({ error: 'Shop mapping not found' });
      }

      res.json({
        status: 'success',
        shop: shop
      });
    } catch (error) {
      console.error('❌ Get shop mapping by ID error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // List all shop mappings
  async listShopMappings(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { marketplace, company_id, active_only } = req.query;
      const shops = await mappingEngine.getAllShopMappings(
        marketplace, 
        company_id, 
        active_only === 'true'
      );

      res.json({
        status: 'success',
        shops: shops,
        total: shops.length
      });
    } catch (error) {
      console.error('❌ List shop mappings error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Deactivate shop mapping
  async deactivateShopMapping(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { shop_id } = req.params;
      const shop = await mappingEngine.deactivateShopMapping(shop_id);
      
      res.json({
        status: 'success',
        shop: shop,
        message: 'Shop mapping deactivated successfully'
      });
    } catch (error) {
      console.error('❌ Deactivate shop mapping error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === SYNC SETTINGS ENDPOINTS ===
  
  // Update sync settings
  async updateSyncSettings(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { shop_id } = req.params;
      const { sync_settings } = req.body;

      const shop = await mappingEngine.updateSyncSettings(shop_id, sync_settings);
      
      res.json({
        status: 'success',
        shop: shop,
        message: 'Sync settings updated successfully'
      });
    } catch (error) {
      console.error('❌ Update sync settings error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get default sync settings for marketplace
  async getDefaultSyncSettings(req, res) {
    try {
      const { marketplace } = req.params;
      
      const settings = await mappingEngine.getDefaultSyncSettings(marketplace);
      
      res.json({
        status: 'success',
        marketplace: marketplace,
        default_settings: settings
      });
    } catch (error) {
      console.error('❌ Get default sync settings error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === WEBHOOK CONFIGURATION ENDPOINTS ===
  
  // Update webhook configuration
  async updateWebhookConfig(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { shop_id } = req.params;
      const { webhook_url, webhook_secret } = req.body;

      const shop = await mappingEngine.updateWebhookConfig(shop_id, webhook_url, webhook_secret);
      
      res.json({
        status: 'success',
        shop: shop,
        message: 'Webhook configuration updated successfully'
      });
    } catch (error) {
      console.error('❌ Update webhook config error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Validate webhook configuration
  async validateWebhookConfig(req, res) {
    try {
      const { shop_id } = req.params;
      
      const validation = await mappingEngine.validateWebhookConfig(shop_id);
      
      res.json({
        status: 'success',
        validation: validation
      });
    } catch (error) {
      console.error('❌ Validate webhook config error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === VALIDATION ENDPOINTS ===
  
  // Validate shop configuration
  async validateShopConfiguration(req, res) {
    try {
      const { shop_id } = req.params;
      
      const validation = await mappingEngine.validateShopConfiguration(shop_id);
      
      res.json({
        status: 'success',
        validation: validation
      });
    } catch (error) {
      console.error('❌ Validate shop configuration error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Validate Odoo entities
  async validateOdooEntities(req, res) {
    try {
      const { company_id, warehouse_id, pricelist_id, journal_id } = req.body;
      
      const validation = await mappingEngine.validateOdooEntities(
        company_id, 
        warehouse_id, 
        pricelist_id, 
        journal_id
      );
      
      res.json({
        status: 'success',
        validation: validation
      });
    } catch (error) {
      console.error('❌ Validate Odoo entities error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === SYNC OPERATIONS ENDPOINTS ===
  
  // Get shops needing sync
  async getShopsNeedingSync(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { minutes_ago = 30 } = req.query;
      const shops = await mappingEngine.getShopsNeedingSync(parseInt(minutes_ago));
      
      res.json({
        status: 'success',
        shops: shops,
        total: shops.length,
        minutes_ago: parseInt(minutes_ago)
      });
    } catch (error) {
      console.error('❌ Get shops needing sync error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Update last sync timestamp
  async updateLastSync(req, res) {
    try {
      const { shop_id } = req.params;
      
      const success = await mappingEngine.updateLastSync(shop_id);
      
      res.json({
        status: 'success',
        message: 'Last sync timestamp updated successfully'
      });
    } catch (error) {
      console.error('❌ Update last sync error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === BULK OPERATIONS ENDPOINTS ===
  
  // Bulk create shop mappings
  async bulkCreateShopMappings(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { shops } = req.body;
      if (!shops || !Array.isArray(shops)) {
        return res.status(400).json({ error: 'shops array is required' });
      }

      const results = await mappingEngine.bulkCreateShopMappings(shops);
      
      res.json({
        status: 'success',
        results: results,
        total: shops.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Bulk create shop mappings error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === STATISTICS ENDPOINTS ===
  
  // Get shop mapping statistics
  async getShopMappingStats(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const stats = await mappingEngine.getShopMappingStats();
      
      res.json({
        status: 'success',
        stats: stats
      });
    } catch (error) {
      console.error('❌ Get shop mapping stats error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === MIGRATION ENDPOINTS ===
  
  // Migrate from legacy mappings
  async migrateFromLegacyMappings(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { legacy_mappings } = req.body;
      if (!legacy_mappings || !Array.isArray(legacy_mappings)) {
        return res.status(400).json({ error: 'legacy_mappings array is required' });
      }

      const results = await mappingEngine.migrateFromLegacyMappings(legacy_mappings);
      
      res.json({
        status: 'success',
        results: results,
        total: legacy_mappings.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Migrate legacy mappings error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === HELPER METHODS ===
  
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

module.exports = new MappingController();
