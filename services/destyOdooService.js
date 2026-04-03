// services/destyOdooService.js
// Desty-specific Odoo integration service

const odooIntegrationService = require('./odooIntegrationService');
const productMappingService = require('./productMappingService');
const { 
  BRANCH_WAREHOUSE_MAPPING, 
  BRANCH_STOCK_LOCATION_MAPPING, 
  ORDER_STATE_CONFIG,
  ORDER_PROCESSING_CONFIG,
  TAX_CONFIG,
  ODOO_DEFAULTS,
  CUSTOMER_REF_CONFIG
} = require('../config');

// Write product not found log with specific format
const writeProductNotFoundLog = (order, productSku, productName = '') => {
  const fs = require('fs');
  const path = require('path');
  
  const timestamp = new Date().toISOString();
  const platformName = order.platform_name || order.platform || 'desty';
  const storeName = order.store_name || order.storeName || 'Unknown';
  const logEntry = `${timestamp} | ${platformName} | ${storeName} | ${order.order_sn || 'Unknown'} | ${productSku} | ${productName}\n`;
  
  // Create logs directory if not exists
  const logsDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  // Create product not found log file with daily date
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const productLogPath = path.join(logsDir, `product_not_found_${today}.log`);
  
  // Check if this product+order combination already exists
  let shouldAppend = true;
  if (fs.existsSync(productLogPath)) {
    const existingContent = fs.readFileSync(productLogPath, 'utf8');
    const existingLines = existingContent.split('\n').filter(line => line.trim());
    
    // Check for duplicate: same order_sn and same product_sku
    const isDuplicate = existingLines.some(line => {
      const parts = line.split(' | ');
      if (parts.length >= 5) {
        const existingOrderSn = parts[3].trim();
        const existingProductSku = parts[4].trim();
        return existingOrderSn === order.order_sn && existingProductSku === productSku;
      }
      return false;
    });
    
    if (isDuplicate) {
      console.log(`📝 Product ${productSku} from order ${order.order_sn} already logged, skipping...`);
      shouldAppend = false;
    }
  }
  
  if (shouldAppend) {
    fs.appendFileSync(productLogPath, logEntry, 'utf8');
    console.log(`📝 Product not found logged: ${productSku} from order ${order.order_sn}`);
  }
};

class DestyOdooService {
  constructor() {
    this.odooService = odooIntegrationService;
    this.productMappingService = productMappingService;
  }

  // Create customer from Desty order
  async createDestyCustomer(order) {
    try {
      console.log(`👤 Creating customer for Desty order: ${order.buyer_username}`);
      console.log(`🔍 Debug: Email "${order.buyer_email}", Phone "${order.buyer_phone}"`);
      console.log(`🔍 Debug: Address "${order.shipping_address?.address}"`);

      // Create simple platform reference
      const platformRef = this.createSimplePlatformRef(order);
      if (platformRef) {
        console.log(`🏷️ Platform reference: ${platformRef}`);
      }

      // Triple check: Find by platform reference FIRST
      if (platformRef) {
        console.log(`🔍 Check 1: Searching by platform reference "${platformRef}"`);
        const customerByRef = await this.findCustomerByRef(platformRef);
        if (customerByRef) {
          console.log(`✅ Found existing customer by platform reference: ${customerByRef.id}`);
          return customerByRef;
        } else {
          console.log(`❌ No customer found by platform reference`);
        }
      }

      // Check if customer already exists by email/phone
      console.log(`🔍 Check 2: Searching by email/phone`);
      const existingCustomer = await this.findCustomerByEmailOrPhone(order.buyer_email, order.buyer_phone);
      if (existingCustomer) {
        console.log(`✅ Found existing customer: ${existingCustomer.id}`);
        return existingCustomer;
      } else {
        console.log(`❌ No customer found by email/phone`);
      }

      // Double check: Find by name and street
      console.log(`🔍 Check 3: Searching by name and street`);
      const customerByNameAndStreet = await this.findCustomerByNameAndStreet(order.buyer_username, order.shipping_address?.address);
      if (customerByNameAndStreet) {
        console.log(`✅ Found existing customer by name and street: ${customerByNameAndStreet.id}`);
        return customerByNameAndStreet;
      } else {
        console.log(`❌ No customer found by name and street`);
      }

      // Fallback check: Find by name only (prevent duplicates)
      console.log(`🔍 Check 4: Searching by name only (fallback)`);
      const customerByNameOnly = await this.findCustomerByNameOnly(order.buyer_username);
      if (customerByNameOnly) {
        console.log(`✅ Found existing customer by name only: ${customerByNameOnly.id}`);
        return customerByNameOnly;
      } else {
        console.log(`❌ No customer found by name only`);
      }

      // Create customer data (only if no existing customer found)
      const customerData = {
        name: order.buyer_username,
        email: order.buyer_email,
        phone: order.buyer_phone,
        street: order.shipping_address?.address,
        city: order.shipping_address?.city,
        zip: order.shipping_address?.postal_code,
        country_id: await this.getCountryId(order.shipping_address?.country) || 100, // Default to Indonesia (ID: 100)
        is_company: false,
        customer_rank: 1,
        company_type: 'person'
      };

      // Add platform reference if enabled
      if (platformRef) {
        customerData.ref = platformRef;
      }

      const customer = await this.odooService.createPartner(customerData);
      console.log(`✅ Created new customer: ${customer.id}`);
      
      return customer;
    } catch (error) {
      console.error('❌ Error creating Desty customer:', error.message);
      throw error;
    }
  }

