// services/mappingEngine.js
// Mapping Engine for marketplace shops and configurations

const Shop = require('../models/Shop');
const { execute } = require('./odooService');

class MappingEngine {
  
  // === SHOP MAPPING OPERATIONS ===
  
  async createShopMapping(shopData) {
    try {
      const {
        marketplace,
        shop_id,
        shop_name,
        company_id,
        warehouse_id,
        pricelist_id,
        journal_id,
        sync_settings = {},
        webhook_url,
        webhook_secret
      } = shopData;

      // Validate required fields
      if (!marketplace || !shop_id || !company_id || !warehouse_id) {
        throw new Error("Required fields: marketplace, shop_id, company_id, warehouse_id");
      }

      // Validate Odoo entities
      await this.validateOdooEntities(company_id, warehouse_id, pricelist_id, journal_id);

      // Check if mapping already exists
      const existing = await Shop.findByMarketplaceAndShop(marketplace, shop_id);
      if (existing) {
        return await this.updateShopMapping(existing.id, shopData);
      }

      const shop = await Shop.create({
        marketplace,
        shop_id,
        shop_name,
        company_id,
        warehouse_id,
        pricelist_id,
        journal_id,
        sync_settings,
        webhook_url,
        webhook_secret
      });

      console.log(`✅ Created shop mapping: ${marketplace} - ${shop_id}`);
      return shop;
    } catch (error) {
      console.error("❌ Error creating shop mapping:", error.message);
      throw error;
    }
  }

  async updateShopMapping(shopId, updateData) {
    try {
      const shop = await Shop.update(shopId, updateData);
      console.log(`✅ Updated shop mapping: ${shopId}`);
      return shop;
    } catch (error) {
      console.error("❌ Error updating shop mapping:", error.message);
      throw error;
    }
  }

  async getShopMapping(marketplace, shopId) {
    try {
      const shop = await Shop.findByMarketplaceAndShop(marketplace, shopId);
      return shop;
    } catch (error) {
      console.error("❌ Error getting shop mapping:", error.message);
      throw error;
    }
  }

  async getShopMappingById(shopId) {
    try {
      const shop = await Shop.findById(shopId);
      return shop;
    } catch (error) {
      console.error("❌ Error getting shop mapping by ID:", error.message);
      throw error;
    }
  }

  async getAllShopMappings(marketplace = null, companyId = null, activeOnly = true) {
    try {
      const shops = await Shop.findAll(marketplace, companyId, activeOnly);
      return shops;
    } catch (error) {
      console.error("❌ Error getting all shop mappings:", error.message);
      throw error;
    }
  }

  async deactivateShopMapping(shopId) {
    try {
      const shop = await Shop.deactivate(shopId);
      console.log(`✅ Deactivated shop mapping: ${shopId}`);
      return shop;
    } catch (error) {
      console.error("❌ Error deactivating shop mapping:", error.message);
      throw error;
    }
  }

  // === ODOO VALIDATION ===
  
  async validateOdooEntities(companyId, warehouseId, pricelistId = null, journalId = null) {
    try {
      const validationResults = {};

      // Validate company
      const companyResult = await execute('res.company', 'search', [['id', '=', companyId]]);
      if (companyResult.length === 0) {
        throw new Error(`Company not found: ${companyId}`);
      }
      validationResults.company = { valid: true, id: companyId };

      // Validate warehouse
      const warehouseResult = await execute('stock.warehouse', 'search', [['id', '=', warehouseId]]);
      if (warehouseResult.length === 0) {
        throw new Error(`Warehouse not found: ${warehouseId}`);
      }
      validationResults.warehouse = { valid: true, id: warehouseId };

      // Validate pricelist (optional)
      if (pricelistId) {
        const pricelistResult = await execute('product.pricelist', 'search', [['id', '=', pricelistId]]);
        if (pricelistResult.length === 0) {
          throw new Error(`Pricelist not found: ${pricelistId}`);
        }
        validationResults.pricelist = { valid: true, id: pricelistId };
      }

      // Validate journal (optional)
      if (journalId) {
        const journalResult = await execute('account.journal', 'search', [['id', '=', journalId]]);
        if (journalResult.length === 0) {
          throw new Error(`Journal not found: ${journalId}`);
        }
        validationResults.journal = { valid: true, id: journalId };
      }

      console.log(`✅ Odoo entities validated:`, validationResults);
      return validationResults;
    } catch (error) {
      console.error("❌ Error validating Odoo entities:", error.message);
      throw error;
    }
  }

