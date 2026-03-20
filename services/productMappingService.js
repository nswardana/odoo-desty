// services/productMappingService.js
// Manage mapping between marketplace products and Odoo products

const { execute } = require("./odooService");

class ProductMappingService {
  
  // === MAPPING OPERATIONS ===
  
  async createMapping(mappingData) {
    try {
      const {
        marketplace,
        shop_id,
        odoo_product_id,
        odoo_variant_id = null,
        marketplace_product_id,
        marketplace_sku,
        price_override = null,
        active = true
      } = mappingData;

      // Validate required fields
      if (!marketplace || !shop_id || !odoo_product_id || !marketplace_product_id) {
        throw new Error("Required fields: marketplace, shop_id, odoo_product_id, marketplace_product_id");
      }

      // Check if mapping already exists
      const existing = await this.getMappingByMarketplaceProduct(
        marketplace, 
        marketplace_product_id
      );

      if (existing) {
        return await this.updateMapping(existing.id, mappingData);
      }

      // Create new mapping
      const mapping = await execute("x_marketplace_products", "create", [{
        marketplace,
        shop_id,
        odoo_product_id,
        odoo_variant_id,
        marketplace_product_id,
        marketplace_sku,
        price_override,
        last_sync_at: new Date().toISOString(),
        active
      }]);

      console.log(`✅ Created product mapping: ${marketplace} -> ${odoo_product_id}`);
      return mapping;
    } catch (error) {
      console.error("❌ Error creating product mapping:", error.message);
      throw error;
    }
  }

  async updateMapping(mappingId, updateData) {
    try {
      const updateFields = {
        ...updateData,
        last_sync_at: new Date().toISOString()
      };

      await execute("x_marketplace_products", "write", [
        [mappingId],
        updateFields
      ]);

      console.log(`✅ Updated product mapping: ${mappingId}`);
      return true;
    } catch (error) {
      console.error("❌ Error updating product mapping:", error.message);
      throw error;
    }
  }

  async getMappingByMarketplaceProduct(marketplace, marketplaceProductId) {
    try {
      const result = await execute("x_marketplace_products", "search", [
        [
          ["marketplace", "=", marketplace],
          ["marketplace_product_id", "=", marketplaceProductId],
          ["active", "=", true]
        ],
        0,
        1
      ]);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("❌ Error getting mapping by marketplace product:", error.message);
      throw error;
    }
  }

  async getMappingByOdooProduct(odooProductId) {
    try {
      const result = await execute("x_marketplace_products", "search", [
        [
          ["odoo_product_id", "=", odooProductId],
          ["active", "=", true]
        ]
      ]);
      return result;
    } catch (error) {
      console.error("❌ Error getting mapping by Odoo product:", error.message);
      throw error;
    }
  }

  async getMappingBySku(marketplace, sku) {
    try {
      const result = await execute("x_marketplace_products", "search", [
        [
          ["marketplace", "=", marketplace],
          ["marketplace_sku", "=", sku],
          ["active", "=", true]
        ],
        0,
        1
      ]);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("❌ Error getting mapping by SKU:", error.message);
      throw error;
    }
  }

  async getAllMappings(marketplace = null, shopId = null) {
    try {
      let domain = [["active", "=", true]];
      
      if (marketplace) {
        domain.push(["marketplace", "=", marketplace]);
      }
      
      if (shopId) {
        domain.push(["shop_id", "=", shopId]);
      }

      const result = await execute("x_marketplace_products", "search", [domain]);
      const mappings = await execute("x_marketplace_products", "read", [
        result,
        [
          "id", "marketplace", "shop_id", "odoo_product_id", 
          "odoo_variant_id", "marketplace_product_id", "marketplace_sku",
          "price_override", "last_sync_at", "active"
        ]
      ]);
      
      return mappings;
    } catch (error) {
      console.error("❌ Error getting all mappings:", error.message);
      throw error;
    }
  }