  // Create simple platform reference (name_platform format)
  createSimplePlatformRef(order) {
    if (!CUSTOMER_REF_CONFIG.ENABLE_PLATFORM_REF) {
      return null;
    }
    
    const customerName = order.buyer_username || 'unknown';
    const platformName = order.platform_name || order.platform || CUSTOMER_REF_CONFIG.DEFAULT_PLATFORM;
    
    // Clean components if enabled
    const cleanName = CUSTOMER_REF_CONFIG.CLEAN_SPECIAL_CHARS 
      ? customerName.replace(/[^a-zA-Z0-9]/g, '_')
      : customerName;
    
    const cleanPlatform = CUSTOMER_REF_CONFIG.CLEAN_SPECIAL_CHARS 
      ? platformName.replace(/[^a-zA-Z0-9]/g, '_')
      : platformName;
    
    // Create reference
    let ref = `${cleanName}${CUSTOMER_REF_CONFIG.REF_SEPARATOR}${cleanPlatform}`;
    
    // Convert to lowercase if enabled
    if (CUSTOMER_REF_CONFIG.LOWERCASE_REF) {
      ref = ref.toLowerCase();
    }
    
    // Ensure within character limit
    const maxLength = CUSTOMER_REF_CONFIG.MAX_REF_LENGTH;
    return ref.length > maxLength ? ref.substring(0, maxLength - 3) + '...' : ref;
  }

  // Find customer by email or phone
  async findCustomerByEmailOrPhone(email, phone) {
    try {
      let domain = [];
      
      if (email) {
        domain.push(['email', '=', email]);
      }
      
      if (phone) {
        if (email) {
          domain = ['|', ...domain, ['phone', '=', phone]];
        } else {
          domain = [['phone', '=', phone]];
        }
      }

      if (domain.length === 0) return null;

      const customers = await this.odooService.execute('res.partner', 'search_read', [domain, ['id', 'name', 'email', 'phone']]);
      return customers.length > 0 ? customers[0] : null;
    } catch (error) {
      console.warn('⚠️ Could not find customer:', error.message);
      return null;
    }
  }

  // Find customer by name only (fallback for duplicate prevention)
  async findCustomerByNameOnly(name) {
    try {
      if (!name) return null;
      
      console.log(`🔍 Fallback: Searching customer by name only "${name}"`);
      
      const customers = await this.odooService.execute('res.partner', 'search_read', [
        [['name', '=', name]]
      ], ['id', 'name', 'email', 'phone', 'ref']);
      
      return customers.length > 0 ? customers[0] : null;
    } catch (error) {
      console.warn('⚠️ Could not find customer by name only:', error.message);
      return null;
    }
  }

  // Find customer by platform reference
  async findCustomerByRef(ref) {
    try {
      if (!ref) return null;
      
      const customers = await this.odooService.execute('res.partner', 'search_read', [
        [['ref', '=', ref]]
      ], ['id', 'name', 'email', 'phone', 'ref']);
      
      return customers.length > 0 ? customers[0] : null;
    } catch (error) {
      console.warn('⚠️ Could not find customer by reference:', error.message);
      return null;
    }
  }