  // === SYNC SETTINGS MANAGEMENT ===
  
  async updateSyncSettings(shopId, syncSettings) {
    try {
      const shop = await Shop.updateSyncSettings(shopId, syncSettings);
      console.log(`✅ Updated sync settings for shop: ${shopId}`);
      return shop;
    } catch (error) {
      console.error("❌ Error updating sync settings:", error.message);
      throw error;
    }
  }

  async getDefaultSyncSettings(marketplace) {
    try {
      const defaultSettings = {
        'shopee': {
          auto_order_import: true,
          auto_stock_sync: true,
          auto_product_sync: false,
          order_status_mapping: {
            'pending': 'draft',
            'paid': 'sale',
            'shipped': 'done',
            'completed': 'done',
            'cancelled': 'cancel'
          },
          stock_sync_interval: 30, // minutes
          product_sync_interval: 60, // minutes
          webhook_events: ['order.created', 'order.paid', 'order.cancelled', 'stock.updated']
        },
        'tokopedia': {
          auto_order_import: true,
          auto_stock_sync: true,
          auto_product_sync: false,
          order_status_mapping: {
            'new': 'draft',
            'payment_confirmed': 'sale',
            'shipping': 'done',
            'delivered': 'done',
            'cancelled': 'cancel'
          },
          stock_sync_interval: 30,
          product_sync_interval: 60,
          webhook_events: ['order.created', 'order.paid', 'order.cancelled', 'stock.updated']
        },
        'lazada': {
          auto_order_import: true,
          auto_stock_sync: true,
          auto_product_sync: false,
          order_status_mapping: {
            'pending': 'draft',
            'paid': 'sale',
            'shipped': 'done',
            'delivered': 'done',
            'cancelled': 'cancel'
          },
          stock_sync_interval: 30,
          product_sync_interval: 60,
          webhook_events: ['order.created', 'order.paid', 'order.cancelled', 'stock.updated']
        },
        'tiktok': {
          auto_order_import: true,
          auto_stock_sync: true,
          auto_product_sync: false,
          order_status_mapping: {
            'unpaid': 'draft',
            'paid': 'sale',
            'shipped': 'done',
            'completed': 'done',
            'cancelled': 'cancel'
          },
          stock_sync_interval: 30,
          product_sync_interval: 60,
          webhook_events: ['order.created', 'order.paid', 'order.cancelled', 'stock.updated']
        }
      };

      return defaultSettings[marketplace] || defaultSettings['shopee'];
    } catch (error) {
      console.error("❌ Error getting default sync settings:", error.message);
      throw error;
    }
  }

  // === WEBHOOK CONFIGURATION ===
  
  async updateWebhookConfig(shopId, webhookUrl, webhookSecret) {
    try {
      const shop = await Shop.updateWebhookConfig(shopId, webhookUrl, webhookSecret);
      console.log(`✅ Updated webhook config for shop: ${shopId}`);
      return shop;
    } catch (error) {
      console.error("❌ Error updating webhook config:", error.message);
      throw error;
    }
  }

