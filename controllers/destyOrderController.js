// controllers/destyOrderController.js
// Desty Order API controller for handling order operations

const axios = require('axios');
const { orderQueue } = require('../queue');

class DestyOrderController {
  constructor() {
    this.accessToken = process.env.DESTY_ACCESS_TOKEN;
    this.baseUrl = process.env.DESTY_API_BASE_URL || 'https://api.desty.app';
    this.orderEndpoint = '/api/order/page';
  }

  // Validate access token
  validateAccessToken(req) {
    if (!this.accessToken) {
      console.warn("⚠️ Desty access token not configured - skipping validation");
      return true;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '');

    return token === this.accessToken;
  }

  // Get access token for authenticated requests
  async getAccessToken() {
    if (!this.accessToken) {
      throw new Error('Desty access token not configured - please set DESTY_ACCESS_TOKEN');
    }

    // Check if token is expired
    if (process.env.DESTY_TOKEN_EXPIRE_TIME) {
      const expireTime = parseInt(process.env.DESTY_TOKEN_EXPIRE_TIME);
      if (new Date(expireTime) < new Date()) {
        throw new Error('Desty access token expired - please refresh');
      }
    }

    return this.accessToken;
  }

  // GET /desty/orders
  // Get all orders from Desty
  async getOrders(req, res) {
    try {
      console.log('📦 Fetching orders from Desty...');

      // Validate access token
      if (!this.validateAccessToken(req)) {
        return res.status(401).json({ error: 'Unauthorized - Invalid access token' });
      }

      const { 
        platform = 'shopee',
        startDate,
        endDate,
        status = 'Unpaid',
        pageNumber = 1,
        pageSize = 50
      } = req.body;

      // Build request payload according to Desty API spec
      const payload = {
        platform,
        startDate: startDate || this.getTodayStartTimestamp(),
        endDate: endDate || Date.now(),
        status,
        pageNumber,
        pageSize
      };

      console.log('📋 Order request payload:', payload);

      // Make API request to /api/order/page
      const response = await axios.post(`${this.baseUrl}${this.orderEndpoint}`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAccessToken()}`
        }
      });

      const orders = response.data;

      res.json({
        status: 'success',
        marketplace: 'desty',
        data: orders
      });

    } catch (error) {
      console.error('❌ Error fetching orders from Desty:', error.message);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data 
      });
    }
  }

  // GET /desty/orders/:orderId
  // Get specific order by ID
  async getOrder(req, res) {
    try {
      console.log(`📦 Fetching order ${req.params.orderId} from Desty...`);

      // Validate access token
      if (!this.validateAccessToken(req)) {
        return res.status(401).json({ error: 'Unauthorized - Invalid access token' });
      }

      const { orderId } = req.params;

      // Make API request
      const response = await axios.get(`${this.baseUrl}/api/order/detail`, {
        params: { orderId },
        headers: {
          'Authorization': `Bearer ${await this.getAccessToken()}`
        }
      });

      const order = response.data;

      res.json({
        status: 'success',
        marketplace: 'desty',
        data: order
      });

    } catch (error) {
      console.error(`❌ Error fetching order ${req.params.orderId}:`, error.message);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data 
      });
    }
  }

  // Helper method to get today's start timestamp
  getTodayStartTimestamp() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }
}

module.exports = new DestyOrderController();
