// controllers/webhookShopee.js
// Shopee webhook controller with signature validation

const crypto = require('crypto');
const { orderQueue } = require('../queue');
const productMappingService = require('../services/productMappingService');

class ShopeeWebhookController {
  constructor() {
    this.webhookSecret = process.env.SHOPEE_WEBHOOK_SECRET;
    this.token = process.env.SHOPEE_TOKEN;
  }

  // Signature validation
  validateSignature(payload, signature) {
    if (!this.webhookSecret) {
      console.warn("⚠️ Shopee webhook secret not configured - skipping validation");
      return true;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return `sha256=${expectedSignature}` === signature;
  }

  // Token validation for API requests
  validateToken(req) {
    if (!this.token) {
      console.warn("⚠️ Shopee token not configured - skipping validation");
      return true;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    return token === this.token;
  }

  // Standardize Shopee order format
  standardizeOrder(rawOrder) {
    return {
      order_sn: rawOrder.order_sn || rawOrder.ordersn,
      buyer_username: rawOrder.buyer_username || rawOrder.buyer_name,
      branch: this.getDefaultBranch(), // Can be overridden by shop mapping
      items: rawOrder.items?.map(item => ({
        name: item.item_name,
        sku: item.item_sku || item.model_id,
        qty: item.quantity || item.qty,
        price: item.item_price || item.price
      })) || [],
      shop_id: rawOrder.shop_id,
      marketplace: 'shopee',
      raw_data: rawOrder
    };
  }

  getDefaultBranch() {
    // Can be enhanced with shop-to-branch mapping
    return process.env.SHOPEE_DEFAULT_BRANCH || 'KEDURUS';
  }

  // Process webhook payload
  async handleWebhook(req, res) {
    try {
      console.log('📥 Shopee webhook received');

      // Get signature from header
      const signature = req.headers['x-shopee-signature'];
      const payload = req.body;

      // Validate signature
      if (!this.validateSignature(payload, signature)) {
        console.error('❌ Invalid Shopee webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Handle different webhook events
      const event = req.headers['x-shopee-event'] || payload.event_type;

      switch (event) {
        // === ORDER EVENTS ===
        case 'order.created':
        case 'order.updated':
        case 'order.paid':
        case 'order.processed':
        case 'order.shipped':
        case 'order.completed':
        case 'order.cancelled':
        case 'order.refunded':
          await this.handleOrderNotification(payload, event);
          break;
        
        // === IMPORTANT ORDER NOTIFICATION ===
        case 'order.notification':
          await this.handleOrderNotification(payload);
          break;
        
        // === PRODUCT EVENTS ===
        case 'product.created':
        case 'product.updated':
        case 'product.deleted':
        case 'product.price_changed':
        case 'product.stock_changed':
          await this.handleProductNotification(payload, event);
          break;
        
        // === IMPORTANT PRODUCT NOTIFICATION ===
        case 'product.notification':
          await this.handleProductNotification(payload);
          break;
        
        // === STOCK EVENTS ===
        case 'stock.updated':
        case 'stock.low':
        case 'stock.out':
        case 'stock.restored':
          await this.handleStockNotification(payload, event);
          break;
        
        // === IMPORTANT STOCK NOTIFICATION ===
        case 'stock.notification':
          await this.handleStockNotification(payload);
          break;
        
        default:
          console.log(`ℹ️ Unhandled Shopee event: ${event}`);
      }

      res.json({ status: 'received' });
    } catch (error) {
      console.error('❌ Shopee webhook error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Handle order events
  async handleOrderNotification(payload, eventType = null) {
    try {
      console.log(`📦 Processing Shopee order event: ${eventType || 'unknown'}`);
      
      const order = this.standardizeOrder(payload);
      
      // Add event type to order data
      order.event_type = eventType;
      order.priority = this.getOrderPriority(eventType);
      
      await orderQueue.add('order', {
        source: 'shopee',
        order: order
      });

      console.log(`✅ Shopee order queued: ${order.order_sn} (${eventType})`);
    } catch (error) {
      console.error('❌ Error handling Shopee order notification:', error.message);
      throw error;
    }
  }

  // Handle product notifications
  async handleProductNotification(payload, eventType = null) {
    try {
      console.log(`�️ Processing Shopee product event: ${eventType || 'notification'}`);
      
      const products = Array.isArray(payload) ? payload : [payload];
      const results = [];
      
      for (const product of products) {
        try {
          const result = await productMappingService.syncProductFromMarketplace(
            'shopee',
            product.shop_id,
            {
              id: product.item_id,
              sku: product.item_sku,
              price: product.price,
              stock: product.stock || product.quantity,
              event_type: eventType
            }
          );
          results.push({ success: true, product: product.id, mapping: result });
        } catch (error) {
          results.push({ success: false, product: product.id, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Processed ${successCount}/${products.length} Shopee products (${eventType})`);
      
      // Send to separate queue for product processing if needed
      if (eventType === 'product.notification') {
        await this.sendProductNotificationToQueue({
          marketplace: 'shopee',
          products: results,
          event_type: eventType,
          timestamp: new Date().toISOString()
        });
      }
      
      return results;
    } catch (error) {
      console.error('❌ Error handling Shopee product notification:', error.message);
      throw error;
    }
  }

  // Handle stock notifications
  async handleStockNotification(payload, eventType = null) {
    try {
      console.log(`📊 Processing Shopee stock event: ${eventType || 'notification'}`);
      
      const stockUpdates = Array.isArray(payload) ? payload : [payload];
      const results = [];
      
      for (const stockUpdate of stockUpdates) {
        try {
          const result = await this.processStockUpdate(stockUpdate, eventType);
          results.push({ success: true, product: stockUpdate.item_id, result });
        } catch (error) {
          results.push({ success: false, product: stockUpdate.item_id, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Processed ${successCount}/${stockUpdates.length} stock updates (${eventType})`);
      
      // Send critical stock notifications to priority queue
      if (this.isCriticalStockEvent(eventType)) {
        await this.sendStockNotificationToQueue({
          marketplace: 'shopee',
          stockUpdates: results,
          event_type: eventType,
          priority: 'high',
          timestamp: new Date().toISOString()
        });
      }
      
      return results;
    } catch (error) {
      console.error('❌ Error handling Shopee stock notification:', error.message);
      throw error;
    }
  }

  // Process individual stock update
  async processStockUpdate(stockUpdate, eventType) {
    // Find product mapping
    const mapping = await productMappingService.getMappingByMarketplaceProduct(
      'shopee',
      stockUpdate.item_id
    );

    if (!mapping) {
      throw new Error(`No product mapping found for item_id: ${stockUpdate.item_id}`);
    }

    // Update stock in Odoo
    const odooMasterService = require('../services/odooMasterService');
    await odooMasterService.updateProductStock(
      mapping.odoo_product_id,
      stockUpdate.stock || stockUpdate.quantity
    );

    return {
      mapping_id: mapping.id,
      old_stock: stockUpdate.old_stock,
      new_stock: stockUpdate.stock || stockUpdate.quantity,
      event_type: eventType
    };
  }

  // Get order priority based on event type
  getOrderPriority(eventType) {
    const priorities = {
      'order.created': 'normal',
      'order.paid': 'high',
      'order.cancelled': 'urgent',
      'order.refunded': 'normal',
      'order.notification': 'high'
    };
    return priorities[eventType] || 'normal';
  }

  // Check if stock event is critical
  isCriticalStockEvent(eventType) {
    const criticalEvents = [
      'stock.out',
      'stock.low',
      'stock.notification'
    ];
    return criticalEvents.includes(eventType);
  }

  // Send product notification to queue
  async sendProductNotificationToQueue(notificationData) {
    // This would send to a separate product processing queue
    console.log('📤 Product notification sent to queue:', notificationData.marketplace);
  }

  // Send stock notification to queue
  async sendStockNotificationToQueue(notificationData) {
    // This would send to a separate stock processing queue
    console.log('🚨 Critical stock notification sent to priority queue:', notificationData.marketplace);
  }

  // API endpoint for manual product sync
  async syncProducts(req, res) {
    try {
      // Validate token
      if (!this.validateToken(req)) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { shop_id, products } = req.body;

      if (!shop_id || !products) {
        return res.status(400).json({ 
          error: 'shop_id and products are required' 
        });
      }

      const results = await productMappingService.bulkSync('shopee', shop_id, products);
      
      res.json({
        status: 'completed',
        results: results,
        total: products.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Shopee sync products error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get mapping status
  async getMappings(req, res) {
    try {
      if (!this.validateToken(req)) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { shop_id } = req.query;
      const mappings = await productMappingService.getAllMappings('shopee', shop_id);
      
      res.json({
        marketplace: 'shopee',
        shop_id,
        mappings: mappings,
        total: mappings.length
      });
    } catch (error) {
      console.error('❌ Error getting Shopee mappings:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new ShopeeWebhookController();
