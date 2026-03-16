// services/odooIntegrationService.js
// Odoo Integration Service with XMLRPC

const xmlrpc = require('xmlrpc');

class OdooIntegrationService {
  constructor() {
    this.url = process.env.ODOO_URL;
    this.db = process.env.ODOO_DB;
    this.username = process.env.ODOO_USERNAME;
    this.password = process.env.ODOO_PASSWORD;
    this.uid = null;
    this.lastAuthTime = null;
    this.authCacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // === AUTHENTICATION ===
  
  async authenticate() {
    try {
      // Check if we have a cached UID that's still valid
      if (this.uid && this.lastAuthTime && 
          (Date.now() - this.lastAuthTime) < this.authCacheTimeout) {
        console.log('🔐 Using cached Odoo authentication');
        return this.uid;
      }

      console.log('🔐 Authenticating with Odoo...');
      
      const client = xmlrpc.createSecureClient(this.url + '/xmlrpc/2/common');
      
      return new Promise((resolve, reject) => {
        client.methodCall('authenticate', [
          this.db,
          this.username,
          this.password,
          {}
        ], (error, uid) => {
          if (error) {
            console.error('❌ Odoo authentication failed:', error.message);
            reject(error);
            return;
          }

          if (uid === false) {
            reject(new Error('Invalid Odoo credentials'));
            return;
          }

          this.uid = uid;
          this.lastAuthTime = Date.now();
          console.log(`✅ Odoo authenticated successfully (UID: ${uid})`);
          resolve(uid);
        });
      });
    } catch (error) {
      console.error('❌ Error authenticating with Odoo:', error.message);
      throw error;
    }
  }

  // === XMLRPC EXECUTOR ===
  
  async execute(model, method, params = []) {
    try {
      await this.authenticate();
      
      const client = xmlrpc.createSecureClient(this.url + '/xmlrpc/2/object');
      
      return new Promise((resolve, reject) => {
        client.methodCall('execute_kw', [
          this.db,
          this.uid,
          this.password,
          model,
          method,
          params
        ], (error, result) => {
          if (error) {
            console.error(`❌ Odoo execute error (${model}.${method}):`, error.message);
            reject(error);
            return;
          }

          if (result && result.faultCode) {
            console.error(`❌ Odoo fault (${model}.${method}):`, result.faultString);
            reject(new Error(result.faultString));
            return;
          }

          console.log(`✅ Odoo execute success (${model}.${method}):`, {
            model,
            method,
            resultCount: Array.isArray(result) ? result.length : 1
          });
          
          resolve(result);
        });
      });
    } catch (error) {
      console.error(`❌ Error executing ${model}.${method}:`, error.message);
      throw error;
    }
  }

  // === PARTNER MANAGEMENT ===
  
  async checkPartner(partnerData) {
    try {
      const { name, email, phone, marketplace_customer_id } = partnerData;
      
      console.log(`🔍 Checking partner: ${name}`);
      
      // Search by multiple criteria
      const searchCriteria = [];
      
      if (name) {
        searchCriteria.push(['name', '=', name]);
      }
      
      if (email) {
        searchCriteria.push(['email', '=', email]);
      }
      
      if (phone) {
        searchCriteria.push(['phone', '=', phone]);
      }
      
      if (marketplace_customer_id) {
        searchCriteria.push(['x_marketplace_customer_id', '=', marketplace_customer_id]);
      }

      let partners = [];
      
      if (searchCriteria.length > 0) {
        // Search with OR condition if multiple criteria
        if (searchCriteria.length === 1) {
          partners = await this.execute('res.partner', 'search', [searchCriteria]);
        } else {
          // For multiple criteria, search by name first, then filter
          partners = await this.execute('res.partner', 'search', [[['name', '=', name]]]);
        }
      }

      if (partners.length > 0) {
        // Get full partner data (without custom fields)
        const partnerDetails = await this.execute('res.partner', 'read', [
          partners,
          ['id', 'name', 'email', 'phone', 'active']
        ]);
        
        console.log(`✅ Partner found: ${partnerDetails[0].id} - ${partnerDetails[0].name}`);
        return partnerDetails[0];
      }

      console.log(`ℹ️ Partner not found: ${name}`);
      return null;
    } catch (error) {
      console.error('❌ Error checking partner:', error.message);
      throw error;
    }
  }

  async createPartner(partnerData) {
    try {
      const {
        name,
        email,
        phone,
        street,
        city,
        state,
        zip,
        country,
        marketplace_customer_id,
        marketplace_name
      } = partnerData;

      console.log(`👤 Creating partner: ${name}`);

      // Prepare partner data
      const partnerValues = {
        name: name,
        customer_rank: 1, // Mark as customer
        active: true
      };

      // Add optional fields
      if (email) partnerValues.email = email;
      if (phone) partnerValues.phone = phone;
      if (street) partnerValues.street = street;
      if (city) partnerValues.city = city;
      if (state) partnerValues.state_id = await this.getStateId(state);
      if (zip) partnerValues.zip = zip;
      if (country) partnerValues.country_id = await this.getCountryId(country);
      
      // Add marketplace fields (commented out - custom fields don't exist)
      // if (marketplace_customer_id) {
      //   partnerValues.x_marketplace_customer_id = marketplace_customer_id;
      // }
      
      // if (marketplace_name) {
      //   partnerValues.x_marketplace_name = marketplace_name;
      // }

      const partnerId = await this.execute('res.partner', 'create', [partnerValues]);
      
      console.log(`✅ Partner created: ${partnerId} - ${name}`);
      
      // Return full partner data (without custom fields)
      return await this.execute('res.partner', 'read', [
        [partnerId],
        ['id', 'name', 'email', 'phone']
      ]).then(partners => partners[0]);
    } catch (error) {
      console.error('❌ Error creating partner:', error.message);
      throw error;
    }
  }

  async findOrCreatePartner(partnerData) {
    try {
      // First check if partner exists
      const existingPartner = await this.checkPartner(partnerData);
      
      if (existingPartner) {
        return existingPartner;
      }

      // Create new partner if not found
      return await this.createPartner(partnerData);
    } catch (error) {
      console.error('❌ Error in findOrCreatePartner:', error.message);
      throw error;
    }
  }

  // === PRODUCT MANAGEMENT ===
  
  async checkProductSKU(sku) {
    try {
      console.log(`🔍 Checking product SKU: ${sku}`);
      
      // Search product by default code (SKU)
      const productIds = await this.execute('product.product', 'search', [
        [['default_code', '=', sku]]
      ]);

      if (productIds.length > 0) {
        // Get full product data including active and sale_ok status
        const productDetails = await this.execute('product.product', 'read', [
          productIds,
          ['id', 'name', 'default_code', 'active', 'sale_ok', 'type', 'list_price']
        ]);
        
        console.log(`✅ Product found: ${productDetails[0].id} - ${sku} (active: ${productDetails[0].active}, sale_ok: ${productDetails[0].sale_ok})`);
        return productDetails[0];
      }

      console.log(`ℹ️ Product not found: ${sku}`);
      return null;
    } catch (error) {
      console.error('❌ Error checking product SKU:', error.message);
      throw error;
    }
  }

  async checkProductStock(sku) {
    try {
      console.log(`🔍 Checking stock for SKU: ${sku}`);
      
      // First get the product
      const product = await this.checkProductSKU(sku);
      if (!product) {
        return 0;
      }

      // Get stock quants for this product
      const stockQuants = await this.execute('stock.quant', 'search', [
        [['product_id', '=', product.id], ['location_id.usage', '=', 'internal']]
      ]);

      let totalStock = 0;
      if (stockQuants.length > 0) {
        const quantDetails = await this.execute('stock.quant', 'read', [
          stockQuants,
          ['quantity']
        ]);
        totalStock = quantDetails.reduce((sum, quant) => sum + quant.quantity, 0);
      }

      console.log(`📊 Stock for ${sku}: ${totalStock} units`);
      return totalStock;
    } catch (error) {
      console.error('❌ Error checking product stock:', error.message);
      return 0;
    }
  }

  // === SALE ORDER MANAGEMENT ===
  
  async createSaleOrder(orderData) {
    try {
      const {
        partner_id,
        order_lines,
        shop_id,
        marketplace_order_id,
        marketplace_name,
        order_date,
        delivery_date,
        notes,
        company_id,
        warehouse_id,
        pricelist_id
      } = orderData;

      console.log(`📦 Creating sale order for partner: ${partner_id}`);

      // Prepare order lines
      const orderLineValues = [];
      for (const line of order_lines) {
        const lineData = {
          product_id: line.product_id,
          product_uom_qty: line.quantity,
          name: line.description || line.product_name,
          price_unit: line.price_unit
        };

        // Add tax if specified
        if (line.tax_id) {
          lineData.tax_id = [[6, 0, [line.tax_id]]];
        }

        orderLineValues.push([0, 0, lineData]);
      }

      // Prepare sale order data
      const saleOrderValues = {
        partner_id: partner_id,
        order_line: orderLineValues,
        state: 'draft',
        date_order: order_date ? new Date(order_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        note: notes
      };

      // Add optional fields only if they exist and are valid
      if (company_id && typeof company_id === 'number') {
        saleOrderValues.company_id = company_id;
      }
      
      if (warehouse_id && typeof warehouse_id === 'number') {
        saleOrderValues.warehouse_id = warehouse_id;
      }
      
      if (pricelist_id && typeof pricelist_id === 'number') {
        saleOrderValues.pricelist_id = pricelist_id;
      }

      // Add marketplace fields (commented out - custom fields don't exist)
      // if (marketplace_order_id) {
      //   saleOrderValues.x_marketplace_order_id = marketplace_order_id;
      // }
      
      // if (marketplace_name) {
      //   saleOrderValues.x_marketplace_name = marketplace_name;
      // }

      // if (shop_id) {
      //   saleOrderValues.x_shop_id = shop_id;
      // }

      const saleOrderId = await this.execute('sale.order', 'create', [saleOrderValues]);
      
      console.log(`✅ Sale order created: ${saleOrderId}`);
      
      // Return full sale order data
      return await this.execute('sale.order', 'read', [
        [saleOrderId],
        ['id', 'name', 'partner_id', 'state', 'amount_total', 'date_order']
      ]).then(orders => orders[0]);
    } catch (error) {
      console.error('❌ Error creating sale order:', error.message);
      throw error;
    }
  }

  async confirmSaleOrder(saleOrderId) {
    try {
      console.log(`✅ Confirming sale order: ${saleOrderId}`);
      
      // Check current state
      const order = await this.execute('sale.order', 'read', [
        [saleOrderId],
        ['id', 'name', 'state', 'order_line']
      ]).then(orders => orders[0]);

      if (order.state !== 'draft') {
        console.log(`ℹ️ Sale order ${saleOrderId} is already confirmed (state: ${order.state})`);
        return order;
      }

      // Get stock levels before confirmation for tracking
      const stockBefore = await this.getOrderStockLevels(saleOrderId);
      console.log(`📊 Stock levels before confirmation:`, stockBefore);

      // Confirm the sale order - this automatically reduces stock in Odoo
      await this.execute('sale.order', 'action_confirm', [[saleOrderId]]);
      
      // Get stock levels after confirmation
      const stockAfter = await this.getOrderStockLevels(saleOrderId);
      console.log(`📊 Stock levels after confirmation:`, stockAfter);

      // Calculate stock reduction
      const stockReduction = this.calculateStockReduction(stockBefore, stockAfter);
      console.log(`📉 Stock reduction:`, stockReduction);

      // Get updated order
      const confirmedOrder = await this.execute('sale.order', 'read', [
        [saleOrderId],
        ['id', 'name', 'state', 'amount_total']
      ]).then(orders => orders[0]);
      
      console.log(`✅ Sale order confirmed: ${saleOrderId} - ${confirmedOrder.name}`);
      console.log(`📉 Stock automatically reduced by Odoo for confirmed order`);
      
      return {
        ...confirmedOrder,
        stock_before: stockBefore,
        stock_after: stockAfter,
        stock_reduction: stockReduction
      };
    } catch (error) {
      console.error('❌ Error confirming sale order:', error.message);
      throw error;
    }
  }

  // === PICKING MANAGEMENT ===
  
  async createPicking(saleOrderId) {
    try {
      console.log(`📦 Creating picking for sale order: ${saleOrderId}`);
      
      // Get pickings associated with the sale order
      const pickingIds = await this.execute('stock.picking', 'search', [
        [['sale_id', '=', saleOrderId]]
      ]);

      if (pickingIds.length === 0) {
        console.log(`ℹ️ No pickings found for sale order: ${saleOrderId}`);
        return null;
      }

      // Get picking details
      const pickings = await this.execute('stock.picking', 'read', [
        pickingIds,
        ['id', 'name', 'state', 'scheduled_date', 'origin']
      ]);

      console.log(`✅ Found ${pickings.length} pickings for sale order: ${saleOrderId}`);
      return pickings;
    } catch (error) {
      console.error('❌ Error creating/getting picking:', error.message);
      throw error;
    }
  }

  async confirmPicking(pickingId) {
    try {
      console.log(`✅ Confirming picking: ${pickingId}`);
      
      // Check current state
      const picking = await this.execute('stock.picking', 'read', [
        [pickingId],
        ['id', 'name', 'state']
      ]).then(pickings => pickings[0]);

      if (picking.state === 'done') {
        console.log(`ℹ️ Picking ${pickingId} is already done`);
        return picking;
      }

      // Validate the picking
      await this.execute('stock.picking', 'action_confirm', [[pickingId]]);
      
      // Get updated picking
      const confirmedPicking = await this.execute('stock.picking', 'read', [
        [pickingId],
        ['id', 'name', 'state']
      ]).then(pickings => pickings[0]);
      
      console.log(`✅ Picking confirmed: ${pickingId} - ${confirmedPicking.name}`);
      return confirmedPicking;
    } catch (error) {
      console.error('❌ Error confirming picking:', error.message);
      throw error;
    }
  }

  // === INVOICE MANAGEMENT (Optional) ===
  
  async createInvoice(saleOrderId) {
    try {
      console.log(`🧾 Creating invoice for sale order: ${saleOrderId}`);
      
      // Create invoice from sale order
      const invoiceIds = await this.execute('sale.order', 'action_invoice_create', [[saleOrderId]]);

      if (invoiceIds.length === 0) {
        console.log(`ℹ️ No invoices created for sale order: ${saleOrderId}`);
        return null;
      }

      // Get invoice details
      const invoices = await this.execute('account.move', 'read', [
        invoiceIds,
        ['id', 'name', 'state', 'amount_total', 'invoice_date']
      ]);

      console.log(`✅ Invoice created: ${invoices[0].id} - ${invoices[0].name}`);
      return invoices[0];
    } catch (error) {
      console.error('❌ Error creating invoice:', error.message);
      throw error;
    }
  }

  async updateInvoiceStatus(invoiceId, status) {
    try {
      console.log(`🧾 Updating invoice status: ${invoiceId} -> ${status}`);
      
      const statusMapping = {
        'draft': 'draft',
        'posted': 'posted',
        'paid': 'paid',
        'cancel': 'cancel'
      };

      const odooStatus = statusMapping[status];
      if (!odooStatus) {
        throw new Error(`Invalid invoice status: ${status}`);
      }

      // Update invoice state based on status
      switch (odooStatus) {
        case 'posted':
          await this.execute('account.move', 'action_post', [[invoiceId]]);
          break;
        case 'paid':
          await this.execute('account.move', 'action_post', [[invoiceId]]);
          // Additional payment processing would go here
          break;
        case 'cancel':
          await this.execute('account.move', 'button_cancel', [[invoiceId]]);
          break;
        default:
          console.log(`ℹ️ Invoice ${invoiceId} status already: ${odooStatus}`);
      }

      // Get updated invoice
      const updatedInvoice = await this.execute('account.move', 'read', [
        [invoiceId],
        ['id', 'name', 'state', 'amount_total']
      ]).then(invoices => invoices[0]);
      
      console.log(`✅ Invoice status updated: ${invoiceId} -> ${updatedInvoice.state}`);
      return updatedInvoice;
    } catch (error) {
      console.error('❌ Error updating invoice status:', error.message);
      throw error;
    }
  }

  // === HELPER METHODS ===
  
  async getStateId(stateName) {
    try {
      const stateIds = await this.execute('res.country.state', 'search', [
        [['name', '=', stateName]]
      ]);
      return stateIds.length > 0 ? stateIds[0] : null;
    } catch (error) {
      console.error('❌ Error getting state ID:', error.message);
      return null;
    }
  }

  async getCountryId(countryName) {
    try {
      const countryIds = await this.execute('res.country', 'search', [
        [['name', '=', countryName]]
      ]);
      return countryIds.length > 0 ? countryIds[0] : null;
    } catch (error) {
      console.error('❌ Error getting country ID:', error.message);
      return null;
    }
  }

  // === STOCK TRACKING HELPERS ===
  
  async getOrderStockLevels(saleOrderId) {
    try {
      console.log(`📊 Getting stock levels for sale order: ${saleOrderId}`);
      
      // Get order lines with product details
      const orderLines = await this.execute('sale.order.line', 'read', [
        await this.execute('sale.order.line', 'search', [['order_id', '=', saleOrderId]]),
        ['id', 'product_id', 'product_uom_qty', 'product_uom']
      ]);

      const stockLevels = [];
      
      for (const line of orderLines) {
        // Get product details
        const product = await this.execute('product.product', 'read', [
          [line.product_id[0]],
          ['id', 'name', 'default_code']
        ]).then(products => products[0]);

        // Get current stock quantity
        const stockQuant = await this.execute('stock.quant', 'search', [
          [['product_id', '=', line.product_id[0]], ['location_id.usage', '=', 'internal']]
        ]);

        let totalStock = 0;
        if (stockQuant.length > 0) {
          const quants = await this.execute('stock.quant', 'read', [
            stockQuant,
            ['quantity']
          ]);
          totalStock = quants.reduce((sum, quant) => sum + quant.quantity, 0);
        }

        stockLevels.push({
          product_id: product.id,
          product_name: product.name,
          sku: product.default_code,
          order_quantity: line.product_uom_qty,
          current_stock: totalStock,
          available_after_order: totalStock - line.product_uom_qty
        });
      }

      console.log(`📊 Stock levels retrieved for ${stockLevels.length} products`);
      return stockLevels;
    } catch (error) {
      console.error('❌ Error getting order stock levels:', error.message);
      throw error;
    }
  }

  calculateStockReduction(stockBefore, stockAfter) {
    try {
      const reductions = [];
      
      for (let i = 0; i < stockBefore.length; i++) {
        const before = stockBefore[i];
        const after = stockAfter[i];
        
        const reduction = {
          product_id: before.product_id,
          product_name: before.product_name,
          sku: before.sku,
          order_quantity: before.order_quantity,
          stock_before: before.current_stock,
          stock_after: after.current_stock,
          stock_reduced: before.current_stock - after.current_stock,
          available_after_order: after.available_after_order
        };
        
        reductions.push(reduction);
      }
      
      return reductions;
    } catch (error) {
      console.error('❌ Error calculating stock reduction:', error.message);
      throw error;
    }
  }

  async checkStockAvailability(sku, quantity) {
    try {
      console.log(`🔍 Checking stock availability for SKU: ${sku}, Quantity: ${quantity}`);
      
      // Get product
      const product = await this.checkProductSKU(sku);
      if (!product) {
        throw new Error(`Product not found: ${sku}`);
      }

      // Get current stock
      const stockQuant = await this.execute('stock.quant', 'search', [
        [['product_id', '=', product.id], ['location_id.usage', '=', 'internal']]
      ]);

      let totalStock = 0;
      if (stockQuant.length > 0) {
        const quants = await this.execute('stock.quant', 'read', [
          stockQuant,
          ['quantity']
        ]);
        totalStock = quants.reduce((sum, quant) => sum + quant.quantity, 0);
      }

      const available = totalStock >= quantity;
      
      console.log(`📊 Stock check for ${sku}: Available=${totalStock}, Required=${quantity}, OK=${available}`);
      
      return {
        product_id: product.id,
        product_name: product.name,
        sku: sku,
        current_stock: totalStock,
        required_quantity: quantity,
        available: available,
        shortage: available ? 0 : quantity - totalStock
      };
    } catch (error) {
      console.error('❌ Error checking stock availability:', error.message);
      throw error;
    }
  }

  // === HEALTH CHECK ===
  
  async healthCheck() {
    try {
      await this.authenticate();
      
      // Test basic operations
      const version = await this.execute('common', 'version', []);
      const dbList = await this.execute('db', 'list', []);
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        odoo_version: version,
        database_list: dbList.includes(this.db),
        authenticated: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

module.exports = new OdooIntegrationService();
