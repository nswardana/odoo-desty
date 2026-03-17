// services/destyInventoryService.js
// Desty API integration for inventory operations

const axios = require('axios');
const { DESTY_CONFIG } = require('../config');

class DestyInventoryService {
  constructor() {
    this.baseURL = DESTY_CONFIG.base_url || 'https://api.desty.app';
    this.apiKey = process.env.DESTY_API_KEY;
    this.timeout = 30000; // 30 seconds
  }

  // Update stock for a product
  async updateStock(sku, stock, shopId, warehouseId) {
    console.log(`📦 Updating Desty stock: SKU ${sku}, Stock: ${stock}, Shop: ${shopId}`);
    
    try {
      const response = await axios.post(
        `${this.baseURL}/api/inventory/stock/sync`,
        {
          shopId,
          itemExternalCode: sku,
          stock: parseInt(stock),
          warehouseId
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      console.log(`✅ Desty stock updated: ${sku} -> ${stock}`);
      return response.data;
      
    } catch (error) {
      console.error(`❌ Failed to update Desty stock for ${sku}:`, error.message);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Response:`, error.response.data);
      }
      
      throw new Error(`Desty API error: ${error.message}`);
    }
  }

  // Get current stock from Desty
  async getProductStock(itemId, shopId) {
    console.log(`📋 Getting Desty stock: Item ${itemId}, Shop: ${shopId}`);
    
    try {
      const response = await axios.get(
        `${this.baseURL}/api/inventory/stock`,
        {
          params: {
            itemId,
            shopId
          },
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      const stock = response.data.stock || 0;
      console.log(`📊 Desty stock retrieved: ${itemId} -> ${stock}`);
      
      return stock;
      
    } catch (error) {
      console.error(`❌ Failed to get Desty stock for ${itemId}:`, error.message);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Response:`, error.response.data);
      }
      
      throw new Error(`Desty API error: ${error.message}`);
    }
  }

  // Get multiple products stock
  async getBatchStock(items, shopId) {
    console.log(`📦 Getting batch Desty stock: ${items.length} items`);
    
    try {
      const response = await axios.post(
        `${this.baseURL}/api/inventory/stock/batch`,
        {
          shopId,
          items: items.map(item => ({
            itemId: item.itemId,
            itemExternalCode: item.sku
          }))
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      console.log(`✅ Batch stock retrieved: ${response.data.length} items`);
      return response.data;
      
    } catch (error) {
      console.error(`❌ Failed to get batch Desty stock:`, error.message);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Response:`, error.response.data);
      }
      
      throw new Error(`Desty API error: ${error.message}`);
    }
  }

  // Sync multiple products at once
  async batchUpdateStock(updates) {
    console.log(`🔄 Batch updating Desty stock: ${updates.length} items`);
    
    try {
      const response = await axios.post(
        `${this.baseURL}/api/inventory/stock/batch-sync`,
        {
          updates: updates.map(update => ({
            shopId: update.shopId,
            itemExternalCode: update.sku,
            stock: parseInt(update.stock),
            warehouseId: update.warehouseId
          }))
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout * 2 // Longer timeout for batch
        }
      );

      console.log(`✅ Batch stock updated: ${response.data.successful || 0} successful, ${response.data.failed || 0} failed`);
      return response.data;
      
    } catch (error) {
      console.error(`❌ Failed to batch update Desty stock:`, error.message);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Response:`, error.response.data);
      }
      
      throw new Error(`Desty API error: ${error.message}`);
    }
  }

  // Get inventory changes (for delta sync)
  async getInventoryChanges(shopId, since = null) {
    console.log(`📋 Getting Desty inventory changes: Shop ${shopId}, Since: ${since}`);
    
    try {
      const params = { shopId };
      if (since) {
        params.since = since.toISOString();
      }

      const response = await axios.get(
        `${this.baseURL}/api/inventory/changes`,
        {
          params,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      console.log(`📊 Inventory changes retrieved: ${response.data.length} changes`);
      return response.data;
      
    } catch (error) {
      console.error(`❌ Failed to get Desty inventory changes:`, error.message);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Response:`, error.response.data);
      }
      
      throw new Error(`Desty API error: ${error.message}`);
    }
  }

  // Validate API connection
  async validateConnection() {
    try {
      const response = await axios.get(
        `${this.baseURL}/api/health`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      console.log(`✅ Desty API connection validated`);
      return { success: true, data: response.data };
      
    } catch (error) {
      console.error(`❌ Desty API connection failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Get warehouse information
  async getWarehouses(shopId) {
    console.log(`🏪 Getting Desty warehouses: Shop ${shopId}`);
    
    try {
      const response = await axios.get(
        `${this.baseURL}/api/inventory/warehouses`,
        {
          params: { shopId },
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      console.log(`📦 Warehouses retrieved: ${response.data.length} warehouses`);
      return response.data;
      
    } catch (error) {
      console.error(`❌ Failed to get Desty warehouses:`, error.message);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Response:`, error.response.data);
      }
      
      throw new Error(`Desty API error: ${error.message}`);
    }
  }

  // Get shop information
  async getShopInfo(shopId) {
    console.log(`🏪 Getting Desty shop info: ${shopId}`);
    
    try {
      const response = await axios.get(
        `${this.baseURL}/api/shops/${shopId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      console.log(`📊 Shop info retrieved: ${shopId}`);
      return response.data;
      
    } catch (error) {
      console.error(`❌ Failed to get Desty shop info:`, error.message);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Response:`, error.response.data);
      }
      
      throw new Error(`Desty API error: ${error.message}`);
    }
  }

  // Create inventory adjustment (for manual corrections)
  async createAdjustment(shopId, adjustments, reason) {
    console.log(`🔧 Creating Desty inventory adjustment: ${adjustments.length} items, Reason: ${reason}`);
    
    try {
      const response = await axios.post(
        `${this.baseURL}/api/inventory/adjustment`,
        {
          shopId,
          adjustments: adjustments.map(adj => ({
            itemExternalCode: adj.sku,
            adjustmentQty: parseInt(adj.quantity),
            reason: adj.reason || reason
          })),
          reason
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      console.log(`✅ Inventory adjustment created: ${response.data.adjustmentId}`);
      return response.data;
      
    } catch (error) {
      console.error(`❌ Failed to create Desty inventory adjustment:`, error.message);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Response:`, error.response.data);
      }
      
      throw new Error(`Desty API error: ${error.message}`);
    }
  }

  // Get adjustment history
  async getAdjustmentHistory(shopId, fromDate = null, toDate = null) {
    console.log(`📋 Getting Desty adjustment history: Shop ${shopId}`);
    
    try {
      const params = { shopId };
      if (fromDate) params.fromDate = fromDate.toISOString();
      if (toDate) params.toDate = toDate.toISOString();

      const response = await axios.get(
        `${this.baseURL}/api/inventory/adjustments`,
        {
          params,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      console.log(`📊 Adjustment history retrieved: ${response.data.length} adjustments`);
      return response.data;
      
    } catch (error) {
      console.error(`❌ Failed to get Desty adjustment history:`, error.message);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Response:`, error.response.data);
      }
      
      throw new Error(`Desty API error: ${error.message}`);
    }
  }
}

module.exports = new DestyInventoryService();
