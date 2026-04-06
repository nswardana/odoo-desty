// controllers/webhookDesty.js
// Desty API webhook controller with signature validation

const crypto = require('crypto');
const queueModule = require('../queue');
const { orderQueue } = queueModule;
const { addJobWithDedlication } = queueModule;
const productMappingService = require('../services/productMappingService');

class DestyWebhookController {
  constructor() {
    this.webhookSecret = process.env.DESTY_WEBHOOK_SECRET;
    this.apiKey = process.env.DESTY_API_KEY;
    this.baseUrl = process.env.DESTY_API_BASE_URL || 'https://api.desty.app';
  }

  // Signature validation for Desty webhooks
  validateSignature(payload, signature) {
    // Skip validation for testing
    if (!this.webhookSecret || process.env.NODE_ENV === 'development') {
      console.warn("⚠️ Desty webhook signature validation skipped (development mode)");
      return true;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return signature === expectedSignature;
  }

  // API key validation
  validateApiKey(req) {
    if (!this.apiKey) {
      console.warn("⚠️ Desty API key not configured - skipping validation");
      return true;
    }

    const authHeader = req.headers['x-api-key'];
    const apiKey = authHeader || req.headers['authorization']?.replace('Bearer ', '');

    return apiKey === this.apiKey;
  }

  // Standardize Desty order format
  standardizeOrder(rawOrder) {
    return {
      order_sn: rawOrder.order_id || rawOrder.order_number || rawOrder.id,
      buyer_username: rawOrder.customer?.name || rawOrder.buyer_name || rawOrder.customer_name,
      buyer_email: rawOrder.customer?.email || rawOrder.buyer_email,
      buyer_phone: rawOrder.customer?.phone || rawOrder.buyer_phone,
      branch: this.getDefaultBranch(),
      items: this.standardizeItems(rawOrder.items || []),
      shop_id: rawOrder.shop_id || rawOrder.store_id,
      marketplace: 'desty',
      order_date: rawOrder.created_at || rawOrder.order_date,
      payment_status: rawOrder.payment_status || 'pending',
      shipping_status: rawOrder.shipping_status || 'pending',
      total_amount: rawOrder.total_amount || this.calculateTotal(rawOrder.items),
      shipping_address: this.standardizeAddress(rawOrder.shipping_address),
      billing_address: this.standardizeAddress(rawOrder.billing_address),
      notes: rawOrder.notes || rawOrder.customer_notes,
      payment_method: rawOrder.payment_method,
      shipping_method: rawOrder.shipping_method,
      tracking_number: rawOrder.tracking_number,
      raw_data: rawOrder
    };
  }

  getDefaultBranch() {
    return process.env.DESTY_DEFAULT_BRANCH || 'KEDURUS';
  }

  // Standardize order items
  standardizeItems(items) {
    return items?.map(item => ({
      name: item.product_name || item.title || item.name,
      sku: item.sku || item.product_sku || item.product_id,
      qty: item.quantity || item.qty || item.amount,
      price: item.price || item.unit_price || item.amount,
      weight: item.weight || 0,
      dimensions: item.dimensions || {},
      variant: item.variant || null
    })) || [];
  }

  // Standardize address format
  standardizeAddress(address) {
    if (!address) return null;
    
    return {
      name: address.name || address.recipient_name,
      phone: address.phone || address.recipient_phone,
      email: address.email || address.recipient_email,
      address: address.address || address.street_address,
      city: address.city,
      province: address.province || address.state,
      postal_code: address.postal_code || address.zip_code,
      country: address.country || 'Indonesia',
      coordinates: address.coordinates || null
    };
  }

  // Calculate total order amount
  calculateTotal(items) {
    if (!items || items.length === 0) return 0;
    
    return items.reduce((total, item) => {
      const price = item.price || item.unit_price || item.amount || 0;
      const quantity = item.quantity || item.qty || item.amount || 1;
      return total + (price * quantity);
    }, 0);
  }

  // Validate order structure
  async validateOrderStructure(order) {
    const requiredFields = ['order_sn', 'buyer_username', 'shop_id', 'items'];
    const missingFields = requiredFields.filter(field => !order[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    // Validate items
    if (!Array.isArray(order.items) || order.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }
    
    for (const item of order.items) {
      if (!item.sku || !item.qty || !item.price) {
        throw new Error('Each item must have sku, qty, and price');
      }
    }
  }

  // Check for existing order
  async checkExistingOrder(orderSn) {
    try {
      // Check in Odoo if order already exists
      const odooIntegrationService = require('../services/odooIntegrationService');
      const execute = odooIntegrationService.execute;
      const existingOrder = await execute('sale.order', 'search', [['client_order_ref', '=', orderSn]]);
      return existingOrder.length > 0;
    } catch (error) {
      console.warn('⚠️ Could not check for existing order:', error.message);
      return false;
    }
  }

  // Calculate order priority based on payment status and amount
  calculateOrderPriority(order) {
    let priority = 5; // Default priority
    
    if (order.payment_status === 'paid') {
      priority = 1; // High priority for paid orders
    } else if (order.payment_status === 'pending') {
      priority = 3; // Medium priority for pending payments
    }
    
    // Higher priority for large orders
    if (order.total_amount > 1000000) {
      priority -= 1;
    }
    
    return Math.max(1, Math.min(10, priority));
  }

  // Main webhook handler
  async handleWebhook(req, res) {
    try {
      console.log('📥 Desty webhook received');

      // Get signature from header
      const signature = req.headers['x-desty-signature'] || req.headers['x-signature'];
      const payload = req.body;

      // Validate signature
      if (!this.validateSignature(payload, signature)) {
        console.error('❌ Invalid Desty webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Handle different webhook events
      const event = req.headers['x-desty-event'] || payload.event_type || payload.event;

      switch (event) {
        case 'order.created':
        case 'order.updated':
        case 'order.paid':
        case 'order.confirmed':
          await this.handleOrder(payload);
          break;
        
        case 'product.created':
        case 'product.updated':
        case 'product.price_changed':
        case 'inventory.updated':
          await this.handleProductUpdate(payload);
          break;
        
        case 'payment.completed':
        case 'payment.failed':
          await this.handlePaymentUpdate(payload);
          break;
        
        case 'shipment.created':
        case 'shipment.updated':
        case 'shipment.delivered':
          await this.handleShipmentUpdate(payload);
          break;
        
        default:
          console.log(`ℹ️ Unhandled Desty event: ${event}`);
          // Still acknowledge receipt
          break;
      }

      res.json({ 
        status: 'received',
        event: event,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Desty webhook error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Handle order events
  async handleOrder(payload) {
    try {
      // Enhanced order standardization
      const order = this.standardizeOrder(payload);
      
      // Validate order structure
      await this.validateOrderStructure(order);
      
      // Check for duplicate orders
      const existingOrder = await this.checkExistingOrder(order.order_sn);
      if (existingOrder) {
        console.log(`⚠️ Duplicate order detected: ${order.order_sn}`);
        return;
      }
      
      // Add to queue with enhanced metadata
      let job;
      if (addJobWithDeduplication && typeof addJobWithDeduplication === 'function') {
        console.log(`✅ Using addJobWithDeduplication for webhook order: ${order.order_sn}`);
        job = await addJobWithDeduplication('order', {
          source: 'desty',
          order: order,
          webhook_event: payload.event_type || payload.event,
          timestamp: new Date().toISOString(),
          priority: this.calculateOrderPriority(order)
        });
      } else {
        console.log(`⚠️ addJobWithDeduplication not available, using fallback for webhook order: ${order.order_sn}`);
        job = await orderQueue.add('order', {
          source: 'desty',
          order: order,
          webhook_event: payload.event_type || payload.event,
          timestamp: new Date().toISOString(),
          priority: this.calculateOrderPriority(order)
        });
      }

      if (!job) {
        console.log(`⚠️ Duplicate webhook job prevented for order: ${order.order_sn}`);
        return;
      }

      console.log(`✅ Desty order queued: ${order.order_sn}`);
    } catch (error) {
      console.error('❌ Error handling Desty order:', error.message);
      throw error;
    }
  }

  // Handle product update events
  async handleProductUpdate(payload) {
    try {
      console.log('🔄 Processing Desty product update...');
      
      const products = Array.isArray(payload) ? payload : [payload];
      
      for (const product of products) {
        await productMappingService.syncProductFromMarketplace(
          'desty',
          product.shop_id || product.store_id,
          {
            id: product.product_id || product.id,
            sku: product.sku,
            price: product.price,
            name: product.name || product.title,
            stock: product.stock || product.inventory
          }
        );
      }

      console.log(`✅ Synced ${products.length} Desty products`);
    } catch (error) {
      console.error('❌ Error handling Desty product update:', error.message);
      throw error;
    }
  }

  // Handle payment update events
  async handlePaymentUpdate(payload) {
    try {
      console.log('💳 Processing Desty payment update...');
      
      const payment = payload;
      const orderId = payment.order_id || payment.order_number;
      
      console.log(`💳 Payment update for order ${orderId}: ${payment.status || payment.state}`);
      
      // Could trigger order status update in Odoo
      // For now, just log the event
      
    } catch (error) {
      console.error('❌ Error handling Desty payment update:', error.message);
      throw error;
    }
  }

  // Handle shipment update events
  async handleShipmentUpdate(payload) {
    try {
      console.log('📦 Processing Desty shipment update...');
      
      const shipment = payload;
      const orderId = shipment.order_id || shipment.order_number;
      
      console.log(`📦 Shipment update for order ${orderId}: ${shipment.status || shipment.state}`);
      
      // Could trigger shipping status update in Odoo
      // For now, just log the event
      
    } catch (error) {
      console.error('❌ Error handling Desty shipment update:', error.message);
      throw error;
    }
  }

  // API endpoint for manual product sync
  async syncProducts(req, res) {
    try {
      if (!this.validateApiKey(req)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const { shop_id, products } = req.body;

      if (!shop_id || !products) {
        return res.status(400).json({ 
          error: 'shop_id and products are required' 
        });
      }

      const results = await productMappingService.bulkSync('desty', shop_id, products);
      
      res.json({
        status: 'completed',
        results: results,
        total: products.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Desty sync products error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get mapping status
  async getMappings(req, res) {
    try {
      if (!this.validateApiKey(req)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const { shop_id } = req.query;
      const mappings = await productMappingService.getAllMappings('desty', shop_id);
      
      res.json({
        marketplace: 'desty',
        shop_id,
        mappings: mappings,
        total: mappings.length
      });
    } catch (error) {
      console.error('❌ Error getting Desty mappings:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Test endpoint for webhook connectivity
  async testWebhook(req, res) {
    try {
      console.log('🧪 Desty webhook test received');
      
      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: {
          message: 'Webhook connectivity test successful',
          source: 'desty'
        }
      };

      res.json({
        status: 'success',
        message: 'Desty webhook endpoint is working',
        received: testPayload
      });

    } catch (error) {
      console.error('❌ Desty webhook test error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Health check for Desty integration
  async healthCheck(req, res) {
    try {
      const status = {
        marketplace: 'desty',
        status: 'healthy',
        endpoints: {
          webhook: '/webhook/desty',
          sync: '/webhook/desty/sync',
          mappings: '/webhook/desty/mappings',
          test: '/webhook/desty/test'
        },
        configuration: {
          has_webhook_secret: !!this.webhookSecret,
          has_api_key: !!this.apiKey,
          base_url: this.baseUrl
        },
        supported_events: [
          'order.created',
          'order.updated', 
          'order.paid',
          'order.confirmed',
          'product.created',
          'product.updated',
          'product.price_changed',
          'inventory.updated',
          'payment.completed',
          'payment.failed',
          'shipment.created',
          'shipment.updated',
          'shipment.delivered'
        ],
        timestamp: new Date().toISOString()
      };

      res.json(status);
    } catch (error) {
      console.error('❌ Desty health check error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new DestyWebhookController();
