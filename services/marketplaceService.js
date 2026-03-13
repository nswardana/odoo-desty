// services/marketplaceService.js
// Central service for managing marketplace integrations

const { processMarketplaceOrder } = require("./orderService");

class MarketplaceService {
  constructor() {
    this.supportedMarketplaces = {
      'desty': {
        name: 'Desty',
        webhookPath: '/webhook/desty',
        orderProcessor: this.processDestyOrder.bind(this)
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
      'desty': 'KEDURUS'
    };
    return defaults[marketplace] || 'KEDURUS';
  }

  // Marketplace-specific processors
  async processDestyOrder(rawOrder) {
    console.log('🛒 Processing Desty order...');
    
    // Use enhanced Desty processing
    const destyOdooService = require('./destyOdooService');
    const destyValidationService = require('./destyValidationService');
    
    try {
      // Step 1: Comprehensive validation
      const validationResult = await destyValidationService.validateCompleteOrder(rawOrder);
      
      if (!validationResult.isValid) {
        throw new Error(`Order validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Log warnings if any
      if (validationResult.warnings.length > 0) {
        console.log(`⚠️ Order warnings for ${rawOrder.order_sn}:`, validationResult.warnings);
      }

      // Step 2: Check/update customer
      const customer = await destyOdooService.createDestyCustomer(rawOrder);

      // Step 3: Validate products and stock
      const productValidation = await destyOdooService.validateDestyProducts(rawOrder.items);
      
      if (!productValidation.canProceed) {
        throw new Error(`Product validation failed: ${productValidation.errors.join(', ')}`);
      }

      // Log product warnings
      if (productValidation.warnings.length > 0) {
        console.log(`⚠️ Product warnings for ${rawOrder.order_sn}:`, productValidation.warnings);
      }

      // Step 4: Create/update order in Odoo
      const odooOrder = await destyOdooService.createDestyOrder(rawOrder, customer, productValidation.validatedItems);

      // Step 5: Handle order confirmation based on payment status
      if (rawOrder.payment_status === 'paid') {
        await destyOdooService.confirmDestyOrder(odooOrder.id);
      }

      // Step 6: Create shipment if ready to ship
      if (rawOrder.shipping_status === 'ready_to_ship') {
        await destyOdooService.createDestyShipment(odooOrder.id, rawOrder);
      }

      console.log(`✅ Desty order processed successfully: ${rawOrder.order_sn}`);
      
      return {
        success: true,
        odooOrderId: odooOrder.id,
        customerId: customer.id,
        validationResult: validationResult.summary
      };

    } catch (error) {
      console.error(`❌ Error processing Desty order ${rawOrder.order_sn}:`, error.message);
      throw error;
    }
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