  async validateWebhookConfig(shopId) {
    try {
      const shop = await Shop.findById(shopId);
      if (!shop) {
        return { valid: false, errors: ['Shop not found'] };
      }

      const errors = [];
      
      if (!shop.webhook_url) {
        errors.push('Webhook URL is required');
      }

      if (!shop.webhook_secret) {
        errors.push('Webhook secret is required');
      }

      if (!shop.webhook_url.startsWith('https://')) {
        errors.push('Webhook URL must use HTTPS');
      }

      return {
        valid: errors.length === 0,
        errors: errors,
        config: {
          webhook_url: shop.webhook_url,
          webhook_secret: shop.webhook_secret ? '***configured***' : null
        }
      };
    } catch (error) {
      console.error("❌ Error validating webhook config:", error.message);
      throw error;
    }
  }

  // === SYNC OPERATIONS ===
  
  async getShopsNeedingSync(minutesAgo = 30) {
    try {
      const shops = await Shop.findShopsNeedingSync(minutesAgo);
      return shops;
    } catch (error) {
      console.error("❌ Error getting shops needing sync:", error.message);
      throw error;
    }
  }

  async updateLastSync(shopId) {
    try {
      await Shop.updateLastSync(shopId);
      return true;
    } catch (error) {
      console.error("❌ Error updating last sync:", error.message);
      throw error;
    }
  }

  // === CONFIGURATION VALIDATION ===
  
  async validateShopConfiguration(shopId) {
    try {
      const validation = await Shop.validateShopConfiguration(shopId);
      
      // Additional validation for Odoo entities
      if (validation.valid && validation.shop) {
        try {
          await this.validateOdooEntities(
            validation.shop.company_id,
            validation.shop.warehouse_id,
            validation.shop.pricelist_id,
            validation.shop.journal_id
          );
        } catch (error) {
          validation.valid = false;
          validation.errors.push(error.message);
        }
      }

      return validation;
    } catch (error) {
      console.error("❌ Error validating shop configuration:", error.message);
      throw error;
    }
  }

  // === BULK OPERATIONS ===
  
  async bulkCreateShopMappings(shopsData) {
    try {
      console.log(`🔄 Starting bulk shop mapping creation...`);
      
      const results = [];
      for (const shopData of shopsData) {
        try {
          const shop = await this.createShopMapping(shopData);
          results.push({ success: true, shopData, shop });
        } catch (error) {
          results.push({ success: false, shopData, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Bulk shop mapping creation completed: ${successCount}/${shopsData.length} shops`);
      
      return results;
    } catch (error) {
      console.error("❌ Error in bulk shop mapping creation:", error.message);
      throw error;
    }
  }

  async getShopMappingStats() {
    try {
      const stats = await Shop.getStats();
      return stats;
    } catch (error) {
      console.error("❌ Error getting shop mapping stats:", error.message);
      throw error;
    }
  }

  // === MIGRATION HELPERS ===
  
  async migrateFromLegacyMappings(legacyMappings) {
    try {
      console.log('🔄 Starting migration from legacy mappings...');
      
      const results = [];
      for (const legacy of legacyMappings) {
        try {
          const shopMapping = await this.createShopMapping({
            marketplace: legacy.marketplace,
            shop_id: legacy.shop_id,
            shop_name: legacy.shop_name,
            company_id: legacy.company_id,
            warehouse_id: legacy.warehouse_id,
            pricelist_id: legacy.pricelist_id,
            journal_id: legacy.journal_id,
            sync_settings: legacy.sync_settings || await this.getDefaultSyncSettings(legacy.marketplace),
            webhook_url: legacy.webhook_url,
            webhook_secret: legacy.webhook_secret
          });
          results.push({ success: true, legacy_id: legacy.id, new_id: shopMapping.id });
        } catch (error) {
          results.push({ success: false, legacy_id: legacy.id, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Migration completed: ${successCount}/${legacyMappings.length} shop mappings migrated`);
      
      return results;
    } catch (error) {
      console.error("❌ Error during migration:", error.message);
      throw error;
    }
  }

  // Close database connection
  async close() {
    await Shop.close();
  }
}

module.exports = new MappingEngine();
