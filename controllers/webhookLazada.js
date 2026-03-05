// controllers/webhookLazada.js
// Lazada webhook controller with signature validation

const crypto = require('crypto');
const { orderQueue } = require('../queue');
const productMappingService = require('../services/productMappingService');

class LazadaWebhookController {
  constructor() {
    this.webhookSecret = process.env.LAZADA_WEBHOOK_SECRET;
    this.token = process.env.LAZADA_TOKEN;
  }

  // Signature validation for Lazada webhooks
  validateSignature(payload, signature) {
    if (!this.webhookSecret) {
      console.warn("⚠️ Lazada webhook secret not configured - skipping validation");
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
      console.warn("⚠️ Lazada token not configured - skipping validation");
      return true;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    return token === this.token;
  }

  // Standardize Lazada order format
  standardizeOrder(rawOrder) {
    return {
      order_sn: rawOrder.order_number || rawOrder.order_id,
      buyer_username: rawOrder.customer_first_name && rawOrder.customer_last_name 
        ? `${rawOrder.customer_first_name} ${rawOrder.customer_last_name}`
        : rawOrder.customer_name,
      branch: this.getDefaultBranch(),
      items: rawOrder.order_items?.map(item => ({
        name: item.name,
        sku: item.seller_sku || item.sku,
        qty: item.quantity || item.qty,
        price: item.price || item.item_price
      })) || [],
      shop_id: rawOrder.shop_id,
      marketplace: 'lazada',
      raw_data: rawOrder
    };
  }

  getDefaultBranch() {
    return process.env.LAZADA_DEFAULT_BRANCH || 'PUCANG';
  }

  // Main webhook handler
  async handleWebhook(req, res) {
    try {
      console.log('📥 Lazada webhook received');

      // Get signature from header
      const signature = req.headers['x-lazada-signature'];
      const payload = req.body;

      // Validate signature
      if (!this.validateSignature(payload, signature)) {
        console.error('❌ Invalid Lazada webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Handle different webhook events
      const event = req.headers['x-lazada-event'] || payload.event_type;

      switch (event) {
        case 'order.created':
        case 'order.updated':
        case 'order.status_changed':
          await this.handleOrder(payload);
          break;
        
        case 'product.updated':
        case 'product.price_changed':
          await this.handleProductUpdate(payload);
          break;
        
        default:
          console.log(`ℹ️ Unhandled Lazada event: ${event}`);
      }

      res.json({ status: 'received' });
    } catch (error) {
      console.error('❌ Lazada webhook error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Handle order events
  async handleOrder(payload) {
    try {
      const order = this.standardizeOrder(payload);
      
      await orderQueue.add('order', {
        source: 'lazada',
        order: order
      });

      console.log(`✅ Lazada order queued: ${order.order_sn}`);
    } catch (error) {
      console.error('❌ Error handling Lazada order:', error.message);
      throw error;
    }
  }

  // Handle product update events
  async handleProductUpdate(payload) {
    try {
      console.log('🔄 Processing Lazada product update...');
      
      const products = Array.isArray(payload) ? payload : [payload];
      
      for (const product of products) {
        await productMappingService.syncProductFromMarketplace(
          'lazada',
          product.shop_id,
          {
            id: product.item_id,
            sku: product.seller_sku,
            price: product.price
          }
        );
      }

      console.log(`✅ Synced ${products.length} Lazada products`);
    } catch (error) {
      console.error('❌ Error handling Lazada product update:', error.message);
      throw error;
    }
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

      const results = await productMappingService.bulkSync('lazada', shop_id, products);
      
      res.json({
        status: 'completed',
        results: results,
        total: products.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Lazada sync products error:', error.message);
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
      const mappings = await productMappingService.getAllMappings('lazada', shop_id);
      
      res.json({
        marketplace: 'lazada',
        shop_id,
        mappings: mappings,
        total: mappings.length
      });
    } catch (error) {
      console.error('❌ Error getting Lazada mappings:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new LazadaWebhookController();
