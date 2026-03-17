// services/inventoryMappingService.js
// Product mapping management between Odoo and Desty

const db = require('../db');

class InventoryMappingService {
  constructor() {
    this.db = db;
  }

  // Create new product mapping
  async createMapping(odooProduct, destyProduct) {
    console.log(`🔗 Creating product mapping: ${odooProduct.default_code} <-> ${destyProduct.itemExternalCode}`);
    
    try {
      const result = await this.db.query(`
        INSERT INTO product_mapping 
        (odoo_product_id, odoo_sku, desty_item_id, desty_external_code, desty_shop_id, desty_warehouse_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (odoo_product_id) 
        DO UPDATE SET
          odoo_sku = EXCLUDED.odoo_sku,
          desty_item_id = EXCLUDED.desty_item_id,
          desty_external_code = EXCLUDED.desty_external_code,
          desty_shop_id = EXCLUDED.desty_shop_id,
          desty_warehouse_id = EXCLUDED.desty_warehouse_id,
          last_sync = NOW(),
          is_active = TRUE
        RETURNING *
      `, [
        odooProduct.id,
        odooProduct.default_code,
        destyProduct.itemId,
        destyProduct.itemExternalCode,
        destyProduct.shopId,
        destyProduct.warehouseId || null
      ]);

      console.log(`✅ Product mapping created: ${result.rows[0].id}`);
      return result.rows[0];
      
    } catch (error) {
      console.error(`❌ Failed to create product mapping:`, error.message);
      throw error;
    }
  }

  // Get mapping by Odoo product ID
  async getByOdooId(odooProductId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM product_mapping 
        WHERE odoo_product_id = $1 AND is_active = TRUE
      `, [odooProductId]);

      return result.rows.length > 0 ? result.rows[0] : null;
      
    } catch (error) {
      console.error(`❌ Failed to get mapping by Odoo ID ${odooProductId}:`, error.message);
      return null;
    }
  }

  // Get mapping by SKU
  async getBySku(sku) {
    try {
      const result = await this.db.query(`
        SELECT * FROM product_mapping 
        WHERE odoo_sku = $1 AND is_active = TRUE
      `, [sku]);

      return result.rows.length > 0 ? result.rows[0] : null;
      
    } catch (error) {
      console.error(`❌ Failed to get mapping by SKU ${sku}:`, error.message);
      return null;
    }
  }

  // Get mapping by Desty item ID
  async getByDestyItemId(destyItemId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM product_mapping 
        WHERE desty_item_id = $1 AND is_active = TRUE
      `, [destyItemId]);

