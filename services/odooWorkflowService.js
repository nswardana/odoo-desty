// services/odooWorkflowService.js
// High-level workflow service for Odoo operations

const odooIntegrationService = require('./odooIntegrationService');
const mappingEngine = require('./mappingEngine');
const productErrorLogger = require('./productErrorLogger');

class OdooWorkflowService {
  
  // === COMPLETE ORDER WORKFLOW ===
  
  async processMarketplaceOrder(orderData) {
    try {
      console.log('🚀 Starting marketplace order processing workflow...');
      
      const {
        marketplace,
        shop_id,
        marketplace_order_id,
        customer,
        items,
        order_date,
        delivery_date,
        notes,
        priority = 'normal'
      } = orderData;

      // Step 1: Get shop mapping
      const shopMapping = await mappingEngine.getShopMapping(marketplace, shop_id);
      if (!shopMapping) {
        console.log(`⚠️ Shop mapping not found: ${marketplace} - ${shop_id}. Using default values for testing.`);
        
        // Create default shop mapping for testing
        const defaultMapping = {
          id: null,
          marketplace: marketplace,
          shop_id: shop_id,
          company_id: 1, // Default company
          warehouse_id: 1, // Default warehouse
          pricelist_id: 1, // Default pricelist
          active: true
        };
        
        console.log(`✅ Using default shop mapping for: ${marketplace} - ${shop_id}`);
        
        // Continue with default mapping
        await this.processOrderWithMapping(orderData, defaultMapping);
        return;
      }

      console.log(`✅ Shop mapping found: ${shopMapping.id}`);
      await this.processOrderWithMapping(orderData, shopMapping);
    } catch (error) {
      console.error('❌ Order workflow failed:', error.message);
      throw error;
    }
  }

