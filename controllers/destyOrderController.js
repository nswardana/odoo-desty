// controllers/destyOrderController.js
// Desty Order API controller for handling order operations

const axios = require('axios');
const { orderQueue } = require('../queue');
const { STORE_BRANCH_MAPPING, DEFAULT_BRANCH, DESTY_CONFIG, ORDER_CONFIG, VALIDATION_CONFIG } = require('../config');
const odooIntegrationService = require('../services/odooIntegrationService');

class DestyOrderController {
  constructor() {
    this.accessToken = process.env.DESTY_ACCESS_TOKEN;
    this.baseUrl = DESTY_CONFIG.BASE_URL;
    this.orderEndpoint = DESTY_CONFIG.ORDER_ENDPOINT;
  }

  // Get access token for Desty API calls
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

      // Get parameters from query string for GET requests or body for POST requests
      const params = req.method === 'GET' ? req.query : req.body;
      
      const { 
        platform = DESTY_CONFIG.DEFAULT_PLATFORM,
        startDate,
        endDate,
        status = DESTY_CONFIG.DEFAULT_STATUS,
        pageNumber = 1,
        pageSize = DESTY_CONFIG.DEFAULT_PAGE_SIZE
      } = params;

      // Build request payload according to Desty API spec
      const payload = {
        platform,
        startDate: startDate || this.getLastDayTimestamp(),
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

  // === ORDER PROCESSING METHODS (Similar to webhookDesty.js) ===

  // Validate order data before processing
  validateOrder(order) {
    const errors = [];
    
    // Check required fields
    for (const field of VALIDATION_CONFIG.REQUIRED_ORDER_FIELDS) {
      if (!order[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Validate address
    if (order.shipping_address && order.shipping_address.address) {
      if (order.shipping_address.address.length < VALIDATION_CONFIG.MIN_ADDRESS_LENGTH) {
        errors.push('Shipping address too short');
      }
    }
    
    // Validate items
    if (order.items && order.items.length > 0) {
      order.items.forEach((item, index) => {
        for (const field of VALIDATION_CONFIG.REQUIRED_ITEM_FIELDS) {
          if (!item[field]) {
            errors.push(`Item ${index + 1} missing required field: ${field}`);
          }
        }
      });
    }
    
    return errors;
  }

  // Standardize Desty order format for Odoo with enhanced shipping extraction
  standardizeOrder(rawOrder) {
    console.log(`🔍 === standardizeOrder called ===`);
    console.log(`🔍 rawOrder.orderSn:`, rawOrder.orderSn);
    console.log(`🔍 rawOrder keys:`, Object.keys(rawOrder));
    
    // Extract shipping detail from first item if available
    const rawShippingDetail = rawOrder.itemList?.[0]?.shippingDetail;
    
    console.log(`🔍 Raw shipping detail available:`, !!rawShippingDetail);
    console.log(`🔍 rawOrder.itemList length:`, rawOrder.itemList?.length || 0);
    
    if (rawShippingDetail) {
      console.log(`🔍 Shipping detail keys:`, Object.keys(rawShippingDetail));
      console.log(`🔍 Shipping city:`, rawShippingDetail.shippingCity);
      console.log(`🔍 Shipping postal code:`, rawShippingDetail.shippingPostCode);
      console.log(`🔍 Shipping address:`, rawShippingDetail.shippingAddress?.substring(0, 100));
    } else {
      console.log(`🔍 No shipping detail found in itemList[0]`);
      if (rawOrder.itemList && rawOrder.itemList.length > 0) {
        console.log(`🔍 First item keys:`, Object.keys(rawOrder.itemList[0]));
      }
    }
    
    const standardizedAddress = this.standardizeAddress(rawOrder.customerInfo, rawShippingDetail);
    console.log(`🔍 Standardized address:`, JSON.stringify(standardizedAddress, null, 2));
    
    const result = {
      order_sn: rawOrder.orderSn,
      buyer_username: rawOrder.customerInfo?.name || rawOrder.customer_name || 'Unknown Customer',
      buyer_email: rawOrder.customerInfo?.email || rawOrder.customer_email || '',
      buyer_phone: rawOrder.customerInfo?.phone || rawOrder.customer_phone || '',
      branch: this.getDefaultBranch(rawOrder.storeName),
      items: this.standardizeItems(rawOrder.itemList || rawOrder.items || []),
      shop_id: rawOrder.storeId,
      marketplace: 'desty',
      order_date: new Date(rawOrder.orderCreateTime).toISOString(),
      payment_status: rawOrder.hasPaid ? 'paid' : 'pending',
      shipping_status: rawOrder.shippedStatus || 'pending',
      total_amount: rawOrder.totalPrice || rawOrder.totalAmount || 0,
      shipping_address: standardizedAddress,
      notes: rawOrder.buyerNotes || rawOrder.notes || '',
      payment_method: rawOrder.paymentMethod || rawOrder.payment_method || '',
      shipping_method: rawOrder.shipping_method || '',
      tracking_number: (rawOrder.trackingNumberList || []).join(', ') || rawShippingDetail?.trackingNumber || '',
      store_name: rawOrder.storeName,
      platform_name: rawOrder.platformName,
      raw_data: rawOrder
    };
    
    console.log(`🔍 === standardizeOrder completed ===`);
    return result;
  }

  // Get default branch based on store name
  getDefaultBranch(storeName = '') {
    // Return mapped branch or default
    return STORE_BRANCH_MAPPING[storeName] || DEFAULT_BRANCH;
  }

  // Standardize order items
  standardizeItems(items) {
    return items?.map(item => ({
      name: item.itemName || item.product_name || item.title || item.name || `Product ${item.itemId || item.id || 'Unknown'}`,
      sku: item.itemExternalCode || item.itemSku || item.sku || item.product_sku || item.product_id || item.itemId || item.id || `SKU-${item.itemId || item.id || 'UNKNOWN'}`,
      qty: item.itemQuantity || item.quantity || item.qty || item.amount || 1,
      price: item.itemPrice || item.price || item.unit_price || item.amount || 0,
      weight: item.weight || 0,
      dimensions: item.dimensions || {},
      variant: item.variant || null
    })) || [];
  }

  // Standardize address format with enhanced shipping detail extraction
  standardizeAddress(address, rawShippingDetail = null) {
    if (!address && !rawShippingDetail) return null;
    
    // If we have raw shipping detail from itemList[0].shippingDetail, use it
    if (rawShippingDetail) {
      console.log(`🔍 Using raw shipping detail:`, JSON.stringify(rawShippingDetail, null, 2));
      
      return {
        name: rawShippingDetail.shippingFullName || address?.name || address?.recipient_name || 'Unknown',
        phone: rawShippingDetail.shippingPhone?.replace(/\*+/g, '') || address?.phone || address?.recipient_phone || '',
        email: address?.email || address?.recipient_email || '',
        address: rawShippingDetail.shippingAddress?.replace(/\*+/g, '') || address?.address || address?.street_address || '',
        city: rawShippingDetail.shippingCity || address?.city || '',
        province: rawShippingDetail.shippingProvince || address?.province || address?.state || '',
        postal_code: rawShippingDetail.shippingPostCode || address?.postal_code || address?.zip_code || '',
        country: rawShippingDetail.shippingCountry || address?.country || 'Indonesia',
        coordinates: address?.coordinates || null
      };
    }
    
    // Handle Desty customerInfo structure
    if (address && address.receiverAddress) {
      return {
        name: address.receiverName || address.name || address.recipient_name,
        phone: address.receiverPhone || address.phone || address.recipient_phone,
        email: address.email || address.recipient_email,
        address: address.receiverAddress?.fullAddress || address.receiverAddress?.address || address.address || address.street_address,
        city: address.receiverAddress?.city || address.city,
        province: address.receiverAddress?.province || address.receiverAddress?.state || address.province || address.state,
        postal_code: address.receiverAddress?.postalCode || address.receiverAddress?.zipCode || address.postal_code || address.zip_code,
        country: address.receiverAddress?.country || address.country || 'Indonesia',
        coordinates: address.coordinates || null
      };
    }
    
    // Handle case where only basic address info is available
    if (address && address.name && !address.address) {
      // Create a minimal address with available info
      return {
        name: address.name,
        phone: address.phone || '',
        email: address.email || '',
        address: `${address.city || ''}, ${address.province || ''}, ${address.country || 'Indonesia'}`,
        city: address.city || '',
        province: address.province || '',
        postal_code: address.postal_code || '',
        country: address.country || 'Indonesia',
        coordinates: address.coordinates || null
      };
    }
    
    // Fallback to standard address structure
    return {
      name: address?.name || address?.recipient_name || 'Unknown',
      phone: address?.phone || address?.recipient_phone || '',
      email: address?.email || address?.recipient_email || '',
      address: address?.address || address?.street_address || '',
      city: address?.city || '',
      province: address?.province || address?.state || '',
      postal_code: address?.postal_code || address?.zip_code || '',
      country: address?.country || 'Indonesia',
      coordinates: address?.coordinates || null
    };
  }

  // Calculate total order amount
  calculateTotal(items) {
    if (!items || items.length === 0) return 0;
    
    return items.reduce((total, item) => {
      const price = item.price || item.unit_price || item.amount || 0;
      const quantity = item.quantity || item.qty || item.amount || 1;
      return total + (price * quantity);
    }, 0);
  }

  // Inspect sale.order fields to understand available fields
  async inspectSaleOrderFields() {
    try {
      console.log('🔍 Inspecting sale.order fields...');
      
      // Get fields info for sale.order model
      const fields = await odooIntegrationService.execute('sale.order', 'fields_get', []);
      
      console.log('📋 Available sale.order fields:');
      Object.keys(fields).forEach(fieldName => {
        const field = fields[fieldName];
        console.log(`  - ${fieldName}: ${field.type} (${field.string || field.help || 'No description'})`);
      });
      
      return fields;
    } catch (error) {
      console.error('❌ Error inspecting sale.order fields:', error.message);
      return null;
    }
  }

  // Check for existing order in Odoo
  async checkExistingOrder(orderSn) {
    try {
      console.log(`🔍 Checking for existing order with SN: ${orderSn}`);
      
      // First, try to search by client_order_ref (external reference)
      try {
        const existingOrder = await odooIntegrationService.execute('sale.order', 'search', [[['client_order_ref', '=', orderSn]]]);
        if (existingOrder.length > 0) {
          console.log(`✅ Found existing order by client_order_ref: ${existingOrder[0]}`);
          return true;
        }
      } catch (searchError) {
        console.warn(`⚠️ Search by client_order_ref failed:`, searchError.message);
      }

      // Alternative: Try searching by name (order number)
      try {
        const existingOrderByName = await odooIntegrationService.execute('sale.order', 'search', [[['name', '=', orderSn]]]);
        if (existingOrderByName.length > 0) {
          console.log(`✅ Found existing order by name: ${existingOrderByName[0]}`);
          return true;
        }
      } catch (nameSearchError) {
        console.warn(`⚠️ Search by name failed:`, nameSearchError.message);
      }

      // Alternative: Try searching in notes or description
      try {
        const existingOrderByNotes = await odooIntegrationService.execute('sale.order', 'search', [[['note', 'like', orderSn]]]);
        if (existingOrderByNotes.length > 0) {
          console.log(`✅ Found existing order by notes: ${existingOrderByNotes[0]}`);
          return true;
        }
      } catch (notesSearchError) {
        console.warn(`⚠️ Search by notes failed:`, notesSearchError.message);
      }

      // If all searches failed, inspect available fields for debugging
      //console.log(`🔍 All search methods failed, inspecting sale.order fields...`);
      //await this.inspectSaleOrderFields();

      console.log(`ℹ️ No existing order found for SN: ${orderSn}`);
      return false;
    } catch (error) {
      console.warn('⚠️ Could not check for existing order:', error.message);
      return false;
    }
  }

  // Process order and create in Odoo
  async processOrderInOdoo(orderData) {
    try {
      console.log(`🔄 Processing Desty order: ${orderData.orderSn}`);
      
      // First, fetch complete order details from Desty API
      const completeOrder = await this.getOrderDetails(orderData.orderId);
      
      // Standardize the complete order
      const order = this.standardizeOrder(completeOrder);
      
      console.log(`📋 Standardized order: ${order.order_sn}`);
      console.log(`📋 Order data keys:`, Object.keys(order));
      console.log(`📋 Raw order data:`, JSON.stringify(completeOrder, null, 2));

      // Validate order before processing
      const validationErrors = this.validateOrder(order);
      if (validationErrors.length > 0) {
        console.log(`⚠️ Order validation failed for ${order.order_sn}:`, validationErrors);
        return { success: false, message: 'Order validation failed', errors: validationErrors, order_sn: order.order_sn };
      }
      
      console.log(`📋 validationErrors:`, "Sucess");

      // Check for duplicate orders
      const existingOrder = await this.checkExistingOrder(order.order_sn);
      if (existingOrder) {
        console.log(`⚠️ Duplicate order detected: ${order.order_sn}`);
        return { success: false, message: 'Order already exists', order_sn: order.order_sn };
      }

      console.log(`📋 existingOrder:`, "Sucess");

      
      // Add to queue for processing
      console.log(`📋 Adding order to queue: ${order.order_sn}`);
      console.log(`📋 Queue object:`, typeof orderQueue);
      
      if (!orderQueue || typeof orderQueue.add !== 'function') {
        throw new Error('Order queue is not properly initialized');
      }
      
      
      await orderQueue.add('order', {
        source: 'desty',
        order: order,
        api_call: true, // Flag to indicate this came from API call, not webhook
        timestamp: new Date().toISOString(),
        priority: this.calculateOrderPriority(order)
      });
    
      console.log(`✅ Desty order queued for Odoo: ${order.order_sn}`);
      return { success: true, message: 'Order queued for processing', order_sn: order.order_sn };
      
    } catch (error) {
      console.error(`❌ Error processing Desty order ${orderData.orderSn}:`, error.message);
      return { success: false, message: error.message, order_sn: orderData.orderSn };
    }
  }

  // Fetch complete order details from Desty API
  async getOrderDetails(orderId) {
    try {
      console.log(`🔍 Fetching complete details for order: ${orderId}`);
      
      const response = await axios.get(`${this.baseUrl}${DESTY_CONFIG.ORDER_DETAIL_ENDPOINT}`, {
        params: { orderId },
        headers: {
          'Authorization': `Bearer ${await this.getAccessToken()}`
        }
      });

      const orderDetails = response.data;
      console.log(`✅ Retrieved complete order details for: ${orderDetails.data?.orderSn || orderId}`);
      console.log(`📋 Response structure:`, JSON.stringify(orderDetails, null, 2));
      
      return orderDetails.data || orderDetails;
      
    } catch (error) {
      console.error(`❌ Error fetching order details for ${orderId}:`, error.message);
      throw new Error(`Failed to fetch order details: ${error.message}`);
    }
  }

  // Calculate order priority
  calculateOrderPriority(order) {
    let priority = ORDER_CONFIG.DEFAULT_PRIORITY;
    
    if (order.payment_status === 'paid') {
      priority = ORDER_CONFIG.PAID_ORDER_PRIORITY;
    } else if (order.payment_status === 'pending') {
      priority = ORDER_CONFIG.PENDING_ORDER_PRIORITY;
    }
    
    // Higher priority for large orders
    if (order.total_amount > ORDER_CONFIG.HIGH_VALUE_THRESHOLD) {
      priority -= ORDER_CONFIG.HIGH_VALUE_PRIORITY;
    }
    
    return Math.max(1, Math.min(10, priority));
  }

  // POST /desty/orders/process-to-odoo
  // Process fetched orders to Odoo sales orders
  async processOrdersToOdoo(req, res) {
    try {
      console.log('🔄 Processing orders to Odoo...');

      const { orderIds, processAll = false, status = DESTY_CONFIG.DEFAULT_STATUS, platform = DESTY_CONFIG.DEFAULT_PLATFORM } = req.body;
      const queryParams = req.query;

      // First, get the orders from Desty with query parameters
      const params = {
        platform: queryParams.platform || platform,
        status: queryParams.status || status,
        startDate: queryParams.startDate,
        endDate: queryParams.endDate,
        pageNumber: queryParams.pageNumber || 1,
        pageSize: queryParams.pageSize || DESTY_CONFIG.DEFAULT_PAGE_SIZE
      };

      // Build request payload according to Desty API spec (same as getOrders)
      const payload = {
        platform: params.platform,
        startDate: params.startDate || this.getLastDayTimestamp(),
        endDate: params.endDate || Date.now(),
        status: params.status,
        pageNumber: params.pageNumber,
        pageSize: params.pageSize
      };

      console.log('📋 Order request payload for processing:', payload);

      // Make API request to /api/order/page (same as getOrders)
      const response = await axios.post(`${this.baseUrl}${this.orderEndpoint}`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAccessToken()}`
        }
      });

      const ordersResponse = response.data;
      console.log('✅ Retrieved orders from Desty API');
      
      let ordersToProcess = [];
      
      if (processAll) {
        // Process all fetched orders - extract from nested data structure
        ordersToProcess = ordersResponse.data?.results || [];
        
        // Try alternative extraction if no results found
        if (ordersToProcess.length === 0 && ordersResponse.data?.data) {
          ordersToProcess = ordersResponse.data.data.results || [];
        }
      } else if (orderIds && Array.isArray(orderIds)) {
        // Process specific orders by ID - extract from nested data structure
        const allOrders = ordersResponse.data?.results || [];
        ordersToProcess = allOrders.filter(order => 
          orderIds.includes(order.orderId)
        );
      } else {
        return res.status(400).json({ 
          error: 'Either provide orderIds array or set processAll to true' 
        });
      }

      console.log(`🔍 Final orders to process: ${ordersToProcess.length}`);

      if (ordersToProcess.length === 0) {
        return res.json({
          status: 'success',
          message: 'No orders to process',
          processed: [],
          summary: {
            total: 0,
            successful: 0,
            failed: 0
          }
        });
      }

      console.log(`📋 Found ${ordersToProcess.length} orders to process`);

      const results = [];
      
      // Process each order
      for (const orderData of ordersToProcess) {
        console.log(`🔄 Processing order: ${orderData.orderSn}`);
        // Check for duplicate order reference first
        console.log(`🔄 checkExistingOrder: ${orderData.orderSn}`);

        const existingOrder = await this.checkExistingOrder(orderData.orderSn);
        if (existingOrder) {
          console.log(`⚠️ Order ${orderData.orderSn} already exists in Odoo, skipping...`);
          results.push({
            orderSn: orderData.orderSn,
            status: 'skipped',
            message: 'Order already exists in Odoo'
          });
          continue; // Skip to next order
        }
        
        const result = await this.processOrderInOdoo(orderData);
        results.push(result);
      }

      res.json({
        status: 'success',
        marketplace: 'desty',
        message: `Processed ${results.length} orders`,
        processed: results,
        summary: {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        }
      });

    } catch (error) {
      console.error('❌ Error processing orders to Odoo:', error.message);
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
  
  getLastDayTimestamp() {
  const now = new Date();
  const yesterdayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
    0, 0, 0, 0
  );
  return Math.floor(yesterdayStart.getTime() / 1000);
  }

}

module.exports = new DestyOrderController();
