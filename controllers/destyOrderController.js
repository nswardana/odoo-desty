// controllers/destyOrderController.js
// Desty Order API controller for handling order operations

const axios = require('axios');
const tokenService = require('../services/tokenService');
const { orderQueue } = require('../queue');

class DestyOrderController {
  constructor() {
    this.apiKey = process.env.DESTY_API_KEY;
    this.baseUrl = process.env.DESTY_API_BASE_URL || 'https://api.desty.app';
    this.orderEndpoint = '/v1/orders';
  }

  // Validate API key
  validateApiKey(req) {
    if (!this.apiKey) {
      console.warn("⚠️ Desty API key not configured - skipping validation");
      return true;
    }

    const authHeader = req.headers['x-api-key'];
    const apiKey = authHeader || req.headers['authorization']?.replace('Bearer ', '');

    return apiKey === this.apiKey;
  }

  // Get access token for authenticated requests
  async getAccessToken() {
    const tokenInfo = tokenService.getTokenInfo('desty');
    
    if (!tokenInfo || !tokenInfo.access_token) {
      throw new Error('Desty not authenticated - please complete OAuth flow');
    }

    // Check if token is expired
    if (tokenInfo.expires_at && new Date(tokenInfo.expires_at) < new Date()) {
      throw new Error('Desty access token expired - please refresh');
    }

    return tokenInfo.access_token;
  }

  // GET /desty/orders
  // Get all orders from Desty
  async getOrders(req, res) {
    try {
      console.log('📦 Fetching orders from Desty...');

      // Try OAuth first, fallback to API key
      let headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      let authMethod = 'API Key';
      
      if (this.validateApiKey(req)) {
        headers['X-API-Key'] = this.apiKey;
      } else {
        // Try OAuth
        const accessToken = await this.getAccessToken();
        headers['Authorization'] = `Bearer ${accessToken}`;
        authMethod = 'OAuth';
      }

      const { 
        page = 1, 
        limit = 50, 
        status, 
        payment_status,
        shipping_status,
        date_from,
        date_to,
        customer_id 
      } = req.query;
      
      let url = `${this.baseUrl}${this.orderEndpoint}`;
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      });

      if (status) params.append('status', status);
      if (payment_status) params.append('payment_status', payment_status);
      if (shipping_status) params.append('shipping_status', shipping_status);
      if (date_from) params.append('date_from', date_from);
      if (date_to) params.append('date_to', date_to);
      if (customer_id) params.append('customer_id', customer_id);

      url += `?${params.toString()}`;

      console.log(`🔍 Fetching Desty orders (Page: ${page}, Limit: ${limit}, Auth: ${authMethod})`);

      const response = await axios.get(url, {
        headers,
        timeout: 30000
      });

      const orders = response.data;

