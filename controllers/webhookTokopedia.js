// controllers/webhookTokopedia.js
// Tokopedia webhook controller with signature validation

const crypto = require('crypto');
const { orderQueue } = require('../queue');
const productMappingService = require('../services/productMappingService');

class TokopediaWebhookController {
  constructor() {
    this.webhookSecret = process.env.TOKOPEDIA_WEBHOOK_SECRET;
    this.token = process.env.TOKOPEDIA_TOKEN;
  }

  // Signature validation for Tokopedia webhooks
  validateSignature(payload, signature) {
    if (!this.webhookSecret) {
      console.warn("⚠️ Tokopedia webhook secret not configured - skipping validation");
      return true;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return signature === expectedSignature;
  }

  // Token validation
  validateToken(req) {
    if (!this.token) {
      console.warn("⚠️ Tokopedia token not configured - skipping validation");
      return true;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    return token === this.token;
  }

  // Standardize Tokopedia order format
  standardizeOrder(rawOrder) {
    return {
      order_sn: rawOrder.invoice_ref_num || rawOrder.order_id,
      buyer_username: rawOrder.customer_name || rawOrder.buyer_name,
      branch: this.getDefaultBranch(),
      items: rawOrder.products?.map(item => ({
        name: item.product_name,
        sku: item.product_sku || item.sku,
        qty: item.quantity || item.qty,
        price: item.product_price || item.price
      })) || [],
      shop_id: rawOrder.shop_id,
      marketplace: 'tokopedia',
      raw_data: rawOrder
    };
  }

  getDefaultBranch() {
    return process.env.TOKOPEDIA_DEFAULT_BRANCH || 'GUBENG';
  }

  // Main webhook handler
  async handleWebhook(req, res) {
    try {
      console.log('📥 Tokopedia webhook received');

      // Get signature from header
      const signature = req.headers['x-tokopedia-signature'];
      const payload = req.body;

      // Validate signature
      if (!this.validateSignature(payload, signature)) {
        console.error('❌ Invalid Tokopedia webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Handle different webhook events
      const event = req.headers['x-tokopedia-event'] || payload.event;

      switch (event) {
        // === ORDER EVENTS ===
        case 'order.created':
        case 'order.updated':
        case 'order.payment_success':
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
          console.log(`ℹ️ Unhandled Tokopedia event: ${event}`);
      }

      res.json({ status: 'received' });
    } catch (error) {
      console.error('❌ Tokopedia webhook error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Handle order events
  async handleOrderNotification(payload, eventType = null) {
    try {
      console.log(`📦 Processing Tokopedia order event: ${eventType || 'unknown'}`);
      
      const order = this.standardizeOrder(payload);
      order.event_type = eventType;
      order.priority = this.getOrderPriority(eventType);
      
      await orderQueue.add('order', {
        source: 'tokopedia',
        order: order
      });

      console.log(`✅ Tokopedia order queued: ${order.order_sn} (${eventType})`);
    } catch (error) {
      console.error('❌ Error handling Tokopedia order notification:', error.message);
      throw error;
    }
  }

  // Handle product notifications
  async handleProductNotification(payload, eventType = null) {
    try {
      console.log(`�️ Processing Tokopedia product event: ${eventType || 'notification'}`);
      
      const products = Array.isArray(payload) ? payload : [payload];
      const results = [];
      
      for (const product of products) {
        try {
          const result = await productMappingService.syncProductFromMarketplace(
            'tokopedia',
            product.shop_id,
            {
              id: product.product_id,
              sku: product.product_sku,
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
      console.log(`✅ Processed ${successCount}/${products.length} Tokopedia products (${eventType})`);
      
      if (eventType === 'product.notification') {
        await this.sendProductNotificationToQueue({
          marketplace: 'tokopedia',
          products: results,
          event_type: eventType,
          timestamp: new Date().toISOString()
        });
      }
      
      return results;
    } catch (error) {
      console.error('❌ Error handling Tokopedia product notification:', error.message);
      throw error;
    }
  }

  // Handle stock notifications
  async handleStockNotification(payload, eventType = null) {
    try {
      console.log(`📊 Processing Tokopedia stock event: ${eventType || 'notification'}`);
      
      const stockUpdates = Array.isArray(payload) ? payload : [payload];
      const results = [];
      
      for (const stockUpdate of stockUpdates) {
        try {
          const result = await this.processStockUpdate(stockUpdate, eventType);
          results.push({ success: true, product: stockUpdate.product_id, result });
        } catch (error) {
          results.push({ success: false, product: stockUpdate.product_id, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Processed ${successCount}/${stockUpdates.length} stock updates (${eventType})`);
      
      if (this.isCriticalStockEvent(eventType)) {
        await this.sendStockNotificationToQueue({
          marketplace: 'tokopedia',
          stockUpdates: results,
          event_type: eventType,
          priority: 'high',
          timestamp: new Date().toISOString()
        });
      }
      
      return results;
    } catch (error) {
      console.error('❌ Error handling Tokopedia stock notification:', error.message);
      throw error;
    }
  }

  // Process individual stock update
  async processStockUpdate(stockUpdate, eventType) {
    const mapping = await productMappingService.getMappingByMarketplaceProduct(
      'tokopedia',
      stockUpdate.product_id
    );

    if (!mapping) {
      throw new Error(`No product mapping found for product_id: ${stockUpdate.product_id}`);
    }

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
      'order.payment_success': 'high',
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
    console.log('📤 Product notification sent to queue:', notificationData.marketplace);
  }

  // Send stock notification to queue
  async sendStockNotificationToQueue(notificationData) {
    console.log('🚨 Critical stock notification sent to priority queue:', notificationData.marketplace);
  }

  // API endpoint for manual product sync
  async syncProducts(req, res) {
    try {
      if (!this.validateToken(req)) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { shop_id, products } = req.body;

      if (!shop_id || !products) {
        return res.status(400).json({ 
          error: 'shop_id and products are required' 
        });
      }

      const results = await productMappingService.bulkSync('tokopedia', shop_id, products);
      
      res.json({
        status: 'completed',
        results: results,
        total: products.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Tokopedia sync products error:', error.message);
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
      const mappings = await productMappingService.getAllMappings('tokopedia', shop_id);
      
      res.json({
        marketplace: 'tokopedia',
        shop_id,
        mappings: mappings,
        total: mappings.length
      });
    } catch (error) {
      console.error('❌ Error getting Tokopedia mappings:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new TokopediaWebhookController();
