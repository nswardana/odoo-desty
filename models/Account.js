// models/Account.js
// PostgreSQL model for marketplace accounts

const { Pool } = require('pg');

class Account {
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
        CREATE TABLE IF NOT EXISTS marketplace_accounts (
          id SERIAL PRIMARY KEY,
          marketplace VARCHAR(50) NOT NULL,
          shop_id VARCHAR(100) NOT NULL,
          seller_id VARCHAR(100),
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          expire_at TIMESTAMP WITH TIME ZONE,
          company_id INTEGER,
          warehouse_id INTEGER,
          active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          deactivated_at TIMESTAMP WITH TIME ZONE,
          UNIQUE(marketplace, shop_id)
        );
      `;

      await this.pool.query(createTableQuery);
      console.log('✅ Table marketplace_accounts initialized');
      
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
        'CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_marketplace ON marketplace_accounts(marketplace);',
        'CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_shop_id ON marketplace_accounts(shop_id);',
        'CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_active ON marketplace_accounts(active);',
        'CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_expire_at ON marketplace_accounts(expire_at);',
        'CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_company_id ON marketplace_accounts(company_id);',
        'CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_warehouse_id ON marketplace_accounts(warehouse_id);'
      ];

      for (const indexQuery of indexes) {
        await this.pool.query(indexQuery);
      }
      
      console.log('✅ Indexes created for marketplace_accounts');
    } catch (error) {
      console.error('❌ Error creating indexes:', error.message);
      throw error;
    }
  }

  // Create new account
  async create(accountData) {
    try {
      const {
        marketplace,
        shop_id,
        seller_id,
        access_token,
        refresh_token,
        expire_at,
        company_id,
        warehouse_id,
        active = true
      } = accountData;

      const query = `
        INSERT INTO marketplace_accounts (
          marketplace, shop_id, seller_id, access_token, refresh_token,
          expire_at, company_id, warehouse_id, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const values = [
        marketplace, shop_id, seller_id, access_token, refresh_token,
        expire_at, company_id, warehouse_id, active
      ];

      const result = await this.pool.query(query, values);
      console.log(`✅ Created account: ${marketplace} - ${shop_id}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating account:', error.message);
      throw error;
    }
  }

  // Update account
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
        UPDATE marketplace_accounts 
        SET ${setClause.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const result = await this.pool.query(query, values);
      console.log(`✅ Updated account: ${id}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error updating account:', error.message);
      throw error;
    }
  }

  // Find by marketplace and shop
  async findByMarketplaceAndShop(marketplace, shopId) {
    try {
      const query = `
        SELECT * FROM marketplace_accounts 
        WHERE marketplace = $1 AND shop_id = $2 AND active = true
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await this.pool.query(query, [marketplace, shopId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('❌ Error finding account:', error.message);
      throw error;
    }
  }

  // Find by ID
  async findById(id) {
    try {
      const query = `
        SELECT * FROM marketplace_accounts 
        WHERE id = $1
      `;

      const result = await this.pool.query(query, [id]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('❌ Error finding account by ID:', error.message);
      throw error;
    }
  }

  // Get all accounts
  async findAll(marketplace = null, activeOnly = true) {
    try {
      let query = 'SELECT * FROM marketplace_accounts';
      const values = [];
      let paramIndex = 1;

      const conditions = [];
      
      if (marketplace) {
        conditions.push(`marketplace = $${paramIndex}`);
        values.push(marketplace);
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

      query += ' ORDER BY created_at DESC';

      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding all accounts:', error.message);
      throw error;
    }
  }

  // Deactivate account
  async deactivate(id) {
    try {
      const query = `
        UPDATE marketplace_accounts 
        SET active = false, deactivated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;

      const result = await this.pool.query(query, [id]);
      console.log(`✅ Deactivated account: ${id}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error deactivating account:', error.message);
      throw error;
    }
  }

  // Get accounts needing token refresh
  async findNeedingRefresh() {
    try {
      const query = `
        SELECT * FROM marketplace_accounts 
        WHERE active = true 
        AND (expire_at IS NULL OR expire_at <= NOW() + INTERVAL '7 days')
        ORDER BY expire_at ASC
      `;

      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding accounts needing refresh:', error.message);
      throw error;
    }
  }

  // Get statistics
  async getStats() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN active = true THEN 1 END) as active,
          marketplace,
          COUNT(CASE WHEN expire_at <= NOW() THEN 1 END) as expired,
          COUNT(CASE WHEN expire_at > NOW() AND expire_at <= NOW() + INTERVAL '7 days' THEN 1 END) as expiring_soon
        FROM marketplace_accounts 
        GROUP BY marketplace
      `;

      const result = await this.pool.query(query);
      
      const stats = {
        total: 0,
        active: 0,
        expired: 0,
        expiring_soon: 0,
        by_marketplace: {}
      };

      result.rows.forEach(row => {
        stats.total += row.total;
        stats.active += row.active;
        stats.expired += row.expired;
        stats.expiring_soon += row.expiring_soon;
        stats.by_marketplace[row.marketplace] = {
          total: row.total,
          active: row.active,
          expired: row.expired,
          expiring_soon: row.expiring_soon
        };
      });

      return stats;
    } catch (error) {
      console.error('❌ Error getting stats:', error.message);
      throw error;
    }
  }

  // Validate token
  async validateToken(id, token) {
    try {
      const query = `
        SELECT * FROM marketplace_accounts 
        WHERE id = $1 AND active = true
      `;

      const result = await this.pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return { valid: false, reason: 'Account not found' };
      }

      const account = result.rows[0];
      
      if (account.access_token !== token) {
        return { valid: false, reason: 'Invalid token' };
      }

      if (account.expire_at && new Date(account.expire_at) <= new Date()) {
        return { valid: false, reason: 'Token expired' };
      }

      return { valid: true, account };
    } catch (error) {
      console.error('❌ Error validating token:', error.message);
      throw error;
    }
  }

  // Update last sync
  async updateLastSync(id) {
    try {
      const query = `
        UPDATE marketplace_accounts 
        SET last_sync = NOW()
        WHERE id = $1
      `;

      await this.pool.query(query, [id]);
      console.log(`✅ Updated last sync for account: ${id}`);
      return true;
    } catch (error) {
      console.error('❌ Error updating last sync:', error.message);
      throw error;
    }
  }

  // Close connection
  async close() {
    await this.pool.end();
    console.log('🔌 Database connection closed');
  }
}

module.exports = new Account();