      return result.rows.length > 0 ? result.rows[0] : null;
      
    } catch (error) {
      console.error(`❌ Failed to get mapping by Desty item ID ${destyItemId}:`, error.message);
      return null;
    }
  }

  // Get all active mappings
  async getActiveMappings(limit = null, offset = 0) {
    try {
      let query = `
        SELECT * FROM product_mapping 
        WHERE is_active = TRUE 
        ORDER BY last_sync ASC
      `;
      
      const params = [];
      
      if (limit) {
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
      }

      const result = await this.db.query(query, params);
      
      console.log(`📋 Retrieved ${result.rows.length} active mappings`);
      return result.rows;
      
    } catch (error) {
      console.error(`❌ Failed to get active mappings:`, error.message);
      return [];
    }
  }

  // Get mappings by shop
  async getMappingsByShop(destyShopId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM product_mapping 
        WHERE desty_shop_id = $1 AND is_active = TRUE
        ORDER BY odoo_sku ASC
      `, [destyShopId]);

      console.log(`📋 Retrieved ${result.rows.length} mappings for shop ${destyShopId}`);
      return result.rows;
      
    } catch (error) {
      console.error(`❌ Failed to get mappings by shop ${destyShopId}:`, error.message);
      return [];
    }
  }

  // Update mapping
  async updateMapping(id, updates) {
    console.log(`🔄 Updating product mapping: ${id}`);
    
    try {
      const setClause = [];
      const params = [];
      
      Object.keys(updates).forEach((key, index) => {
        setClause.push(`${key} = $${index + 2}`);
        params.push(updates[key]);
      });
      
      params.push(id); // For WHERE clause
      
      const result = await this.db.query(`
        UPDATE product_mapping 
        SET ${setClause.join(', ')}, last_sync = NOW()
        WHERE id = $1
        RETURNING *
      `, params);

      if (result.rows.length > 0) {
        console.log(`✅ Product mapping updated: ${id}`);
        return result.rows[0];
      } else {
        console.warn(`⚠️ No mapping found with ID ${id}`);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ Failed to update mapping ${id}:`, error.message);
      throw error;
    }
  }

  // Deactivate mapping
  async deactivateMapping(id) {
    console.log(`🔄 Deactivating product mapping: ${id}`);
    
    try {
      const result = await this.db.query(`
        UPDATE product_mapping 
        SET is_active = FALSE, last_sync = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);

      if (result.rows.length > 0) {
        console.log(`✅ Product mapping deactivated: ${id}`);
        return result.rows[0];
      } else {
        console.warn(`⚠️ No mapping found with ID ${id}`);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ Failed to deactivate mapping ${id}:`, error.message);
      throw error;
    }
  }

  // Delete mapping
  async deleteMapping(id) {
    console.log(`🗑️ Deleting product mapping: ${id}`);
    
    try {
      const result = await this.db.query(`
        DELETE FROM product_mapping 
        WHERE id = $1
        RETURNING *
      `, [id]);

      if (result.rows.length > 0) {
        console.log(`✅ Product mapping deleted: ${id}`);
        return result.rows[0];
      } else {
        console.warn(`⚠️ No mapping found with ID ${id}`);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ Failed to delete mapping ${id}:`, error.message);
      throw error;
    }
  }

  // Search mappings
  async searchMappings(searchTerm, filters = {}) {
    console.log(`🔍 Searching mappings: ${searchTerm}`);
    
    try {
      let whereClause = `is_active = TRUE`;
      const params = [];
      let paramIndex = 1;

      // Add search term
      if (searchTerm) {
        whereClause += ` AND (
          odoo_sku ILIKE $${paramIndex} OR 
          desty_external_code ILIKE $${paramIndex} OR
          desty_item_id ILIKE $${paramIndex}
        )`;
        params.push(`%${searchTerm}%`);
        paramIndex++;
      }

      // Add filters
      if (filters.destyShopId) {
        whereClause += ` AND desty_shop_id = $${paramIndex}`;
        params.push(filters.destyShopId);
        paramIndex++;
      }

      if (filters.odooProductId) {
        whereClause += ` AND odoo_product_id = $${paramIndex}`;
        params.push(filters.odooProductId);
        paramIndex++;
      }

      const query = `
        SELECT * FROM product_mapping 
        WHERE ${whereClause}
        ORDER BY last_sync DESC
        LIMIT 100
      `;

      const result = await this.db.query(query, params);
      
      console.log(`📋 Search results: ${result.rows.length} mappings`);
      return result.rows;
      
    } catch (error) {
      console.error(`❌ Failed to search mappings:`, error.message);
      return [];
    }
  }

  // Get mapping statistics
  async getMappingStats() {
    try {
      const result = await this.db.query(`
        SELECT 
          COUNT(*) as total_mappings,
          COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_mappings,
          COUNT(CASE WHEN is_active = FALSE THEN 1 END) as inactive_mappings,
          COUNT(DISTINCT desty_shop_id) as unique_shops,
          MAX(last_sync) as last_sync,
          MIN(last_sync) as oldest_sync
        FROM product_mapping
      `);

      const stats = result.rows[0];
      
      console.log(`📊 Mapping stats: ${stats.active_mappings} active, ${stats.unique_shops} shops`);
      return stats;
      
    } catch (error) {
      console.error(`❌ Failed to get mapping stats:`, error.message);
      return null;
    }
  }

  // Get mappings that need sync (based on last_sync time)
  async getMappingsNeedingSync(hours = 1) {
    try {
      const result = await this.db.query(`
        SELECT * FROM product_mapping 
        WHERE is_active = TRUE 
        AND (last_sync IS NULL OR last_sync < NOW() - INTERVAL '${hours} hours')
        ORDER BY last_sync ASC NULLS FIRST
        LIMIT 50
      `);

      console.log(`📋 Mappings needing sync: ${result.rows.length} mappings`);
      return result.rows;
      
    } catch (error) {
      console.error(`❌ Failed to get mappings needing sync:`, error.message);
      return [];
    }
  }

  // Bulk import mappings
  async bulkImportMappings(mappings) {
    console.log(`📦 Bulk importing ${mappings.length} mappings`);
    
    try {
      const results = {
        success: 0,
        failed: 0,
        errors: []
      };

      for (const mapping of mappings) {
        try {
          await this.createMapping(mapping.odooProduct, mapping.destyProduct);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            sku: mapping.odooProduct?.default_code || 'unknown',
            error: error.message
          });
        }
      }

      console.log(`✅ Bulk import completed: ${results.success} success, ${results.failed} failed`);
      return results;
      
    } catch (error) {
      console.error(`❌ Failed to bulk import mappings:`, error.message);
      throw error;
    }
  }

  // Export mappings
  async exportMappings(format = 'json') {
    console.log(`📤 Exporting mappings in ${format} format`);
    
    try {
      const mappings = await this.getActiveMappings();
      
      if (format === 'csv') {
        // Convert to CSV format
        const csv = [
          'odoo_product_id,odoo_sku,desty_item_id,desty_external_code,desty_shop_id,last_sync,is_active',
          ...mappings.map(m => 
            `${m.odoo_product_id},${m.odoo_sku},${m.desty_item_id},${m.desty_external_code},${m.desty_shop_id},${m.last_sync},${m.is_active}`
          )
        ].join('\n');
        
        return csv;
      }
      
      // Default JSON format
      return mappings;
      
    } catch (error) {
      console.error(`❌ Failed to export mappings:`, error.message);
      throw error;
    }
  }

  // Validate mapping integrity
  async validateMappingIntegrity() {
    console.log(`🔍 Validating mapping integrity`);
    
    try {
      const result = await this.db.query(`
        SELECT 
          pm.id,
          pm.odoo_sku,
          pm.desty_external_code,
          pm.last_sync,
          CASE 
            WHEN pm.odoo_sku IS NULL OR pm.odoo_sku = '' THEN 'Missing Odoo SKU'
            WHEN pm.desty_external_code IS NULL OR pm.desty_external_code = '' THEN 'Missing Desty SKU'
            WHEN pm.desty_shop_id IS NULL OR pm.desty_shop_id = '' THEN 'Missing Desty Shop ID'
            ELSE NULL
          END as issue
        FROM product_mapping pm
        WHERE pm.is_active = TRUE
        AND (
          pm.odoo_sku IS NULL OR pm.odoo_sku = '' OR
          pm.desty_external_code IS NULL OR pm.desty_external_code = '' OR
          pm.desty_shop_id IS NULL OR pm.desty_shop_id = ''
        )
      `);

      console.log(`📊 Integrity validation: ${result.rows.length} issues found`);
      return result.rows;
      
    } catch (error) {
      console.error(`❌ Failed to validate mapping integrity:`, error.message);
      return [];
    }
  }

  // Update last sync timestamp
  async updateLastSync(id) {
    try {
      await this.db.query(`
        UPDATE product_mapping 
        SET last_sync = NOW()
        WHERE id = $1
      `, [id]);
      
    } catch (error) {
      console.error(`❌ Failed to update last sync for mapping ${id}:`, error.message);
    }
  }

  // Get duplicate mappings
  async getDuplicateMappings() {
    try {
      const result = await this.db.query(`
        SELECT odoo_sku, desty_external_code, COUNT(*) as count
        FROM product_mapping 
        WHERE is_active = TRUE
        GROUP BY odoo_sku, desty_external_code
        HAVING COUNT(*) > 1
      `);

      console.log(`🔍 Duplicate mappings found: ${result.rows.length} pairs`);
      return result.rows;
      
    } catch (error) {
      console.error(`❌ Failed to get duplicate mappings:`, error.message);
      return [];
    }
  }
}

module.exports = new InventoryMappingService();