  // Find customer by name and street (double check)
  async findCustomerByNameAndStreet(name, street) {
    try {
      if (!name || !street) return null;
      
      console.log(`🔍 Double check: Searching customer by name "${name}" and street "${street}"`);
      
      const domain = [
        ['name', '=', name],
        ['street', '=', street],
        ['active', '=', true]
      ];

      const customers = await this.odooService.execute('res.partner', 'search_read', [domain, ['id', 'name', 'email', 'phone', 'street']]);
      return customers.length > 0 ? customers[0] : null;
    } catch (error) {
      console.warn('⚠️ Could not find customer by name and street:', error.message);
      return null;
    }
  }

  // Get country ID by name
  async getCountryId(countryName) {
    try {
      return 100; // Langsung return to Indonesia
      
       if (!countryName || countryName.trim().length === 0) {
        console.log(`🔍 No country name provided, defaulting to Indonesia (ID: 100)`);
        return 100; // Default to Indonesia
      }
      
      const cleanCountryName = countryName.trim().replace(/[^\w\s]/g, '');
      console.log(`🔍 Searching for country: "${cleanCountryName}" (original: "${countryName}")`);
      
      // Fallback to known country ID to avoid search errors
      const knownCountries = {
        'indonesia': 100,
        'indonesian': 100,
        'id': 100,
        'malaysia': 129,
        'singapore': 188,
        'thailand': 208,
        'philippines': 169,
        'vietnam': 237
      };
      
      const countryKey = cleanCountryName.toLowerCase();
      if (knownCountries[countryKey]) {
        console.log(`✅ Using known country mapping: ${cleanCountryName} -> ID ${knownCountries[countryKey]}`);
        return knownCountries[countryKey];
      }
      
      // Only try search if not in known list
      console.log(`🔍 Country not in known list, trying search...`);
      const countries = await this.odooService.execute('res.country', 'search_read', [
        ['name', 'ilike', cleanCountryName]
      ], ['id', 'name']);
      
      if (countries.length > 0) {
        console.log(`✅ Found country: ${countries[0].name} (ID: ${countries[0].id})`);
        return countries[0].id;
      } else {
        console.log(`⚠️ Country "${cleanCountryName}" not found, defaulting to Indonesia (ID: 100)`);
        return 100; // Default to Indonesia
      }
    } catch (error) {
      console.warn('⚠️ Could not get country ID:', error.message);
      console.log('🔍 Defaulting to Indonesia (ID: 100) due to error');
      return 100; // Default to Indonesia
    }
  }

  // Get warehouse ID based on store name with proper mapping (Store → Branch → Warehouse)
  async getWarehouseId(store_name) {
    console.log("getWarehouseId store_name", store_name);
    try {
      if (!store_name) return 1; // Default warehouse
      
      console.log(`🔍 Step 1: Map store to branch for store: ${store_name}`);
      
      // Step 1: Map store name to branch
      const { STORE_BRANCH_MAPPING, DEFAULT_BRANCH } = require('../config');
      const branch = STORE_BRANCH_MAPPING[store_name] || DEFAULT_BRANCH;
      
      console.log(`🔍 Step 2: Branch mapped: ${branch}`);
      console.log(`🔍 Step 3: Map branch to warehouse for branch: ${branch}`);
      
      // Step 2: Map branch to warehouse ID
      if (BRANCH_WAREHOUSE_MAPPING[branch.toUpperCase()]) {
        console.log(`✅ Found mapped warehouse: ${branch} → ${BRANCH_WAREHOUSE_MAPPING[branch.toUpperCase()]}`);
        return BRANCH_WAREHOUSE_MAPPING[branch.toUpperCase()];
      }
      
      console.log(`⚠️ No warehouse found for branch: ${branch}, using default`);
      return 1; // Default warehouse
    } catch (error) {
      console.warn('⚠️ Could not get warehouse ID:', error.message);
      return 1; // Default warehouse
    }
  }