  async syncProductFromMarketplace(marketplace, shopId, marketplaceProduct) {
    try {
      // First, try to find existing Odoo product by SKU
      const odooProduct = await this.findOdooProductBySku(marketplaceProduct.sku);
      
      if (!odooProduct) {
        throw new Error(`Odoo product not found for SKU: ${marketplaceProduct.sku}`);
      }

      // Create or update mapping
      const mappingData = {
        marketplace,
        shop_id: shopId,
        odoo_product_id: odooProduct.id,
        odoo_variant_id: odooProduct.variant_id || null,
        marketplace_product_id: marketplaceProduct.id,
        marketplace_sku: marketplaceProduct.sku,
        price_override: marketplaceProduct.price || null,
        last_sync_at: new Date().toISOString(),
        active: true
      };

      return await this.createMapping(mappingData);
    } catch (error) {
      console.error("❌ Error syncing product from marketplace:", error.message);
      throw error;
    }
  }

  async findOdooProductBySku(sku) {
    try {
      const result = await execute("product.product", "search", [
        [["default_code", "=", sku]],
        0,
        1
      ]);

      if (result.length === 0) {
        return null;
      }

      const products = await execute("product.product", "read", [
        result,
        ["id", "name", "default_code", "list_price"]
      ]);
      
      return products[0];
    } catch (error) {
      console.error("❌ Error finding Odoo product by SKU:", error.message);
      throw error;
    }
  }

  async deactivateMapping(mappingId) {
    try {
      await execute("x_marketplace_products", "write", [
        [mappingId],
        { active: false }
      ]);
      console.log(`✅ Deactivated mapping: ${mappingId}`);
      return true;
    } catch (error) {
      console.error("❌ Error deactivating mapping:", error.message);
      throw error;
    }
  }

  // === BULK OPERATIONS ===
  
  async bulkSync(marketplace, shopId, products) {
    try {
      console.log(`🔄 Starting bulk sync for ${marketplace} shop ${shopId}...`);
      
      const results = [];
      for (const product of products) {
        try {
          const result = await this.syncProductFromMarketplace(marketplace, shopId, product);
          results.push({ success: true, product: product.id, mapping: result });
        } catch (error) {
          results.push({ success: false, product: product.id, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Bulk sync completed: ${successCount}/${products.length} products synced`);
      
      return results;
    } catch (error) {
      console.error("❌ Error in bulk sync:", error.message);
      throw error;
    }
  }

  // === ORDER MAPPING OPERATIONS ===
  
  async saveOrderMapping(orderMappingData) {
    try {
      const {
        marketplace_order_id,
        odoo_order_id,
        marketplace,
        created_at = new Date().toISOString()
      } = orderMappingData;

      // Validate required fields
      if (!marketplace_order_id || !odoo_order_id || !marketplace) {
        throw new Error("Required fields: marketplace_order_id, odoo_order_id, marketplace");
      }

      // DISABLED: Order mapping table operations
      console.log(`📝 Order mapping (DISABLED): ${marketplace_order_id} -> ${odoo_order_id} (${marketplace})`);
      
      // Return mock mapping object for consistency
      return {
        id: `disabled_${Date.now()}`,
        marketplace_order_id,
        odoo_order_id,
        marketplace,
        created_at,
        active: true,
        disabled: true
      };

    } catch (error) {
      console.error('❌ Error saving order mapping:', error.message);
      throw error;
    }
  }

  async getOrderMapping(marketplaceOrderId, marketplace) {
    // DISABLED: Always return null
    console.log(`📝 Get order mapping (DISABLED): ${marketplaceOrderId} (${marketplace})`);
    return null;
  }

  async updateOrderMapping(mappingId, updateData) {
    // DISABLED: Always return false
    console.log(`📝 Update order mapping (DISABLED): ${mappingId}`);
    return false;
  }
}

module.exports = new ProductMappingService();
