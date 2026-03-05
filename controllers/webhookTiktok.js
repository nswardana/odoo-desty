// controllers/webhookTiktok.js
// TikTok Shop webhook controller with signature validation

const crypto = require('crypto');
const { orderQueue } = require('../queue');
const productMappingService = require('../services/productMappingService');

class TiktokWebhookController {
  constructor() {
    this.webhookSecret = process.env.TIKTOK_WEBHOOK_SECRET;
    this.token = process.env.TIKTOK_TOKEN;
  }

  // Signature validation for TikTok webhooks
  validateSignature(payload, signature) {
    if (!this.webhookSecret) {
      console.warn("⚠️ TikTok webhook secret not configured - skipping validation");
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
      console.warn("⚠️ TikTok token not configured - skipping validation");
      return true;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    return token === this.token;
  }

  // Standardize TikTok order format
  standardizeOrder(rawOrder) {
    return {
      order_sn: rawOrder.order_id || rawOrder.order_number,
      buyer_username: rawOrder.buyer_name || rawOrder.customer_name,
      branch: this.getDefaultBranch(),
      items: rawOrder.order_items?.map(item => ({
        name: item.product_name || item.title,
        sku: item.sku || item.product_sku,
        qty: item.quantity || item.qty,
        price: item.price || item.unit_price
      })) || [],
      shop_id: rawOrder.shop_id,
      marketplace: 'tiktok',
      raw_data: rawOrder
    };
  }

  getDefaultBranch() {
    return process.env.TIKTOK_DEFAULT_BRANCH || 'KEDURUS';
  }

  // Main webhook handler
  async handleWebhook(req, res) {
    try {
      console.log('📥 TikTok webhook received');

      // Get signature from header
      const signature = req.headers['x-tiktok-signature'];
      const payload = req.body;

      // Validate signature
      if (!this.validateSignature(payload, signature)) {
        console.error('❌ Invalid TikTok webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Handle different webhook events
      const event = req.headers['x-tiktok-event'] || payload.event_type;

      switch (event) {
        case 'order.created':
        case 'order.updated':
        case 'order.paid':
          await this.handleOrder(payload);
          break;
        
        case 'product.updated':
        case 'product.price_changed':
          await this.handleProductUpdate(payload);
          break;
        
        default:
          console.log(`ℹ️ Unhandled TikTok event: ${event}`);
      }

      res.json({ status: 'received' });
    } catch (error) {
      console.error('❌ TikTok webhook error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Handle order events
  async handleOrder(payload) {
    try {
      const order = this.standardizeOrder(payload);
      
      await orderQueue.add('order', {
        source: 'tiktok',
        order: order
      });

      console.log(`✅ TikTok order queued: ${order.order_sn}`);
    } catch (error) {
      console.error('❌ Error handling TikTok order:', error.message);
      throw error;
    }
  }

  // Handle product update events
  async handleProductUpdate(payload) {
    try {
      console.log('🔄 Processing TikTok product update...');
      
      const products = Array.isArray(payload) ? payload : [payload];
      
      for (const product of products) {
        await productMappingService.syncProductFromMarketplace(
          'tiktok',
          product.shop_id,
          {
            id: product.product_id,
            sku: product.sku,
            price: product.price
          }
        );
      }

      console.log(`✅ Synced ${products.length} TikTok products`);
    } catch (error) {
      console.error('❌ Error handling TikTok product update:', error.message);
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

      const results = await productMappingService.bulkSync('tiktok', shop_id, products);
      
      res.json({
        status: 'completed',
        results: results,
        total: products.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ TikTok sync products error:', error.message);
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
      const mappings = await productMappingService.getAllMappings('tiktok', shop_id);
      
      res.json({
        marketplace: 'tiktok',
        shop_id,
        mappings: mappings,
        total: mappings.length
      });
    } catch (error) {
      console.error('❌ Error getting TikTok mappings:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new TiktokWebhookController();