      res.json({
        success: true,
        data: orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: orders.total || orders.length
        },
        auth_method: authMethod,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error fetching Desty orders:', error.message);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // GET /desty/orders/:orderId
  // Get specific order from Desty
  async getOrder(req, res) {
    try {
      const { orderId } = req.params;
      console.log(`📦 Fetching Desty order: ${orderId}`);

      // Try OAuth first, fallback to API key
      let headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      let authMethod = 'API Key';
      
      if (this.validateApiKey(req)) {
        headers['X-API-Key'] = this.apiKey;
      } else {
        // Try OAuth
        const accessToken = await this.getAccessToken();
        headers['Authorization'] = `Bearer ${accessToken}`;
        authMethod = 'OAuth';
      }

      const url = `${this.baseUrl}${this.orderEndpoint}/${orderId}`;

      console.log(`🔍 Fetching Desty order ${orderId} (Auth: ${authMethod})`);

      const response = await axios.get(url, {
        headers,
        timeout: 30000
      });

      const order = response.data;

      res.json({
        success: true,
        data: order,
        auth_method: authMethod,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error fetching Desty order:', error.message);
      
      if (error.response?.status === 404) {
        return res.status(404).json({ 
          error: 'Order not found',
          order_id: req.params.orderId
        });
      }

      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // POST /desty/orders
  // Create new order in Desty
  async createOrder(req, res) {
    try {
      console.log('➕ Creating new order in Desty...');

      if (!this.validateApiKey(req)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const orderData = req.body;

      // Validate required fields
      if (!orderData.customer_id || !orderData.items || !orderData.items.length) {
        return res.status(400).json({ 
          error: 'Missing required fields: customer_id, items' 
        });
      }

      // Validate items
      for (const item of orderData.items) {
        if (!item.product_id || !item.quantity || !item.price) {
          return res.status(400).json({ 
            error: 'Missing required item fields: product_id, quantity, price' 
          });
        }
      }

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey
      };

      const url = `${this.baseUrl}${this.orderEndpoint}`;

      console.log(`🔨 Creating Desty order for customer: ${orderData.customer_id}`);

      const response = await axios.post(url, orderData, {
        headers,
        timeout: 30000
      });

      const order = response.data;

      // Queue for processing if needed
      if (order.id) {
        await orderQueue.add('order', {
          source: 'desty',
          order: {
            order_sn: order.id,
            buyer_username: order.customer?.name,
            branch: process.env.DESTY_DEFAULT_BRANCH || 'KEDURUS',
            items: order.items?.map(item => ({
              name: item.product_name,
              sku: item.product_sku,
              qty: item.quantity,
              price: item.price
            })) || [],
            shop_id: order.shop_id,
            marketplace: 'desty',
            raw_data: order
          }
        });
      }

      res.status(201).json({
        success: true,
        data: order,
        message: 'Order created successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error creating Desty order:', error.message);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // PUT /desty/orders/:orderId
  // Update existing order in Desty
  async updateOrder(req, res) {
    try {
      const { orderId } = req.params;
      const orderData = req.body;

      console.log(`📝 Updating Desty order: ${orderId}`);

      if (!this.validateApiKey(req)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey
      };

      const url = `${this.baseUrl}${this.orderEndpoint}/${orderId}`;

      console.log(`🔨 Updating Desty order ${orderId}`);

      const response = await axios.put(url, orderData, {
        headers,
        timeout: 30000
      });

      const order = response.data;

      res.json({
        success: true,
        data: order,
        message: 'Order updated successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error updating Desty order:', error.message);
      
      if (error.response?.status === 404) {
        return res.status(404).json({ 
          error: 'Order not found',
          order_id: req.params.orderId
        });
      }

      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // POST /desty/orders/:orderId/confirm
  // Confirm order in Desty
  async confirmOrder(req, res) {
    try {
      const { orderId } = req.params;
      console.log(`✅ Confirming Desty order: ${orderId}`);

      if (!this.validateApiKey(req)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey
      };

      const url = `${this.baseUrl}${this.orderEndpoint}/${orderId}/confirm`;

      console.log(`✅ Confirming Desty order ${orderId}`);

      const response = await axios.post(url, {}, {
        headers,
        timeout: 30000
      });

      const result = response.data;

      res.json({
        success: true,
        data: result,
        message: 'Order confirmed successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error confirming Desty order:', error.message);
      
      if (error.response?.status === 404) {
        return res.status(404).json({ 
          error: 'Order not found',
          order_id: req.params.orderId
        });
      }

      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // POST /desty/orders/:orderId/cancel
  // Cancel order in Desty
  async cancelOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { reason, note } = req.body;

      console.log(`❌ Cancelling Desty order: ${orderId}`);

      if (!this.validateApiKey(req)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey
      };

      const url = `${this.baseUrl}${this.orderEndpoint}/${orderId}/cancel`;

      const cancelData = {};
      if (reason) cancelData.reason = reason;
      if (note) cancelData.note = note;

      console.log(`❌ Cancelling Desty order ${orderId} with reason: ${reason || 'No reason provided'}`);

      const response = await axios.post(url, cancelData, {
        headers,
        timeout: 30000
      });

      const result = response.data;

      res.json({
        success: true,
        data: result,
        message: 'Order cancelled successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error cancelling Desty order:', error.message);
      
      if (error.response?.status === 404) {
        return res.status(404).json({ 
          error: 'Order not found',
          order_id: req.params.orderId
        });
      }

      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // POST /desty/orders/:orderId/ship
  // Create shipment for order in Desty
  async shipOrder(req, res) {
    try {
      const { orderId } = req.params;
      const shipmentData = req.body;

      console.log(`📦 Creating shipment for Desty order: ${orderId}`);

      if (!this.validateApiKey(req)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      // Validate required shipment fields
      if (!shipmentData.tracking_number || !shipmentData.carrier) {
        return res.status(400).json({ 
          error: 'Missing required shipment fields: tracking_number, carrier' 
        });
      }

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey
      };

      const url = `${this.baseUrl}${this.orderEndpoint}/${orderId}/ship`;

      console.log(`📦 Creating shipment for Desty order ${orderId} with tracking: ${shipmentData.tracking_number}`);

      const response = await axios.post(url, shipmentData, {
        headers,
        timeout: 30000
      });

      const result = response.data;

      res.json({
        success: true,
        data: result,
        message: 'Shipment created successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error creating shipment for Desty order:', error.message);
      
      if (error.response?.status === 404) {
        return res.status(404).json({ 
          error: 'Order not found',
          order_id: req.params.orderId
        });
      }

      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // GET /desty/orders/search
  // Search orders in Desty
  async searchOrders(req, res) {
    try {
      console.log('🔍 Searching orders in Desty...');

      const { 
        q, 
        customer_name, 
        customer_email,
        product_sku,
        status,
        payment_status,
        page = 1, 
        limit = 20 
      } = req.query;

      if (!q && !customer_name && !customer_email && !product_sku) {
        return res.status(400).json({ 
          error: 'At least one search parameter is required: q, customer_name, customer_email, or product_sku' 
        });
      }

      // Try OAuth first, fallback to API key
      let headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      let authMethod = 'API Key';
      
      if (this.validateApiKey(req)) {
        headers['X-API-Key'] = this.apiKey;
      } else {
        // Try OAuth
        const accessToken = await this.getAccessToken();
        headers['Authorization'] = `Bearer ${accessToken}`;
        authMethod = 'OAuth';
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      });

      if (q) params.append('q', q);
      if (customer_name) params.append('customer_name', customer_name);
      if (customer_email) params.append('customer_email', customer_email);
      if (product_sku) params.append('product_sku', product_sku);
      if (status) params.append('status', status);
      if (payment_status) params.append('payment_status', payment_status);

      const url = `${this.baseUrl}${this.orderEndpoint}/search?${params.toString()}`;

      console.log(`🔍 Searching Desty orders (Auth: ${authMethod})`);

      const response = await axios.get(url, {
        headers,
        timeout: 30000
      });

      const orders = response.data;

      res.json({
        success: true,
        query: { q, customer_name, customer_email, product_sku },
        data: orders.data || orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: orders.total || orders.length
        },
        auth_method: authMethod,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error searching Desty orders:', error.message);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // GET /desty/orders/stats
  // Get order statistics from Desty
  async getOrderStats(req, res) {
    try {
      console.log('📊 Fetching order statistics from Desty...');

      const { 
        date_from,
        date_to,
        shop_id,
        status 
      } = req.query;

      if (!this.validateApiKey(req)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey
      };

      const params = new URLSearchParams();
      if (date_from) params.append('date_from', date_from);
      if (date_to) params.append('date_to', date_to);
      if (shop_id) params.append('shop_id', shop_id);
      if (status) params.append('status', status);

      const url = `${this.baseUrl}${this.orderEndpoint}/stats?${params.toString()}`;

      console.log(`📊 Fetching Desty order statistics`);

      const response = await axios.get(url, {
        headers,
        timeout: 30000
      });

      const stats = response.data;

      res.json({
        success: true,
        data: stats,
        filters: { date_from, date_to, shop_id, status },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error fetching Desty order stats:', error.message);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }
}

module.exports = new DestyOrderController();