  // Get stock location ID based on branch
  async getStockLocationId(branch) {
    try {
      if (!branch) return 8; // Default stock location
      
      console.log(`🔍 Looking for stock location for branch: ${branch}`);
      
      // First try direct mapping from config
      if (BRANCH_STOCK_LOCATION_MAPPING[branch.toUpperCase()]) {
        console.log(`✅ Found mapped stock location: ${BRANCH_STOCK_LOCATION_MAPPING[branch.toUpperCase()]}`);
        return BRANCH_STOCK_LOCATION_MAPPING[branch.toUpperCase()];
      }
      
      // If no mapping, try searching by name
      const locations = await this.odooService.execute('stock.location', 'search_read', [
        ['name', 'ilike', branch],
        ['usage', '=', 'internal']
      ], ['id', 'name']);
      
      if (locations.length > 0) {
        console.log(`✅ Found stock location by search: ${locations[0].id} - ${locations[0].name}`);
        return locations[0].id;
      }
      
      console.log(`⚠️ No stock location found for branch: ${branch}, using default`);
      return 8; // Default stock location
    } catch (error) {
      console.warn('⚠️ Could not get stock location ID:', error.message);
      return 8; // Default stock location
    }
  }

  // Check product by SKU (delegate to odooIntegrationService)
  async checkProductSKU(sku) {
    try {
      return await this.odooService.checkProductSKU(sku);
    } catch (error) {
      console.error('❌ Error checking product SKU:', error.message);
      throw error;
    }
  }

  // Create order in Odoo with Desty-specific fields
  async createDestyOrder(order, customer, validatedItems) {
    try {
      console.log(`📋 Creating Desty order in Odoo: ${order.order_sn}`);

      // Create order without lines first
      const orderData = {
        partner_id: customer.id,
        state: ORDER_STATE_CONFIG.DEFAULT_ORDER_STATE, // Use config instead of hardcoded 'draft'
        date_order: order.order_date || new Date().toISOString().split('T')[0],
        validity_date: this.calculateValidityDate(order.order_date),
        pricelist_id: 1, // Default pricelist
        fiscal_position_id: ODOO_DEFAULTS.FISCAL_POSITION_ID, // Hardcoded default to avoid domain error
        warehouse_id: await this.getWarehouseId(order.store_name),
        team_id: ODOO_DEFAULTS.SALES_TEAM_ID, // Hardcoded default to avoid domain error
        note: order.notes,
        origin: `Desty: ${order.order_sn}`,
        client_order_ref: order.order_sn,
        order_lines: [], // Empty initially
        amount_total: order.total_amount,
        amount_tax: order.raw_data?.tax || 0, // Use tax from raw_data
        amount_untaxed: this.calculateSubtotal(validatedItems),
        payment_term_id: await this.getPaymentTermId(order.payment_method),
        // Add additional fields from raw_data
        order_sn: order.raw_data?.orderSn || order.order_sn,
        platform_name: order.raw_data?.platformName || order.platform_name,
        storeName: order.raw_data?.storeName || order.store_name,
        buyerNotes: order.raw_data?.buyerNotes || order.notes,
        includeTax: order.raw_data?.includeTax,
        paymentMethod: order.raw_data?.paymentMethod || order.payment_method
      };

      console.log('📋 Order data being sent to Odoo:', JSON.stringify(orderData, null, 2));

      // Create order first
      const odooOrder = await this.odooService.createSaleOrder(orderData);
      
      console.log(`✅ Created empty Odoo order: ${odooOrder.id}`);
      
      // Debug: Check validatedItems
      console.log('📋 Debug - validatedItems:', JSON.stringify(validatedItems, null, 2));
      console.log('📋 Debug - validatedItems length:', validatedItems?.length);

      // Then add order lines separately
      for (const item of validatedItems) {
        try {
          console.log(`🔄 Processing item: ${JSON.stringify(item, null, 2)}`);
          
          const product = await this.odooService.checkProductSKU(item.sku);
          console.log(`🔍 Product found: ${JSON.stringify(product, null, 2)}`);
          
          if (!product) {
            throw new Error(`Product not found in Odoo: ${item.sku}`);
          }

          const orderLine = {
            order_id: odooOrder.id,
            product_id: product.id,
            product_uom_qty: item.qty,
            price_unit: item.price,
            name: item.name,
            tax_id: TAX_CONFIG.DEFAULT_TAX_ID // Use tax from config (false = no tax)
          };

          // Create order line separately
          await this.odooService.execute('sale.order.line', 'create', [orderLine]);
          console.log(`✅ Added order line for product: ${item.sku}`);
          console.log(` > product : ${ JSON.stringify(item, null, 2)}`);
          console.log(` > orderLine : ${ JSON.stringify(orderLine, null, 2)}`);

        } catch (error) {
          console.error(`❌ Error creating order line for ${item.sku}:`, error.message);
          throw error;
        }
      }
      
      // Store mapping
      await this.storeOrderMapping(order.order_sn, odooOrder.id, 'desty');
     
      console.log(`✅ Created complete Odoo order: ${odooOrder.id}`);
      return odooOrder;
    } catch (error) {
      console.error('❌ Error creating Desty order in Odoo:', error.message);
      
      // If it's a field error, inspect the required fields
      if (error.message && error.message.includes('required_fields')) {
        console.log('🔍 Field error detected, inspecting sale.order.line fields...');
        await this.inspectSaleOrderLineFields();
      }
      
      throw error;
    }
  }

