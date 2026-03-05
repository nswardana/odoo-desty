// services/marketplaceService.js
// Central service for managing marketplace integrations

const { processMarketplaceOrder } = require("./orderService");

class MarketplaceService {
  constructor() {
    this.supportedMarketplaces = {
      'shopee': {
        name: 'Shopee',
        webhookPath: '/webhook/shopee',
        orderProcessor: this.processShopeeOrder.bind(this)
      },
      'tokopedia': {
        name: 'Tokopedia', 
        webhookPath: '/webhook/tokopedia',
        orderProcessor: this.processTokopediaOrder.bind(this)
      },
      'lazada': {
        name: 'Lazada',
        webhookPath: '/webhook/lazada', 
        orderProcessor: this.processLazadaOrder.bind(this)
      },
      'tiktok': {
        name: 'TikTok Shop',
        webhookPath: '/webhook/tiktok',
        orderProcessor: this.processTikTokOrder.bind(this)
      }
    };
  }

  // Standardize order format from different marketplaces
  standardizeOrderData(marketplace, rawOrder) {
    const standardized = {
      order_sn: rawOrder.order_sn || rawOrder.order_id || rawOrder.id,
      buyer_username: rawOrder.buyer_username || rawOrder.customer_name || rawOrder.buyer_name,
      branch: rawOrder.branch || this.getDefaultBranch(marketplace),
      items: this.standardizeItems(rawOrder.items || rawOrder.products || []),
      marketplace: marketplace,
      raw_data: rawOrder // Keep original data for reference
    };

    console.log(`📦 Standardized ${marketplace} order:`, standardized);
    return standardized;
  }

  standardizeItems(items) {
    return items.map(item => ({
      name: item.name || item.product_name || item.title,
      sku: item.sku || item.model_id || item.item_sku || item.product_id,
      qty: item.qty || item.quantity || item.amount || 1,
      price: item.price || item.unit_price || item.item_price || 0
    }));
  }

  getDefaultBranch(marketplace) {
    // Default branch mapping for each marketplace
    const defaults = {
      'shopee': 'KEDURUS',
      'tokopedia': 'GUBENG', 
      'lazada': 'PUCANG',
      'tiktok': 'KEDURUS'
    };
    return defaults[marketplace] || 'KEDURUS';
  }

  // Marketplace-specific processors
  async processShopeeOrder(rawOrder) {
    console.log('🛒 Processing Shopee order...');
    const standardized = this.standardizeOrderData('shopee', rawOrder);
    return await processMarketplaceOrder('shopee', standardized);
  }

  async processTokopediaOrder(rawOrder) {
    console.log('🛒 Processing Tokopedia order...');
    const standardized = this.standardizeOrderData('tokopedia', rawOrder);
    return await processMarketplaceOrder('tokopedia', standardized);
  }

  async processLazadaOrder(rawOrder) {
    console.log('🛒 Processing Lazada order...');
    const standardized = this.standardizeOrderData('lazada', rawOrder);
    return await processMarketplaceOrder('lazada', standardized);
  }

  async processTikTokOrder(rawOrder) {
    console.log('🛒 Processing TikTok order...');
    const standardized = this.standardizeOrderData('tiktok', rawOrder);
    return await processMarketplaceOrder('tiktok', standardized);
  }

  // Public method to process any marketplace order
  async processOrder(marketplace, rawOrder) {
    if (!this.supportedMarketplaces[marketplace]) {
      throw new Error(`Unsupported marketplace: ${marketplace}`);
    }

    try {
      console.log(`🚀 Starting order processing for ${marketplace}`);
      const result = await this.supportedMarketplaces[marketplace].orderProcessor(rawOrder);
      console.log(`✅ ${marketplace} order processed successfully`);
      return result;
    } catch (error) {
      console.error(`❌ Failed to process ${marketplace} order:`, error.message);
      throw error;
    }
  }

  // Get marketplace info
  getMarketplaceInfo(marketplace) {
    return this.supportedMarketplaces[marketplace];
  }

  // List all supported marketplaces
  getSupportedMarketplaces() {
    return Object.keys(this.supportedMarketplaces);
  }
}

module.exports = new MarketplaceService();
