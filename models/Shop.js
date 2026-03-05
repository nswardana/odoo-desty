// models/Shop.js
// PostgreSQL model for marketplace shops mapping

const { Pool } = require('pg');

class Shop {
  constructor() {
    this.pool = new Pool({
      host: process.env.PG_HOST,
      port: process.env.PG_PORT || 5432,
      database: process.env.PG_DB,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  // Initialize table
  async initializeTable() {
    try {
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS marketplace_shops (
          id SERIAL PRIMARY KEY,
          marketplace VARCHAR(50) NOT NULL,
          shop_id VARCHAR(100) NOT NULL,
          shop_name VARCHAR(255),
          company_id INTEGER NOT NULL,
          warehouse_id INTEGER NOT NULL,
          pricelist_id INTEGER,
          journal_id INTEGER,
          active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          sync_settings JSONB DEFAULT '{}',
          webhook_url VARCHAR(500),
          webhook_secret VARCHAR(255),
          UNIQUE(marketplace, shop_id)
        );
      `;

      await this.pool.query(createTableQuery);
      console.log('✅ Table marketplace_shops initialized');
      
      // Create indexes for better performance
      await this.createIndexes();
      
    } catch (error) {
      console.error('❌ Error initializing table:', error.message);
      throw error;
    }
  }

  // Create indexes
  async createIndexes() {
    try {
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_marketplace_shops_marketplace ON marketplace_shops(marketplace);',
        'CREATE INDEX IF NOT EXISTS idx_marketplace_shops_shop_id ON marketplace_shops(shop_id);',
        'CREATE INDEX IF NOT EXISTS idx_marketplace_shops_active ON marketplace_shops(active);',
        'CREATE INDEX IF NOT EXISTS idx_marketplace_shops_company_id ON marketplace_shops(company_id);',
        'CREATE INDEX IF NOT EXISTS idx_marketplace_shops_warehouse_id ON marketplace_shops(warehouse_id);',
        'CREATE INDEX IF NOT EXISTS idx_marketplace_shops_pricelist_id ON marketplace_shops(pricelist_id);',
        'CREATE INDEX IF NOT EXISTS idx_marketplace_shops_journal_id ON marketplace_shops(journal_id);',
        'CREATE INDEX IF NOT EXISTS idx_marketplace_shops_sync_settings ON marketplace_shops USING GIN(sync_settings);'
      ];

      for (const indexQuery of indexes) {
        await this.pool.query(indexQuery);
      }
      
      console.log('✅ Indexes created for marketplace_shops');
    } catch (error) {
      console.error('❌ Error creating indexes:', error.message);
      throw error;
    }
  }

  // Create new shop mapping
  async create(shopData) {
    try {
      const {
        marketplace,
        shop_id,
        shop_name,
        company_id,
        warehouse_id,
        pricelist_id,
        journal_id,
        active = true,
        sync_settings = {},
        webhook_url,
        webhook_secret
      } = shopData;

      const query = `
        INSERT INTO marketplace_shops (
          marketplace, shop_id, shop_name, company_id, warehouse_id,
          pricelist_id, journal_id, active, sync_settings, webhook_url, webhook_secret
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const values = [
        marketplace, shop_id, shop_name, company_id, warehouse_id,
        pricelist_id, journal_id, active, sync_settings, webhook_url, webhook_secret
      ];

      const result = await this.pool.query(query, values);
      console.log(`✅ Created shop mapping: ${marketplace} - ${shop_id}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating shop mapping:', error.message);
      throw error;
    }
  }

  // Update shop mapping
  async update(id, updateData) {
    try {
      const setClause = [];
      const values = [id];
      let paramIndex = 2;

      // Build dynamic SET clause
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          setClause.push(`${key} = $${paramIndex}`);
          values.push(updateData[key]);
          paramIndex++;
        }
      });

      // Always update updated_at
      setClause.push(`updated_at = NOW()`);
      values.push(`updated_at`);

      const query = `
        UPDATE marketplace_shops 
        SET ${setClause.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const result = await this.pool.query(query, values);
      console.log(`✅ Updated shop mapping: ${id}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error updating shop mapping:', error.message);
      throw error;
    }
  }

  // Find by marketplace and shop
  async findByMarketplaceAndShop(marketplace, shopId) {
    try {
      const query = `
        SELECT * FROM marketplace_shops 
        WHERE marketplace = $1 AND shop_id = $2 AND active = true
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await this.pool.query(query, [marketplace, shopId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('❌ Error finding shop mapping:', error.message);
      throw error;
    }
  }

  // Find by ID
  async findById(id) {
    try {
      const query = `
        SELECT * FROM marketplace_shops 
        WHERE id = $1
      `;

      const result = await this.pool.query(query, [id]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('❌ Error finding shop by ID:', error.message);
      throw error;
    }
  }

  // Get all shops
  async findAll(marketplace = null, companyId = null, activeOnly = true) {
    try {
      let query = 'SELECT * FROM marketplace_shops';
      const values = [];
      let paramIndex = 1;

      const conditions = [];
      
      if (marketplace) {
        conditions.push(`marketplace = $${paramIndex}`);
        values.push(marketplace);
        paramIndex++;
      }
      
      if (companyId) {
        conditions.push(`company_id = $${paramIndex}`);
        values.push(companyId);
        paramIndex++;
      }
      
      if (activeOnly) {
        conditions.push(`active = $${paramIndex}`);
        values.push(true);
        paramIndex++;
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY marketplace, shop_name';

      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding all shops:', error.message);
      throw error;
    }
  }

  // Get shops by company
  async findByCompany(companyId, activeOnly = true) {
    try {
      const query = `
        SELECT * FROM marketplace_shops 
        WHERE company_id = $1 ${activeOnly ? 'AND active = true' : ''}
        ORDER BY marketplace, shop_name
      `;

      const result = await this.pool.query(query, [companyId]);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding shops by company:', error.message);
      throw error;
    }
  }

  // Get shops by marketplace
  async findByMarketplace(marketplace, activeOnly = true) {
    try {
      const query = `
        SELECT * FROM marketplace_shops 
        WHERE marketplace = $1 ${activeOnly ? 'AND active = true' : ''}
        ORDER BY shop_name
      `;

      const result = await this.pool.query(query, [marketplace]);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding shops by marketplace:', error.message);
      throw error;
    }
  }

  // Deactivate shop
  async deactivate(id) {
    try {
      const query = `
        UPDATE marketplace_shops 
        SET active = false, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;

      const result = await this.pool.query(query, [id]);
      console.log(`✅ Deactivated shop: ${id}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error deactivating shop:', error.message);
      throw error;
    }
  }

  // Update sync settings
  async updateSyncSettings(id, syncSettings) {
    try {
      const query = `
        UPDATE marketplace_shops 
        SET sync_settings = $1, updated_at = NOW(), last_sync = NOW()
        WHERE id = $1
        RETURNING *
      `;

      const result = await this.pool.query(query, [syncSettings, id]);
      console.log(`✅ Updated sync settings for shop: ${id}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error updating sync settings:', error.message);
      throw error;
    }
  }

  // Update webhook configuration
  async updateWebhookConfig(id, webhookUrl, webhookSecret) {
    try {
      const query = `
        UPDATE marketplace_shops 
        SET webhook_url = $1, webhook_secret = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `;

      const result = await this.pool.query(query, [webhookUrl, webhookSecret, id]);
      console.log(`✅ Updated webhook config for shop: ${id}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error updating webhook config:', error.message);
      throw error;
    }
  }

  // Get shop statistics
  async getStats() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN active = true THEN 1 END) as active,
          marketplace,
          COUNT(CASE WHEN webhook_url IS NOT NULL THEN 1 END) as webhook_configured,
          COUNT(CASE WHEN pricelist_id IS NOT NULL THEN 1 END) as pricelist_configured,
          COUNT(CASE WHEN journal_id IS NOT NULL THEN 1 END) as journal_configured
        FROM marketplace_shops 
        GROUP BY marketplace
      `;

      const result = await this.pool.query(query);
      
      const stats = {
        total: 0,
        active: 0,
        webhook_configured: 0,
        pricelist_configured: 0,
        journal_configured: 0,
        by_marketplace: {}
      };

      result.rows.forEach(row => {
        stats.total += row.total;
        stats.active += row.active;
        stats.webhook_configured += row.webhook_configured;
        stats.pricelist_configured += row.pricelist_configured;
        stats.journal_configured += row.journal_configured;
        stats.by_marketplace[row.marketplace] = {
          total: row.total,
          active: row.active,
          webhook_configured: row.webhook_configured,
          pricelist_configured: row.pricelist_configured,
          journal_configured: row.journal_configured
        };
      });

      return stats;
    } catch (error) {
      console.error('❌ Error getting shop stats:', error.message);
      throw error;
    }
  }

  // Validate shop configuration
  async validateShopConfiguration(shopId) {
    try {
      const shop = await this.findById(shopId);
      if (!shop) {
        return { valid: false, errors: ['Shop not found'] };
      }

      const errors = [];
      
      if (!shop.company_id) {
        errors.push('Company ID is required');
      }
      
      if (!shop.warehouse_id) {
        errors.push('Warehouse ID is required');
      }

      if (!shop.pricelist_id) {
        errors.push('Pricelist ID is recommended');
      }

      if (!shop.journal_id) {
        errors.push('Journal ID is recommended');
      }

      if (!shop.webhook_url) {
        errors.push('Webhook URL is recommended');
      }

      return {
        valid: errors.length === 0,
        errors: errors,
        shop: shop
      };
    } catch (error) {
      console.error('❌ Error validating shop configuration:', error.message);
      throw error;
    }
  }

  // Get shops needing sync
  async findShopsNeedingSync(minutesAgo = 30) {
    try {
      const query = `
        SELECT * FROM marketplace_shops 
        WHERE active = true 
        AND (last_sync IS NULL OR last_sync < NOW() - INTERVAL '${minutesAgo} minutes')
        ORDER BY last_sync ASC NULLS FIRST
      `;

      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding shops needing sync:', error.message);
      throw error;
    }
  }

  // Update last sync timestamp
  async updateLastSync(id) {
    try {
      const query = `
        UPDATE marketplace_shops 
        SET last_sync = NOW()
        WHERE id = $1
      `;

      await this.pool.query(query, [id]);
      console.log(`✅ Updated last sync for shop: ${id}`);
      return true;
    } catch (error) {
      console.error('❌ Error updating last sync:', error.message);
      throw error;
    }
  }

  // Close connection
  async close() {
    await this.pool.end();
    console.log('🔌 Shop database connection closed');
  }
}

module.exports = new Shop();