  // Create order lines from validated items
  async createOrderLines(items) {
    console.log(`📋 Creating order lines for items:`, items);
    
    if (!items || !Array.isArray(items)) {
      console.error('❌ Invalid items for order lines:', items);
      throw new Error('Items must be an array');
    }
    
    const orderLines = [];
    
    for (const item of items) {
      try {
        const product = await this.odooService.checkProductSKU(item.sku);
        
        if (!product) {
          throw new Error(`Product not found in Odoo: ${item.sku}`);
        }

        const orderLine = {
          product_id: product.id,
          product_uom_qty: item.qty,
          price_unit: item.price,
          name: item.name,
          customer_lead: 0
        };

        orderLines.push([0, 0, orderLine]);
        console.log(`✅ Added order line for product: ${item.sku}`);
      } catch (error) {
        console.error(`❌ Error creating order line for ${item.sku}:`, error.message);
        throw error;
      }
    }

    return orderLines;
  }

  // Get tax IDs for product
  async getTaxIds(product) {
    try {
      // Default to Indonesian VAT (PPN 11%)
      const taxes = await this.odooService.execute('account.tax', 'search_read', [
        [['type_tax_use', '=', 'sale'], ['amount', '=', 11]]
      ], ['id', 'name']);
      
      return taxes.length > 0 ? [taxes[0].id] : [];
    } catch (error) {
      console.warn('⚠️ Could not get tax IDs:', error.message);
      return [];
    }
  }

  // Inspect sale.order.line fields to understand required fields
  async inspectSaleOrderLineFields() {
    try {
      console.log('🔍 Inspecting sale.order.line fields...');
      
      // Get fields info for sale.order.line model
      const fields = await this.odooService.execute('sale.order.line', 'fields_get', []);
      
      console.log('📋 All sale.order.line fields:');
      Object.keys(fields).forEach(fieldName => {
        const field = fields[fieldName];
        console.log(`  - ${fieldName}: ${field.type} (${field.required ? 'REQUIRED' : 'optional'}) - ${field.string || field.help || 'No description'}`);
      });
      
      return fields;
    } catch (error) {
      console.error('❌ Error inspecting sale.order.line fields:', error.message);
      return null;
    }
  }

  // Calculate tax amount
  calculateTax(items) {
    const subtotal = this.calculateSubtotal(items);
    return Math.round(subtotal * 0.11); // 11% VAT
  }

  // Calculate subtotal
  calculateSubtotal(items) {
    if (!items || !Array.isArray(items)) {
      console.warn('⚠️ Invalid items for subtotal calculation:', items);
      return 0;
    }
    
    return items.reduce((total, item) => {
      if (!item || typeof item.price !== 'number' || typeof item.qty !== 'number') {
        console.warn('⚠️ Invalid item for subtotal calculation:', item);
        return total;
      }
      return total + (item.price * item.qty);
    }, 0);
  }

  // Calculate validity date (7 days from order date)
  calculateValidityDate(orderDate) {
    const date = new Date(orderDate || Date.now());
    date.setDate(date.getDate() + 7);
    return date.toISOString().split('T')[0];
  }

  // Get payment term ID based on payment method
  async getPaymentTermId(paymentMethod) {
    // Use hardcoded default to avoid search_read errors
    return ODOO_DEFAULTS.PAYMENT_TERM_ID || 1;
  }

