// services/accountServicePG.js
// PostgreSQL-based account service (alternative to Odoo-based)

const Account = require('../models/Account');

class AccountServicePG {
  
  // Initialize database table
  async initialize() {
    try {
      await Account.initializeTable();
      console.log('✅ PostgreSQL account service initialized');
    } catch (error) {
      console.error('❌ Error initializing account service:', error.message);
      throw error;
    }
  }

  // === ACCOUNT OPERATIONS ===
  
  async createAccount(accountData) {
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

      // Validate required fields
      if (!marketplace || !shop_id || !access_token) {
        throw new Error("Required fields: marketplace, shop_id, access_token");
      }

      // Check if account already exists
      const existing = await this.getAccountByShop(marketplace, shop_id);
      if (existing) {
        return await this.updateAccount(existing.id, accountData);
      }

      const account = await Account.create({
        marketplace,
        shop_id,
        seller_id,
        access_token,
        refresh_token,
        expire_at,
        company_id,
        warehouse_id,
        active
      });

      console.log(`✅ Created marketplace account in PostgreSQL: ${marketplace} - ${shop_id}`);
      return account;
    } catch (error) {
      console.error("❌ Error creating marketplace account:", error.message);
      throw error;
    }
  }

  async updateAccount(accountId, updateData) {
    try {
      const account = await Account.update(accountId, updateData);
      console.log(`✅ Updated marketplace account in PostgreSQL: ${accountId}`);
      return account;
    } catch (error) {
      console.error("❌ Error updating marketplace account:", error.message);
      throw error;
    }
  }

  async getAccountByShop(marketplace, shopId) {
    try {
      const account = await Account.findByMarketplaceAndShop(marketplace, shopId);
      return account;
    } catch (error) {
      console.error("❌ Error getting account by shop:", error.message);
      throw error;
    }
  }

  async getAccountById(accountId) {
    try {
      const account = await Account.findById(accountId);
      return account;
    } catch (error) {
      console.error("❌ Error getting account by ID:", error.message);
      throw error;
    }
  }

  async getAllAccounts(marketplace = null, activeOnly = true) {
    try {
      const accounts = await Account.findAll(marketplace, activeOnly);
      return accounts;
    } catch (error) {
      console.error("❌ Error getting all accounts:", error.message);
      throw error;
    }
  }

  async getActiveAccountsByMarketplace(marketplace) {
    try {
      const accounts = await Account.findAll(marketplace, true);
      return accounts;
    } catch (error) {
      console.error("❌ Error getting active accounts:", error.message);
      throw error;
    }
  }

  async deactivateAccount(accountId) {
    try {
      const account = await Account.deactivate(accountId);
      console.log(`✅ Deactivated account in PostgreSQL: ${accountId}`);
      return account;
    } catch (error) {
      console.error("❌ Error deactivating account:", error.message);
      throw error;
    }
  }

  // === TOKEN MANAGEMENT ===
  
  async refreshAccessToken(accountId) {
    try {
      const account = await this.getAccountById(accountId);
      if (!account) {
        throw new Error(`Account not found: ${accountId}`);
      }

      // Check if token needs refresh
      if (account.expire_at && new Date(account.expire_at) > new Date()) {
        console.log(`🔄 Token still valid for account ${accountId}`);
        return account.access_token;
      }

      // Refresh token based on marketplace
      const newTokenData = await this.refreshTokenForMarketplace(
        account.marketplace,
        account.refresh_token
      );

      // Update account with new token
      await this.updateAccount(accountId, {
        access_token: newTokenData.access_token,
        refresh_token: newTokenData.refresh_token || account.refresh_token,
        expire_at: newTokenData.expire_at
      });

      console.log(`✅ Refreshed access token in PostgreSQL for account ${accountId}`);
      return newTokenData.access_token;
    } catch (error) {
      console.error("❌ Error refreshing access token:", error.message);
      throw error;
    }
  }

  async refreshTokenForMarketplace(marketplace, refreshToken) {
    // This would be implemented based on each marketplace's OAuth flow
    const expireAt = new Date();
    expireAt.setHours(expireAt.getHours() + 24);

    return {
      access_token: `pg_refreshed_token_${Date.now()}`,
      refresh_token: refreshToken,
      expire_at: expireAt.toISOString()
    };
  }

  async validateToken(accountId, token) {
    try {
      const validation = await Account.validateToken(accountId, token);
      return validation;
    } catch (error) {
      console.error("❌ Error validating token:", error.message);
      throw error;
    }
  }

  // === SYNC OPERATIONS ===
  
  async updateLastSync(accountId) {
    try {
      await Account.updateLastSync(accountId);
      return true;
    } catch (error) {
      console.error("❌ Error updating last sync:", error.message);
      throw error;
    }
  }

  async getAccountsNeedingTokenRefresh() {
    try {
      const accounts = await Account.findNeedingRefresh();
      return accounts;
    } catch (error) {
      console.error("❌ Error getting accounts needing refresh:", error.message);
      throw error;
    }
  }

  // === COMPANY & WAREHOUSE VALIDATION ===
  
  async validateCompanyWarehouse(companyId, warehouseId) {
    try {
      // For PostgreSQL, we would need separate tables for companies and warehouses
      // For now, just validate that IDs are provided
      if (!companyId || !warehouseId) {
        throw new Error(`Company ID and Warehouse ID are required`);
      }

      console.log(`✅ Validated company ${companyId} and warehouse ${warehouseId}`);
      return { valid: true, company_id: companyId, warehouse_id: warehouseId };
    } catch (error) {
      console.error("❌ Error validating company/warehouse:", error.message);
      throw error;
    }
  }

  // === BULK OPERATIONS ===
  
  async bulkCreateAccounts(accountsData) {
    try {
      console.log(`🔄 Starting bulk account creation in PostgreSQL...`);
      
      const results = [];
      for (const accountData of accountsData) {
        try {
          const account = await this.createAccount(accountData);
          results.push({ success: true, accountData, account });
        } catch (error) {
          results.push({ success: false, accountData, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Bulk account creation completed in PostgreSQL: ${successCount}/${accountsData.length} accounts`);
      
      return results;
    } catch (error) {
      console.error("❌ Error in bulk account creation:", error.message);
      throw error;
    }
  }

  async getAccountStats() {
    try {
      const stats = await Account.getStats();
      return stats;
    } catch (error) {
      console.error("❌ Error getting account stats:", error.message);
      throw error;
    }
  }

  // === MIGRATION HELPERS ===
  
  // Migrate from Odoo to PostgreSQL
  async migrateFromOdoo(odooAccounts) {
    try {
      console.log('🔄 Starting migration from Odoo to PostgreSQL...');
      
      const results = [];
      for (const odooAccount of odooAccounts) {
        try {
          const pgAccount = await this.createAccount({
            marketplace: odooAccount.marketplace,
            shop_id: odooAccount.shop_id,
            seller_id: odooAccount.seller_id,
            access_token: odooAccount.access_token,
            refresh_token: odooAccount.refresh_token,
            expire_at: odooAccount.expire_at,
            company_id: odooAccount.company_id,
            warehouse_id: odooAccount.warehouse_id,
            active: odooAccount.active
          });
          results.push({ success: true, odoo_id: odooAccount.id, pg_id: pgAccount.id });
        } catch (error) {
          results.push({ success: false, odoo_id: odooAccount.id, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Migration completed: ${successCount}/${odooAccounts.length} accounts migrated`);
      
      return results;
    } catch (error) {
      console.error("❌ Error during migration:", error.message);
      throw error;
    }
  }

  // Close database connection
  async close() {
    await Account.close();
  }
}

module.exports = new AccountServicePG();