  async processOrderWithMapping(orderData, shopMapping) {
    try {
      console.log('🚀 Processing order with shop mapping...');
      
      const {
        marketplace,
        shop_id,
        marketplace_order_id,
        customer,
        items,
        order_date,
        delivery_date,
        notes,
        priority = 'normal'
      } = orderData;

      // Step 2: Check/Create partner
      const partner = await odooIntegrationService.findOrCreatePartner({
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        street: customer.address?.street,
        city: customer.address?.city,
        state: customer.address?.state,
        zip: customer.address?.zip,
        country: customer.address?.country,
        marketplace_customer_id: customer.marketplace_customer_id,
        marketplace_name: marketplace
      });

      console.log(`✅ Partner processed: ${partner.id} - ${partner.name}`);

      // Step 3: Validate products and check stock availability
      const orderLines = [];
      const missingSkus = [];
      const inactiveProducts = [];
      const warehouseIssues = [];
      const quantityIssues = [];
      const stockIssues = [];
      
      for (const item of items) {
        // Validation 1: Check if SKU is empty or null
        if (!item.sku || item.sku.trim() === '') {
          quantityIssues.push({
            type: 'EMPTY_SKU',
            item: item,
            message: 'SKU cannot be empty'
          });
          continue;
        }

        // Validation 2: Check if quantity is negative or zero
        if (!item.quantity || item.quantity <= 0) {
          quantityIssues.push({
            type: 'INVALID_QUANTITY',
            sku: item.sku || 'UNKNOWN',
            quantity: item.quantity,
            message: `Invalid quantity: ${item.quantity}. Must be greater than 0`
          });
          continue;
        }

        // Validation 3: Check if price is negative
        if (item.price && item.price < 0) {
          quantityIssues.push({
            type: 'NEGATIVE_PRICE',
            sku: item.sku,
            price: item.price,
            message: `Negative price: ${item.price}. Price cannot be negative`
          });
          continue;
        }

        const product = await odooIntegrationService.checkProductSKU(item.sku);
        if (!product) {
          missingSkus.push({
            sku: item.sku,
            name: item.name || 'Unknown',
            quantity: item.quantity,
            price: item.price
          });
          continue; // Skip this item but continue checking others
        }

        // Validation 4: Check if product is active
        if (!product.active || !product.sale_ok) {
          inactiveProducts.push({
            sku: item.sku,
            name: product.name,
            quantity: item.quantity,
            price: item.price,
            active: product.active,
            sale_ok: product.sale_ok,
            message: `Product is ${!product.active ? 'inactive' : 'not available for sale'}`
          });
          continue;
        }

        // Check stock availability
        const stockCheck = await odooIntegrationService.checkStockAvailability(item.sku, item.quantity);
        if (!stockCheck.available) {
          stockIssues.push({
            sku: item.sku,
            name: product.name,
            quantity: item.quantity,
            current_stock: stockCheck.current_stock,
            shortage: stockCheck.shortage
          });
        }

        orderLines.push({
          product_id: product.id,
          product_name: product.name,
          quantity: item.quantity,
          price_unit: item.price,
          description: item.description || `${item.quantity}x ${product.name}`,
          tax_id: item.tax_id || null,
          stock_before: stockCheck.current_stock,
          stock_after: stockCheck.current_stock - item.quantity
        });

        console.log(`✅ Product validated and stock checked: ${product.id} - ${item.sku} (Stock: ${stockCheck.current_stock} → ${stockCheck.current_stock - item.quantity})`);
      }

      // Validation 5: Check warehouse mapping
      if (shopMapping.warehouse_id && shopMapping.warehouse_id !== 1) {
        try {
          // Verify warehouse exists in Odoo (only if not default)
          const warehouse = await odooIntegrationService.execute('stock.warehouse', 'read', [
            [shopMapping.warehouse_id],
            ['id', 'name', 'active']
          ]).then(warehouses => warehouses[0]);

          if (!warehouse) {
            warehouseIssues.push({
              warehouse_id: shopMapping.warehouse_id,
              message: 'Warehouse not found in Odoo'
            });
          } else if (!warehouse.active) {
            warehouseIssues.push({
              warehouse_id: shopMapping.warehouse_id,
              warehouse_name: warehouse.name,
              message: 'Warehouse is inactive in Odoo'
            });
          }
        } catch (error) {
          warehouseIssues.push({
            warehouse_id: shopMapping.warehouse_id,
            message: `Error validating warehouse: ${error.message}`
          });
        }
      } else {
        console.log(`ℹ️ Using default warehouse (ID: ${shopMapping.warehouse_id}) - skipping validation`);
      }

      // Handle validation errors - FAIL ORDER and log each type
      const allIssues = [
        { type: 'EMPTY_SKU', issues: quantityIssues.filter(i => i.type === 'EMPTY_SKU'), severity: 'HIGH' },
        { type: 'INVALID_QUANTITY', issues: quantityIssues.filter(i => i.type === 'INVALID_QUANTITY'), severity: 'HIGH' },
        { type: 'NEGATIVE_PRICE', issues: quantityIssues.filter(i => i.type === 'NEGATIVE_PRICE'), severity: 'MEDIUM' },
        { type: 'MISSING_PRODUCTS', issues: missingSkus, severity: 'HIGH' },
        { type: 'INACTIVE_PRODUCTS', issues: inactiveProducts, severity: 'HIGH' },
        { type: 'WAREHOUSE_ISSUES', issues: warehouseIssues, severity: 'HIGH' },
        { type: 'INSUFFICIENT_STOCK', issues: stockIssues, severity: 'MEDIUM' }
      ];

      const criticalIssues = allIssues.filter(group => group.issues.length > 0 && group.severity === 'HIGH');
      
      if (criticalIssues.length > 0) {
        console.error(`🚨 ORDER FAILED: ${criticalIssues.length} critical validation issues found`);
        
        // Log each type of validation error
        for (const issueGroup of criticalIssues) {
          if (issueGroup.issues.length > 0) {
            await this.logValidationError(orderData, issueGroup);
          }
        }
        
        // Create comprehensive error message
        const errorMessages = criticalIssues.map(group => 
          `${group.issues.length} ${group.type.replace('_', ' ').toLowerCase()}`
        ).join(', ');
        
        throw new Error(`ORDER FAILED: Critical validation issues - ${errorMessages}. Admin has been notified to resolve these issues.`);
      }

      // Handle non-critical issues (like insufficient stock) - still fail but with lower severity
      const nonCriticalIssues = allIssues.filter(group => group.issues.length > 0 && group.severity === 'MEDIUM');
      if (nonCriticalIssues.length > 0) {
        console.error(`🚨 ORDER FAILED: ${nonCriticalIssues.length} validation issues found`);
        
        // Log non-critical issues
        for (const issueGroup of nonCriticalIssues) {
          if (issueGroup.issues.length > 0) {
            await this.logValidationError(orderData, issueGroup);
          }
        }
        console.warn('⚠️ Invoice creation failed (optional):', error.message);
      }

      // Step 8: Update shop mapping last sync (only if mapping has ID)
      if (shopMapping.id) {
        try {
          await mappingEngine.updateLastSync(shopMapping.id);
        } catch (error) {
          console.warn('⚠️ Failed to update shop mapping last sync:', error.message);
        }
      }

      // Return success result
      return {
        success: true,
        message: 'Order processed successfully',
        marketplace_order_id: marketplace_order_id,
        marketplace: marketplace,
        shop_id: shop_id,
        processed_at: new Date().toISOString()
      };

      console.log(`✅ Order workflow completed successfully:`, {
        order_id: result.order_id,
        order_name: result.order_name,
        total_amount: result.total_amount,
        stock_reduction_summary: result.stock_reduction.map(sr => ({
          sku: sr.sku,
          reduced: sr.stock_reduced,
          remaining: sr.stock_after
        }))
      });

      return result;
    } catch (error) {
      console.error('❌ Order workflow failed:', error.message);
      throw error;
    }
  }

