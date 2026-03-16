// services/destyOdooService.js
// Desty-specific Odoo integration service

const odooIntegrationService = require('./odooIntegrationService');
const productMappingService = require('./productMappingService');

class DestyOdooService {
  constructor() {
    this.odooService = odooIntegrationService;
    this.productMappingService = productMappingService;
  }

  // Create customer from Desty order
  async createDestyCustomer(order) {
    try {
      console.log(`👤 Creating customer for Desty order: ${order.buyer_username}`);

      const customerData = {
        name: order.buyer_username,
        email: order.buyer_email,
        phone: order.buyer_phone,
        street: order.shipping_address?.address,
        city: order.shipping_address?.city,
        zip: order.shipping_address?.postal_code,
        country_id: await this.getCountryId(order.shipping_address?.country),
        is_company: false,
        customer_rank: 1,
        company_type: 'person'
      };

      // Check if customer already exists
      const existingCustomer = await this.findCustomerByEmailOrPhone(order.buyer_email, order.buyer_phone);
      if (existingCustomer) {
        console.log(`✅ Found existing customer: ${existingCustomer.id}`);
        return existingCustomer;
      }

      const customer = await this.odooService.createPartner(customerData);
      console.log(`✅ Created new customer: ${customer.id}`);
      
      return customer;
    } catch (error) {
      console.error('❌ Error creating Desty customer:', error.message);
      throw error;
    }
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

  // Get country ID by name
  async getCountryId(countryName) {
    try {
      if (!countryName) return 100; // Default to Indonesia
      
      const countries = await this.odooService.execute('res.country', 'search_read', [
        ['name', 'ilike', countryName]
      ], ['id', 'name']);
      
      return countries.length > 0 ? countries[0].id : 100; // Default to Indonesia
    } catch (error) {
      console.warn('⚠️ Could not get country ID:', error.message);
      return 100; // Default to Indonesia
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
        state: 'draft',
        date_order: order.order_date || new Date().toISOString().split('T')[0],
        validity_date: this.calculateValidityDate(order.order_date),
        pricelist_id: 1, // Default pricelist
        fiscal_position_id: await this.getFiscalPosition(order.shipping_address),
        warehouse_id: await this.getWarehouseId(order.branch),
        team_id: await this.getSalesTeamId(order.shop_id),
        note: order.notes,
        origin: `Desty: ${order.order_sn}`,
        client_order_ref: order.order_sn,
        order_lines: [], // Empty initially
        amount_total: order.total_amount,
        amount_tax: this.calculateTax(validatedItems),
        amount_untaxed: this.calculateSubtotal(validatedItems),
        payment_term_id: await this.getPaymentTermId(order.payment_method)
      };

      console.log('📋 Order data being sent to Odoo:', JSON.stringify(orderData, null, 2));

      // Create order first
      const odooOrder = await this.odooService.createSaleOrder(orderData);
      
      console.log(`✅ Created empty Odoo order: ${odooOrder.id}`);
      
      // Then add order lines separately
      for (const item of validatedItems) {
        try {
          const product = await this.odooService.checkProductSKU(item.sku);
          
          if (!product) {
            throw new Error(`Product not found in Odoo: ${item.sku}`);
          }

          const orderLine = {
            order_id: odooOrder.id,
            product_id: product.id,
            product_uom_qty: item.qty,
            price_unit: item.price,
            name: item.name,
            customer_lead: 0
          };

          // Create order line separately
          await this.odooService.execute('sale.order.line', 'create', [orderLine]);
          console.log(`✅ Added order line for product: ${item.sku}`);
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
    return items.reduce((total, item) => {
      return total + (item.price * item.qty);
    }, 0);
  }

  // Calculate validity date (7 days from order date)
  calculateValidityDate(orderDate) {
    const date = new Date(orderDate || Date.now());
    date.setDate(date.getDate() + 7);
    return date.toISOString().split('T')[0];
  }

  // Get fiscal position based on address
  async getFiscalPosition(address) {
    try {
      if (!address || !address.country) return 1; // Default fiscal position
      
      const positions = await this.odooService.execute('account.fiscal.position', 'search_read', [
        ['name', 'ilike', address.country]
      ], ['id', 'name']);
      
      return positions.length > 0 ? positions[0].id : 1;
    } catch (error) {
      console.warn('⚠️ Could not get fiscal position:', error.message);
      return 1;
    }
  }

  // Get warehouse ID based on branch
  async getWarehouseId(branch) {
    try {
      if (!branch) return 1; // Default warehouse
      
      const warehouses = await this.odooService.execute('stock.warehouse', 'search_read', [
        ['name', 'ilike', branch]
      ], ['id', 'name']);
      
      return warehouses.length > 0 ? warehouses[0].id : 1;
    } catch (error) {
      console.warn('⚠️ Could not get warehouse ID:', error.message);
      return 1;
    }
  }

  // Get sales team ID based on shop
  async getSalesTeamId(shopId) {
    try {
      if (!shopId) return 1; // Default sales team
      
      const teams = await this.odooService.execute('crm.team', 'search_read', [
        ['name', 'ilike', shopId]
      ], ['id', 'name']);
      
      return teams.length > 0 ? teams[0].id : 1;
    } catch (error) {
      console.warn('⚠️ Could not get sales team ID:', error.message);
      return 1;
    }
  }

  // Get payment term ID based on payment method
  async getPaymentTermId(paymentMethod) {
    try {
      if (!paymentMethod) return 1; // Default payment term
      
      const terms = await this.odooService.execute('account.payment.term', 'search_read', [
        [['name', 'ilike', paymentMethod]]
      ], ['id', 'name']);
      
      return terms.length > 0 ? terms[0].id : 1;
    } catch (error) {
      console.warn('⚠️ Could not get payment term ID:', error.message);
      return 1;
    }
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

  // Validate products and stock
  async validateDestyProducts(items) {
    const validatedItems = [];
    const errors = [];
    const warnings = [];

    for (const item of items) {
      try {
        // Check product exists in Odoo
        const product = await this.odooService.checkProductSKU(item.sku);
        
        if (!product) {
          errors.push(`Product not found in Odoo: ${item.sku}`);
          continue;
        }

        // Check stock availability
        const stock = await this.checkProductStock(item.sku);
        if (stock < item.qty) {
          warnings.push(`Insufficient stock for ${item.sku} (Available: ${stock}, Required: ${item.qty})`);
        }

        // Check price variance
        const priceDiff = Math.abs(product.list_price - item.price) / product.list_price * 100;
        if (priceDiff > 10) {
          warnings.push(`Price variance detected for ${item.sku} (Odoo: ${product.list_price}, Desty: ${item.price})`);
        }

        validatedItems.push({
          ...item,
          odoo_product_id: product.id,
          available_stock: stock,
          odoo_price: product.list_price
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

  // Check product stock
  async checkProductStock(sku) {
    try {
      const product = await this.odooService.getProductBySKU(sku);
      if (!product) return 0;

      // Get stock quantity
      const stockMoves = await this.odooService.execute('stock.quant', 'search_read', [
        ['product_id', '=', product.id],
        ['location_id.usage', '=', 'internal']
      ], ['quantity']);

      const totalStock = stockMoves.reduce((total, move) => total + move.quantity, 0);
      return Math.floor(totalStock);
    } catch (error) {
      console.warn('⚠️ Could not check stock for', sku, error.message);
      return 0;
    }
  }
}

module.exports = new DestyOdooService();