  // Store order mapping
  async storeOrderMapping(orderSn, odooOrderId, marketplace) {
    try {
      const mapping = {
        marketplace_order_id: orderSn,
        odoo_order_id: odooOrderId,
        marketplace: marketplace,
        created_at: new Date().toISOString()
      };
      
      // Store in product mapping service (reuse existing infrastructure)
      await this.productMappingService.saveOrderMapping(mapping);
      console.log(`✅ Stored order mapping: ${orderSn} -> ${odooOrderId}`);
    } catch (error) {
      console.warn('⚠️ Could not store order mapping:', error.message);
    }
  }

  // Handle order confirmation
  async confirmDestyOrder(odooOrderId) {
    try {
      console.log(`✅ Confirming Desty order in Odoo: ${odooOrderId}`);
      
      await this.odooService.confirmSaleOrder(odooOrderId);
      console.log(`✅ Desty order confirmed in Odoo: ${odooOrderId}`);
      
      return true;
    } catch (error) {
      console.error('❌ Error confirming Desty order:', error.message);
      throw error;
    }
  }

  // Create shipment/picking
  async createDestyShipment(odooOrderId, order) {
    try {
      console.log(`📦 Creating shipment for Desty order: ${odooOrderId}`);
      
      const pickingData = {
        origin: `Desty: ${order.order_sn}`,
        scheduled_date: new Date().toISOString().split('T')[0],
        priority: '1',
        move_type: 'direct',
        location_id: await this.getStockLocationId(order.branch),
        location_dest_id: await this.getCustomerLocationId()
      };

      const picking = await this.odooService.createStockPicking(odooOrderId, pickingData);
      
      // Update with tracking info if available
      if (order.tracking_number) {
        await this.updatePickingTracking(picking.id, order.tracking_number);
      }

      console.log(`✅ Created shipment: ${picking.id}`);
      return picking;
    } catch (error) {
      console.error('❌ Error creating Desty shipment:', error.message);
      throw error;
    }
  }

  // Get stock location ID based on branch
  async getStockLocationId(branch) {
    try {
      if (!branch) return 8; // Default stock location
      
      const locations = await this.odooService.execute('stock.location', 'search_read', [
        ['name', 'ilike', branch]
      ], ['id', 'name']);
      
      return locations.length > 0 ? locations[0].id : 8;
    } catch (error) {
      console.warn('⚠️ Could not get stock location ID:', error.message);
      return 8;
    }
  }

  // Get customer location ID
  async getCustomerLocationId() {
    try {
      const locations = await this.odooService.execute('stock.location', 'search_read', [
        ['usage', '=', 'customer']
      ], ['id', 'name']);
      
      return locations.length > 0 ? locations[0].id : 5; // Default customer location
    } catch (error) {
      console.warn('⚠️ Could not get customer location ID:', error.message);
      return 5;
    }
  }

  // Update picking with tracking number
  async updatePickingTracking(pickingId, trackingNumber) {
    try {
      await this.odooService.execute('stock.picking', 'write', [pickingId, {
        carrier_tracking_ref: trackingNumber
      }]);
      
      console.log(`✅ Updated tracking for picking ${pickingId}: ${trackingNumber}`);
    } catch (error) {
      console.warn('⚠️ Could not update tracking:', error.message);
    }
  }

  // Validate products and stock with branch-specific inventory
  async validateDestyProducts(items, branch = null, order = null) {
    const validatedItems = [];
    const errors = [];
    const warnings = [];

    
    console.log(`🔍 Validating ${items.length} products for branch: ${branch}`);

    for (const item of items) {
      try {
        // Check product exists in Odoo
        const product = await this.odooService.checkProductSKU(item.sku);
        
        if (!product) {
          errors.push(`Product not found in Odoo: ${item.sku}`);
          
          // Log to product not found file
          if (order) {
            writeProductNotFoundLog(order, item.sku, item.name);
          }
          
          continue;
        }

        // Check stock availability in branch-specific warehouse
        console.log(`🔍 SKIPcheckProductStock: ${branch}`);

        /*
        const stock = await this.checkProductStock(item.sku, branch);
        if (stock < item.qty) {
          warnings.push(`Insufficient stock for ${item.sku} in ${branch} warehouse (Available: ${stock}, Required: ${item.qty})`);
        
      */

      const stock=10;

        // Check price variance
        const priceDiff = Math.abs(product.list_price - item.price) / product.list_price * 100;
        if (priceDiff > 10) {
          warnings.push(`Price variance detected for ${item.sku} (Odoo: ${product.list_price}, Desty: ${item.price})`);
        }

        validatedItems.push({
          ...item,
          odoo_product_id: product.id,
          available_stock: stock,
          odoo_price: product.list_price,
          warehouse_branch: branch
        });

      } catch (error) {
        errors.push(`Error validating product ${item.sku}: ${error.message}`);
      }
    }

    return {
      validatedItems,
      errors,
      warnings,
      canProceed: errors.length === 0
    };
  }

