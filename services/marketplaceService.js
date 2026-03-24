// services/marketplaceService.js
// Central service for managing marketplace integrations

const fs = require('fs');
const path = require('path');
const { processMarketplaceOrder } = require("./orderService");
const destyOdooService = require("./destyOdooService");
const productMappingService = require("./productMappingService");
const { STORE_BRANCH_MAPPING, DEFAULT_BRANCH } = require("../config");

// Create logs directory if not exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Global execution ID for this process run
let executionId = null;

// Generate execution ID
const generateExecutionId = () => {
  const now = new Date();
  const timestamp = now.getTime(); // Unix timestamp in milliseconds
  const random = Math.random().toString(36).substr(2, 9); // Random string
  return `${timestamp}_${random}`;
};

// Initialize execution ID
const initExecutionId = () => {
  if (!executionId) {
    executionId = generateExecutionId();
  }
  return executionId;
};

// Log file path (per execution)
const getLogFilePath = (type) => {
  const execId = initExecutionId();
  return path.join(logsDir, `${type}_${execId}.log`);
};

// Write to log file
const writeLog = (type, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
  
  // Create log directory if not exists
  const logFilePath = getLogFilePath(type);
  const logDir = path.dirname(logFilePath);
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Append to file (akumulatif)
  fs.appendFileSync(logFilePath, logEntry, 'utf8');
  console.log(message);
};

// Write product not found log with specific format
const writeProductNotFoundLog = (order, productSku, productName = '') => {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp} | ${order.platform || 'desty'} | ${order.storeName || 'Unknown'} | ${order.order_sn || 'Unknown'} | ${productSku} | ${productName}\n`;
  
  // Create product not found log file
  const productLogPath = path.join(logsDir, `product_not_found_${initExecutionId()}.log`);
  
  fs.appendFileSync(productLogPath, logEntry, 'utf8');
  console.log(`📝 Product not found logged: ${productSku} from order ${order.order_sn}`);
};

class MarketplaceService {
  constructor() {
    this.productMappingService = productMappingService;
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

  // Get default branch based on store name
  getDefaultBranch(storeName = '') {
    // Return mapped branch or default
    return STORE_BRANCH_MAPPING[storeName] || DEFAULT_BRANCH;
  }

  // Validate order data
  async validateOrder(order) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (!order.order_sn) {
      errors.push('Order number is required');
    }

    if (!order.buyer_username) {
      errors.push('Buyer username is required');
    }

    if (!order.items || order.items.length === 0) {
      errors.push('Order items are required');
    }

    // Check item data
    if (order.items) {
      order.items.forEach((item, index) => {
        if (!item.sku) {
          errors.push(`Item ${index + 1}: SKU is required`);
        }
        if (!item.name) {
          errors.push(`Item ${index + 1}: Product name is required`);
        }
        if (!item.qty || item.qty <= 0) {
          errors.push(`Item ${index + 1}: Quantity must be greater than 0`);
        }
        if (!item.price || item.price < 0) {
          errors.push(`Item ${index + 1}: Price must be greater than or equal to 0`);
        }
      });
    }

    // Warnings
    if (order.items && order.items.length > 10) {
      warnings.push('Order contains more than 10 items');
    }

    if (order.items) {
      const totalAmount = order.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
      if (totalAmount > 10000000) {
        warnings.push('Order amount is very high (>10M)');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: {
        itemCount: order.items ? order.items.length : 0,
        totalAmount: order.items ? order.items.reduce((sum, item) => sum + (item.price * item.qty), 0) : 0
      }
    };
  }

  // Marketplace-specific processors
  async processDestyOrder(rawOrder) {
    const orderSn = rawOrder.order_sn || 'unknown';
    writeLog('orders', `🛒 Processing Desty order: ${orderSn}`, rawOrder);
    
    try {
      // Step 1: Validate order data
      writeLog('orders', `📋 Step 1: Validating order: ${orderSn}`);
      const validationResult = await this.validateOrder(rawOrder);
      
      if (!validationResult.isValid) {
        const errorMsg = `Order validation failed: ${validationResult.errors.join(', ')}`;
        writeLog('errors', `❌ Validation failed for ${orderSn}`, { errors: validationResult.errors });
        throw new Error(errorMsg);
      }

      // Log warnings if any
      if (validationResult.warnings.length > 0) {
        writeLog('warnings', `⚠️ Order warnings for ${orderSn}`, validationResult.warnings);
      }

      // Step 2: Check/update customer
      writeLog('orders', `👤 Step 2: Check/update customer for ${orderSn}`);
      const customer = await destyOdooService.createDestyCustomer(rawOrder);

      // Step 3: Validate products and stock with branch-specific inventory
      writeLog('orders', `📦 Step 3: Validate products and stock for ${orderSn}`);
      console.log("Step 3 - rawOrder",JSON.stringify(rawOrder.branch,2,null));
      
      const productValidation = await destyOdooService.validateDestyProducts(rawOrder.items, rawOrder.branch, rawOrder);
      
      if (productValidation.errors.length > 0) {
        const errorMsg = `Product validation failed: ${productValidation.errors.join(', ')}`;
        writeLog('errors', `❌ Product validation failed for ${orderSn}`, { errors: productValidation.errors });
        throw new Error(errorMsg);
      }

      // Log product warnings
      if (productValidation.warnings.length > 0) {
        writeLog('warnings', `⚠️ Product warnings for ${orderSn}`, productValidation.warnings);
      }

      // Step 4: Create order in Odoo
      writeLog('orders', `🛒 Step 4: Creating Odoo order for ${orderSn}`);
      const odooOrder = await destyOdooService.createDestyOrder(rawOrder, customer, productValidation.validItems);

      // Step 5: Handle order confirmation based on payment status
      if (rawOrder.payment_status === 'paid') {
        await destyOdooService.confirmDestyOrder(odooOrder.id);
      }

      // Step 6: Create shipment if ready to ship
      if (rawOrder.shipping_status === 'ready_to_ship') {
        await destyOdooService.createDestyShipment(odooOrder.id, rawOrder);
      }

      writeLog('success', `✅ Successfully processed order: ${orderSn}`, { 
        odooOrderId: odooOrder.id,
        customerName: customer.name,
        itemCount: productValidation.validItems.length
      });

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