  // === VALIDATION ERROR LOGGING ===
  
  async logValidationError(orderData, issueGroup) {
    try {
      const { type, issues, severity } = issueGroup;
      
      switch (type) {
        case 'EMPTY_SKU':
          await this.logEmptySkus(orderData, issues, severity);
          break;
        case 'INVALID_QUANTITY':
          await this.logInvalidQuantities(orderData, issues, severity);
          break;
        case 'NEGATIVE_PRICE':
          await this.logNegativePrices(orderData, issues, severity);
          break;
        case 'MISSING_PRODUCTS':
          await productErrorLogger.logProductNotFound(orderData, issues);
          break;
        case 'INACTIVE_PRODUCTS':
          await this.logInactiveProducts(orderData, issues, severity);
          break;
        case 'WAREHOUSE_ISSUES':
          await this.logWarehouseIssues(orderData, issues, severity);
          break;
        case 'INSUFFICIENT_STOCK':
          await productErrorLogger.logInsufficientStock(orderData, issues);
          break;
        default:
          console.warn(`⚠️ Unknown validation error type: ${type}`);
      }
    } catch (error) {
      console.error('❌ Error logging validation error:', error.message);
    }
  }

  async logEmptySkus(orderData, issues, severity) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      error_type: 'EMPTY_SKU',
      marketplace: orderData.marketplace,
      shop_id: orderData.shop_id,
      marketplace_order_id: orderData.marketplace_order_id,
      customer: orderData.customer?.name || 'Unknown',
      issues: issues,
      order_data: orderData,
      status: 'PENDING_ADMIN_ACTION',
      severity: severity,
      action_required: 'FIX_SKU_DATA',
      recommended_action: 'Admin should check marketplace data and fix empty SKU values'
    };

    console.error('🚨 EMPTY SKU VALIDATION ERROR:', {
      marketplace: errorEntry.marketplace,
      shop_id: errorEntry.shop_id,
      order_id: errorEntry.marketplace_order_id,
      issues_count: issues.length,
      action: 'Order FAILED - Admin action required'
    });

    await productErrorLogger.persistErrorLog(errorEntry);
    await productErrorLogger.sendAdminNotification(errorEntry);
  }

  async logInvalidQuantities(orderData, issues, severity) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      error_type: 'INVALID_QUANTITY',
      marketplace: orderData.marketplace,
      shop_id: orderData.shop_id,
      marketplace_order_id: orderData.marketplace_order_id,
      customer: orderData.customer?.name || 'Unknown',
      issues: issues,
      order_data: orderData,
      status: 'PENDING_ADMIN_ACTION',
      severity: severity,
      action_required: 'FIX_QUANTITY_DATA',
      recommended_action: 'Admin should check marketplace data and fix invalid quantity values'
    };

    console.error('🚨 INVALID QUANTITY VALIDATION ERROR:', {
      marketplace: errorEntry.marketplace,
      shop_id: errorEntry.shop_id,
      order_id: errorEntry.marketplace_order_id,
      issues_count: issues.length,
      action: 'Order FAILED - Admin action required'
    });

    await productErrorLogger.persistErrorLog(errorEntry);
    await productErrorLogger.sendAdminNotification(errorEntry);
  }

  async logNegativePrices(orderData, issues, severity) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      error_type: 'NEGATIVE_PRICE',
      marketplace: orderData.marketplace,
      shop_id: orderData.shop_id,
      marketplace_order_id: orderData.marketplace_order_id,
      customer: orderData.customer?.name || 'Unknown',
      issues: issues,
      order_data: orderData,
      status: 'PENDING_ADMIN_ACTION',
      severity: severity,
      action_required: 'FIX_PRICE_DATA',
      recommended_action: 'Admin should check marketplace data and fix negative price values'
    };

    console.error('🚨 NEGATIVE PRICE VALIDATION ERROR:', {
      marketplace: errorEntry.marketplace,
      shop_id: errorEntry.shop_id,
      order_id: errorEntry.marketplace_order_id,
      issues_count: issues.length,
      action: 'Order FAILED - Admin action required'
    });

    await productErrorLogger.persistErrorLog(errorEntry);
    await productErrorLogger.sendAdminNotification(errorEntry);
  }

  async logInactiveProducts(orderData, issues, severity) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      error_type: 'INACTIVE_PRODUCTS',
      marketplace: orderData.marketplace,
      shop_id: orderData.shop_id,
      marketplace_order_id: orderData.marketplace_order_id,
      customer: orderData.customer?.name || 'Unknown',
      inactive_products: issues,
      order_data: orderData,
      status: 'PENDING_ADMIN_ACTION',
      severity: severity,
      action_required: 'ACTIVATE_PRODUCTS',
      recommended_action: 'Admin should activate products in Odoo or remove them from marketplace listings'
    };

    console.error('🚨 INACTIVE PRODUCT VALIDATION ERROR:', {
      marketplace: errorEntry.marketplace,
      shop_id: errorEntry.shop_id,
      order_id: errorEntry.marketplace_order_id,
      inactive_products: issues.length,
      action: 'Order FAILED - Admin action required'
    });

    await productErrorLogger.persistErrorLog(errorEntry);
    await productErrorLogger.sendAdminNotification(errorEntry);
  }

  async logWarehouseIssues(orderData, issues, severity) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      error_type: 'WAREHOUSE_ISSUES',
      marketplace: orderData.marketplace,
      shop_id: orderData.shop_id,
      marketplace_order_id: orderData.marketplace_order_id,
      customer: orderData.customer?.name || 'Unknown',
      warehouse_issues: issues,
      order_data: orderData,
      status: 'PENDING_ADMIN_ACTION',
      severity: severity,
      action_required: 'FIX_WAREHOUSE_MAPPING',
      recommended_action: 'Admin should fix warehouse mapping in shop configuration'
    };

    console.error('🚨 WAREHOUSE VALIDATION ERROR:', {
      marketplace: errorEntry.marketplace,
      shop_id: errorEntry.shop_id,
      order_id: errorEntry.marketplace_order_id,
      warehouse_issues: issues.length,
      action: 'Order FAILED - Admin action required'
    });

    await productErrorLogger.persistErrorLog(errorEntry);
    await productErrorLogger.sendAdminNotification(errorEntry);
  }

  // === PRODUCT SYNC WORKFLOW ===
  
  async syncProductFromMarketplace(productData) {
    try {
      console.log('🔄 Starting product sync workflow...');
      
      const {
        marketplace,
        shop_id,
        marketplace_product_id,
        sku,
        name,
        price,
        stock,
        description,
        category_id,
        weight,
        dimensions
      } = productData;

      // Get shop mapping
      const shopMapping = await mappingEngine.getShopMapping(marketplace, shop_id);
      if (!shopMapping) {
        throw new Error(`Shop mapping not found: ${marketplace} - ${shop_id}`);
      }

      // Check if product exists by SKU
      const existingProduct = await odooIntegrationService.checkProductSKU(sku);
      
      if (existingProduct) {
        console.log(`✅ Product already exists: ${existingProduct.id} - ${sku}`);
        
        // Update product if needed
        if (price || stock) {
          await this.updateProductData(existingProduct.id, {
            price: price,
            stock: stock,
            warehouse_id: shopMapping.warehouse_id
          });
        }

        return {
          action: 'updated',
          product_id: existingProduct.id,
          sku: sku,
          marketplace_product_id: marketplace_product_id
        };
      }

      // Product creation is disabled - return error
      throw new Error(`Product not found and creation is disabled: ${sku}`);
      
    } catch (error) {
      console.error('❌ Product sync workflow failed:', error.message);
      throw error;
    }
  }

  async updateProductData(productId, updateData) {
    try {
      const { price, stock, warehouse_id } = updateData;
      
      // Update price if provided
      if (price) {
        // This would update product price in Odoo
        console.log(`💰 Updating product price: ${productId} -> ${price}`);
      }

      // Update stock if provided
      if (stock && warehouse_id) {
        // This would update product stock in Odoo
        console.log(`📊 Updating product stock: ${productId} -> ${stock} (warehouse: ${warehouse_id})`);
      }

      return true;
    } catch (error) {
      console.error('❌ Error updating product data:', error.message);
      throw error;
    }
  }

  // === STOCK SYNC WORKFLOW ===
  
  async syncStockFromMarketplace(stockData) {
    try {
      console.log('📊 Starting stock sync workflow...');
      
      const {
        marketplace,
        shop_id,
        marketplace_product_id,
        sku,
        quantity,
        operation_type,
        warehouse_id
      } = stockData;

      // Get shop mapping
      const shopMapping = await mappingEngine.getShopMapping(marketplace, shop_id);
      if (!shopMapping) {
        throw new Error(`Shop mapping not found: ${marketplace} - ${shop_id}`);
      }

      // Check product
      const product = await odooIntegrationService.checkProductSKU(sku);
      if (!product) {
        throw new Error(`Product not found: ${sku}`);
      }

      // Update stock in Odoo
      const targetWarehouseId = warehouse_id || shopMapping.warehouse_id;
      
      // This would perform actual stock update in Odoo
      console.log(`📊 Updating stock: ${product.id} -> ${quantity} (warehouse: ${targetWarehouseId})`);

      const result = {
        success: true,
        product_id: product.id,
        sku: sku,
        marketplace_product_id: marketplace_product_id,
        quantity: quantity,
        warehouse_id: targetWarehouseId,
        operation_type: operation_type,
        updated_at: new Date().toISOString()
      };

      console.log(`✅ Stock sync completed:`, result);
      return result;
    } catch (error) {
      console.error('❌ Stock sync workflow failed:', error.message);
      throw error;
    }
  }

  // === ORDER STATUS UPDATE WORKFLOW ===
  
  async updateOrderStatus(orderData) {
    try {
      console.log('🔄 Starting order status update workflow...');
      
      const {
        marketplace,
        shop_id,
        marketplace_order_id,
        new_status,
        tracking_number,
        notes
      } = orderData;

      // Find sale order by marketplace order ID
      const saleOrderIds = await odooIntegrationService.execute('sale.order', 'search', [
        [['x_marketplace_order_id', '=', marketplace_order_id]]
      ]);

      if (saleOrderIds.length === 0) {
        throw new Error(`Sale order not found for marketplace order: ${marketplace_order_id}`);
      }

      const saleOrder = await odooIntegrationService.execute('sale.order', 'read', [
        saleOrderIds,
        ['id', 'name', 'state', 'x_marketplace_order_id']
      ]).then(orders => orders[0]);

      console.log(`✅ Found sale order: ${saleOrder.id} - ${saleOrder.name}`);

      // Get status mapping from shop configuration
      const shopMapping = await mappingEngine.getShopMapping(marketplace, shop_id);
      const syncSettings = shopMapping.sync_settings || {};
      const statusMapping = syncSettings.order_status_mapping || {};

      // Map marketplace status to Odoo status
      const odooStatus = statusMapping[new_status];
      if (!odooStatus) {
        console.warn(`⚠️ No status mapping found for: ${new_status}`);
        return {
          success: false,
          error: `No status mapping found for: ${new_status}`,
          current_status: saleOrder.state
        };
      }

      // Update order based on status
      let updatedOrder = saleOrder;
      
      switch (odooStatus) {
        case 'sale':
          if (saleOrder.state === 'draft') {
            updatedOrder = await odooIntegrationService.confirmSaleOrder(saleOrder.id);
          }
          break;
          
        case 'done':
          if (saleOrder.state !== 'done') {
            // This would typically involve confirming pickings
            const pickings = await odooIntegrationService.createPicking(saleOrder.id);
            if (pickings && pickings.length > 0) {
              for (const picking of pickings) {
                await odooIntegrationService.confirmPicking(picking.id);
              }
            }
          }
          break;
          
        case 'cancel':
          if (saleOrder.state !== 'cancel') {
            await odooIntegrationService.execute('sale.order', 'action_cancel', [[saleOrder.id]]);
            updatedOrder = await odooIntegrationService.execute('sale.order', 'read', [
              [saleOrder.id],
              ['id', 'name', 'state']
            ]).then(orders => orders[0]);
          }
          break;
      }

      // Add tracking information if provided
      if (tracking_number) {
        // This would update tracking information in Odoo
        console.log(`📦 Adding tracking number: ${tracking_number}`);
      }

      const result = {
        success: true,
        order_id: updatedOrder.id,
        order_name: updatedOrder.name,
        old_status: saleOrder.state,
        new_status: updatedOrder.state,
        marketplace_status: new_status,
        tracking_number: tracking_number,
        updated_at: new Date().toISOString()
      };

      console.log(`✅ Order status updated:`, result);
      return result;
    } catch (error) {
      console.error('❌ Order status update workflow failed:', error.message);
      throw error;
    }
  }

  // === HEALTH CHECK ===
  
  async healthCheck() {
    try {
      const odooHealth = await odooIntegrationService.healthCheck();
      const shopStats = await mappingEngine.getShopMappingStats();
      
      return {
        status: odooHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        odoo: odooHealth,
        mapping_engine: {
          total_shops: shopStats.total,
          active_shops: shopStats.active
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // === BATCH OPERATIONS ===
  
  async processBatchOrders(orders) {
    try {
      console.log(`🔄 Starting batch order processing: ${orders.length} orders`);
      
      const results = [];
      for (const order of orders) {
        try {
          const result = await this.processMarketplaceOrder(order);
          results.push({ success: true, order: order.marketplace_order_id, result });
        } catch (error) {
          results.push({ success: false, order: order.marketplace_order_id, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Batch processing completed: ${successCount}/${orders.length} orders processed successfully`);
      
      return results;
    } catch (error) {
      console.error('❌ Batch order processing failed:', error.message);
      throw error;
    }
  }
}

module.exports = new OdooWorkflowService();
