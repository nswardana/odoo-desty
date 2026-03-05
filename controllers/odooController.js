// controllers/odooController.js
// Controller for Odoo integration operations

const odooWorkflowService = require('../services/odooWorkflowService');

class OdooController {
  
  // === ORDER WORKFLOW ENDPOINTS ===
  
  // Process marketplace order
  async processOrder(req, res) {
    try {
      const orderData = req.body;
      
      // Validate required fields
      if (!orderData.marketplace || !orderData.shop_id || !orderData.marketplace_order_id) {
        return res.status(400).json({ 
          error: 'Required fields: marketplace, shop_id, marketplace_order_id' 
        });
      }

      const result = await odooWorkflowService.processMarketplaceOrder(orderData);
      
      res.json({
        status: 'success',
        order: result
      });
    } catch (error) {
      console.error('❌ Process order error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Update order status
  async updateOrderStatus(req, res) {
    try {
      const { marketplace_order_id } = req.params;
      const updateData = req.body;
      
      const orderData = {
        ...updateData,
        marketplace_order_id: marketplace_order_id
      };

      const result = await odooWorkflowService.updateOrderStatus(orderData);
      
      res.json({
        status: 'success',
        order: result
      });
    } catch (error) {
      console.error('❌ Update order status error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Batch process orders
  async batchProcessOrders(req, res) {
    try {
      const { orders } = req.body;
      
      if (!orders || !Array.isArray(orders)) {
        return res.status(400).json({ error: 'orders array is required' });
      }

      const results = await odooWorkflowService.processBatchOrders(orders);
      
      res.json({
        status: 'success',
        results: results,
        total: orders.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Batch process orders error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === PRODUCT WORKFLOW ENDPOINTS ===
  
  // Sync product from marketplace
  async syncProduct(req, res) {
    try {
      const productData = req.body;
      
      // Validate required fields
      if (!productData.marketplace || !productData.shop_id || !productData.sku) {
        return res.status(400).json({ 
          error: 'Required fields: marketplace, shop_id, sku' 
        });
      }

      const result = await odooWorkflowService.syncProductFromMarketplace(productData);
      
      res.json({
        status: 'success',
        product: result
      });
    } catch (error) {
      console.error('❌ Sync product error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === STOCK WORKFLOW ENDPOINTS ===
  
  // Sync stock from marketplace
  async syncStock(req, res) {
    try {
      const stockData = req.body;
      
      // Validate required fields
      if (!stockData.marketplace || !stockData.shop_id || !stockData.sku) {
        return res.status(400).json({ 
          error: 'Required fields: marketplace, shop_id, sku' 
        });
      }

      const result = await odooWorkflowService.syncStockFromMarketplace(stockData);
      
      res.json({
        status: 'success',
        stock: result
      });
    } catch (error) {
      console.error('❌ Sync stock error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Batch sync stock
  async batchSyncStock(req, res) {
    try {
      const { stock_updates } = req.body;
      
      if (!stock_updates || !Array.isArray(stock_updates)) {
        return res.status(400).json({ error: 'stock_updates array is required' });
      }

      const results = [];
      for (const stockData of stock_updates) {
        try {
          const result = await odooWorkflowService.syncStockFromMarketplace(stockData);
          results.push({ success: true, sku: stockData.sku, result });
        } catch (error) {
          results.push({ success: false, sku: stockData.sku, error: error.message });
        }
      }

      res.json({
        status: 'success',
        results: results,
        total: stock_updates.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Batch sync stock error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === HEALTH CHECK ENDPOINTS ===
  
  // Odoo integration health check
  async healthCheck(req, res) {
    try {
      const health = await odooWorkflowService.healthCheck();
      
      res.json({
        status: health.status,
        health: health
      });
    } catch (error) {
      console.error('❌ Health check error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Odoo connection test
  async testConnection(req, res) {
    try {
      const odooIntegrationService = require('../services/odooIntegrationService');
      const health = await odooIntegrationService.healthCheck();
      
      res.json({
        status: health.status === 'healthy' ? 'success' : 'error',
        connection: health
      });
    } catch (error) {
      console.error('❌ Test connection error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === UTILITY ENDPOINTS ===
  
  // Check product by SKU
  async checkProduct(req, res) {
    try {
      const { sku } = req.params;
      
      const odooIntegrationService = require('../services/odooIntegrationService');
      const product = await odooIntegrationService.checkProductSKU(sku);
      
      if (!product) {
        return res.status(404).json({ 
          error: 'Product not found',
          sku: sku
        });
      }
      
      res.json({
        status: 'success',
        product: product
      });
    } catch (error) {
      console.error('❌ Check product error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Check partner
  async checkPartner(req, res) {
    try {
      const partnerData = req.body;
      
      const odooIntegrationService = require('../services/odooIntegrationService');
      const partner = await odooIntegrationService.checkPartner(partnerData);
      
      if (!partner) {
        return res.status(404).json({ 
          error: 'Partner not found',
          search_criteria: partnerData
        });
      }
      
      res.json({
        status: 'success',
        partner: partner
      });
    } catch (error) {
      console.error('❌ Check partner error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Create partner
  async createPartner(req, res) {
    try {
      const partnerData = req.body;
      
      const odooIntegrationService = require('../services/odooIntegrationService');
      const partner = await odooIntegrationService.createPartner(partnerData);
      
      res.json({
        status: 'success',
        partner: partner
      });
    } catch (error) {
      console.error('❌ Create partner error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get order status mapping
  async getOrderStatusMapping(req, res) {
    try {
      const { marketplace, shop_id } = req.params;
      
      const mappingEngine = require('../services/mappingEngine');
      const shopMapping = await mappingEngine.getShopMapping(marketplace, shop_id);
      
      if (!shopMapping) {
        return res.status(404).json({ 
          error: 'Shop mapping not found',
          marketplace: marketplace,
          shop_id: shop_id
        });
      }

      const syncSettings = shopMapping.sync_settings || {};
      const statusMapping = syncSettings.order_status_mapping || {};
      
      res.json({
        status: 'success',
        marketplace: marketplace,
        shop_id: shop_id,
        status_mapping: statusMapping
      });
    } catch (error) {
      console.error('❌ Get order status mapping error:', error.message);
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

module.exports = new OdooController();
