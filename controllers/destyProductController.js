// controllers/destyProductController.js
// Desty Product API controller for handling product operations

const axios = require('axios');
const tokenService = require('../services/tokenService');
const productMappingService = require('../services/productMappingService');

class DestyProductController {
  constructor() {
    this.apiKey = process.env.DESTY_API_KEY;
    this.baseUrl = process.env.DESTY_API_BASE_URL || 'https://api.desty.app';
    this.productEndpoint = '/v1/products';
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

  // GET /desty/products
  // Get all products from Desty
  async getProducts(req, res) {
    try {
      console.log('📦 Fetching products from Desty...');

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

      const { page = 1, limit = 50, search, category, status } = req.query;
      
      let url = `${this.baseUrl}${this.productEndpoint}`;
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      });

      if (search) params.append('search', search);
      if (category) params.append('category', category);
      if (status) params.append('status', status);

      url += `?${params.toString()}`;

      console.log(`🔍 Fetching Desty products (Page: ${page}, Limit: ${limit}, Auth: ${authMethod})`);

      const response = await axios.get(url, {
        headers,
        timeout: 30000
      });

      const products = response.data;

      res.json({
        success: true,
        data: products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: products.total || products.length
        },
        auth_method: authMethod,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error fetching Desty products:', error.message);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // GET /desty/products/:productId
  // Get specific product from Desty
  async getProduct(req, res) {
    try {
      const { productId } = req.params;
      console.log(`📦 Fetching Desty product: ${productId}`);

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

      const url = `${this.baseUrl}${this.productEndpoint}/${productId}`;

      console.log(`🔍 Fetching Desty product ${productId} (Auth: ${authMethod})`);

      const response = await axios.get(url, {
        headers,
        timeout: 30000
      });

      const product = response.data;

      res.json({
        success: true,
        data: product,
        auth_method: authMethod,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error fetching Desty product:', error.message);
      
      if (error.response?.status === 404) {
        return res.status(404).json({ 
          error: 'Product not found',
          product_id: req.params.productId
        });
      }

      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // POST /desty/products
  // Create new product in Desty
  async createProduct(req, res) {
    try {
      console.log('➕ Creating new product in Desty...');

      if (!this.validateApiKey(req)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const productData = req.body;

      // Validate required fields
      if (!productData.name || !productData.sku || !productData.price) {
        return res.status(400).json({ 
          error: 'Missing required fields: name, sku, price' 
        });
      }

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey
      };

      const url = `${this.baseUrl}${this.productEndpoint}`;

      console.log(`🔨 Creating Desty product: ${productData.name}`);

      const response = await axios.post(url, productData, {
        headers,
        timeout: 30000
      });

      const product = response.data;

      // Sync with local mapping
      if (product.id && productData.sku) {
        await productMappingService.syncProductFromMarketplace(
          'desty',
          product.shop_id || 'default',
          {
            id: product.id,
            sku: productData.sku,
            price: productData.price,
            name: productData.name,
            stock: productData.stock || product.inventory
          }
        );
      }

      res.status(201).json({
        success: true,
        data: product,
        message: 'Product created successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error creating Desty product:', error.message);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // PUT /desty/products/:productId
  // Update existing product in Desty
  async updateProduct(req, res) {
    try {
      const { productId } = req.params;
      const productData = req.body;

      console.log(`📝 Updating Desty product: ${productId}`);

      if (!this.validateApiKey(req)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey
      };

      const url = `${this.baseUrl}${this.productEndpoint}/${productId}`;

      console.log(`🔨 Updating Desty product ${productId}`);

      const response = await axios.put(url, productData, {
        headers,
        timeout: 30000
      });

      const product = response.data;

      // Update local mapping
      if (product.id && productData.sku) {
        await productMappingService.syncProductFromMarketplace(
          'desty',
          product.shop_id || 'default',
          {
            id: product.id,
            sku: productData.sku,
            price: productData.price || product.price,
            name: productData.name || product.name,
            stock: productData.stock || product.inventory
          }
        );
      }

      res.json({
        success: true,
        data: product,
        message: 'Product updated successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error updating Desty product:', error.message);
      
      if (error.response?.status === 404) {
        return res.status(404).json({ 
          error: 'Product not found',
          product_id: req.params.productId
        });
      }

      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // DELETE /desty/products/:productId
  // Delete product from Desty
  async deleteProduct(req, res) {
    try {
      const { productId } = req.params;
      console.log(`🗑️ Deleting Desty product: ${productId}`);

      if (!this.validateApiKey(req)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey
      };

      const url = `${this.baseUrl}${this.productEndpoint}/${productId}`;

      console.log(`🗑️ Deleting Desty product ${productId}`);

      await axios.delete(url, {
        headers,
        timeout: 30000
      });

      // Remove from local mapping
      await productMappingService.removeMapping('desty', productId);

      res.json({
        success: true,
        message: 'Product deleted successfully',
        product_id: productId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error deleting Desty product:', error.message);
      
      if (error.response?.status === 404) {
        return res.status(404).json({ 
          error: 'Product not found',
          product_id: req.params.productId
        });
      }

      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // POST /desty/products/sync
  // Sync products from Desty to local system
  async syncProducts(req, res) {
    try {
      console.log('🔄 Syncing products from Desty...');

      if (!this.validateApiKey(req)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const { shop_id, limit = 100 } = req.body;

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey
      };

      let url = `${this.baseUrl}${this.productEndpoint}`;
      const params = new URLSearchParams({
        limit: limit.toString()
      });

      if (shop_id) params.append('shop_id', shop_id);
      url += `?${params.toString()}`;

      console.log(`🔄 Fetching up to ${limit} products from Desty for sync`);

      const response = await axios.get(url, {
        headers,
        timeout: 30000
      });

      const products = response.data.data || response.data;
      const syncResults = [];

      for (const product of products) {
        try {
          await productMappingService.syncProductFromMarketplace(
            'desty',
            product.shop_id || shop_id || 'default',
            {
              id: product.id,
              sku: product.sku,
              price: product.price,
              name: product.name,
              stock: product.stock || product.inventory
            }
          );
          
          syncResults.push({
            product_id: product.id,
            sku: product.sku,
            status: 'success'
          });
        } catch (error) {
          syncResults.push({
            product_id: product.id,
            sku: product.sku || 'unknown',
            status: 'error',
            error: error.message
          });
        }
      }

      const successCount = syncResults.filter(r => r.status === 'success').length;
      const errorCount = syncResults.filter(r => r.status === 'error').length;

      console.log(`✅ Synced ${successCount} products, ${errorCount} errors`);

      res.json({
        success: true,
        message: `Synced ${successCount} products successfully`,
        total_processed: products.length,
        success_count: successCount,
        error_count: errorCount,
        results: syncResults,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error syncing Desty products:', error.message);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // GET /desty/products/search
  // Search products in Desty
  async searchProducts(req, res) {
    try {
      console.log('🔍 Searching products in Desty...');

      const { q, category, min_price, max_price, page = 1, limit = 20 } = req.query;

      if (!q) {
        return res.status(400).json({ 
          error: 'Search query (q) is required' 
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
        q: q,
        page: page.toString(),
        limit: limit.toString()
      });

      if (category) params.append('category', category);
      if (min_price) params.append('min_price', min_price);
      if (max_price) params.append('max_price', max_price);

      const url = `${this.baseUrl}${this.productEndpoint}/search?${params.toString()}`;

      console.log(`🔍 Searching Desty products: "${q}" (Auth: ${authMethod})`);

      const response = await axios.get(url, {
        headers,
        timeout: 30000
      });

      const products = response.data;

      res.json({
        success: true,
        query: q,
        data: products.data || products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: products.total || products.length
        },
        auth_method: authMethod,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error searching Desty products:', error.message);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }

  // GET /desty/products/categories
  // Get product categories from Desty
  async getCategories(req, res) {
    try {
      console.log('📂 Fetching product categories from Desty...');

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey
      };

      const url = `${this.baseUrl}/v1/categories`;

      const response = await axios.get(url, {
        headers,
        timeout: 30000
      });

      const categories = response.data;

      res.json({
        success: true,
        data: categories,
        total: categories.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error fetching Desty categories:', error.message);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || null
      });
    }
  }
}

module.exports = new DestyProductController();