  // Check product stock with branch-specific warehouse
  async checkProductStock(sku, branch = null) {
    try {
      // 🔍 1. Get product
      const product = await this.odooService.checkProductSKU(sku);
      if (!product) {
        console.warn(`⚠️ Product not found: ${sku}`);
        return 0;
      }

      // 🔍 2. DISABLED: Skip complex stock checking
      console.log(`🔍 SKIP checkProductStock: ${branch} - DISABLED`);
      
      // 🔥 3. Return hardcoded stock value to avoid errors
      const hardcodedStock = 10; // Default safe stock value
      
      console.log(`✅ HARDCODED STOCK (${sku} - ${branch}): ${hardcodedStock}`);

      return hardcodedStock;

    } catch (error) {
      console.warn(`⚠️ Stock check failed (${sku}):`, error.message);
      return 10; // Default fallback stock
    }
  }

  // Get all location IDs for a warehouse
  async getWarehouseLocationIds(warehouseId) {
    try {
      console.log(`🔍 Getting location IDs for warehouse: ${warehouseId}`);
      
      const warehouse = await this.odooService.execute('stock.warehouse', 'read', [
        [warehouseId], // Pass as array, not single integer
        ['lot_stock_id', 'wh_input_stock_loc_id', 'wh_output_stock_loc_id', 'wh_qc_stock_loc_id']
      ]);
      
      if (warehouse && warehouse.length > 0) {
        const wh = warehouse[0];
        console.log(`🔍 Warehouse data:`, JSON.stringify(wh, null, 2));
        
        const locationIds = [
          wh.lot_stock_id, // Main stock location (could be int or [id, name])
          wh.wh_input_stock_loc_id, // Input location
          wh.wh_output_stock_loc_id, // Output location
          wh.wh_qc_stock_loc_id // QC location
        ].filter(id => id); // Filter out null/undefined
        
        // Convert to array of integers if needed
        const ids = locationIds.map(id => {
          if (Array.isArray(id)) {
            return id[0]; // If it's [id, name], get the id
          }
          return id; // If it's already an integer
        });
        
        console.log(`🔍 Location IDs for warehouse ${warehouseId}:`, ids);
        return ids;
      }
      
      console.log(`⚠️ No warehouse found for ID: ${warehouseId}`);
      return [];
    } catch (error) {
      console.warn('⚠️ Could not get warehouse location IDs:', error.message);
      return [];
    }
  }

  // Get warehouse root location
  async getWarehouseRootLocation(warehouseId) {
    try {
      console.log(`🔍 Getting root location for warehouse: ${warehouseId}`);

      const warehouse = await this.odooService.execute(
        'stock.warehouse',
        'read',
        [[warehouseId]],
        ['lot_stock_id']
      );

      if (!warehouse || warehouse.length === 0) {
        console.warn(`⚠️ Warehouse not found: ${warehouseId}`);
        return null;
      }

      const lotStock = warehouse[0].lot_stock_id;

      if (!lotStock) {
        console.warn(`⚠️ No lot_stock_id for warehouse: ${warehouseId}`);
        return null;
      }

      const rootLocationId = Array.isArray(lotStock)
        ? lotStock[0]
        : lotStock;

      console.log(`✅ Root location: ${rootLocationId}`);

      return rootLocationId;

    } catch (error) {
      console.warn('⚠️ Failed getWarehouseRootLocation:', error.message);
      return null;
    }
  }

}

module.exports = new DestyOdooService();
