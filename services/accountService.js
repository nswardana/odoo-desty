// services/accountService.js
// Manage marketplace accounts and authentication

const { execute } = require("./odooService");
const tokenService = require("./tokenService");

class AccountService {
  
  // === ACCOUNT OPERATIONS ===
  
  async createAccount(accountData) {
    try {
      const {
        marketplace,
        shop_id,
        seller_id,
        access_token,
        refresh_token,
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

      // Create new account
      const accountId = await execute("x_marketplace_accounts", "create", [{
        marketplace,
        shop_id,
        seller_id,
        access_token,
        refresh_token,
        company_id,
        warehouse_id,
        active,
        created_at: new Date().toISOString(),
        last_sync: new Date().toISOString()
      }]);

      console.log(`✅ Created marketplace account: ${marketplace} - ${shop_id}`);
      return accountId;
    } catch (error) {
      console.error("❌ Error creating marketplace account:", error.message);
      throw error;
    }
  }

  async updateAccount(accountId, updateData) {
    try {
      const updateFields = {
        ...updateData,
        updated_at: new Date().toISOString()
      };

      // Remove sensitive fields from logs
      const logFields = { ...updateFields };
      delete logFields.access_token;
      delete logFields.refresh_token;

      console.log(`🔄 Updating account ${accountId}:`, logFields);

      await execute("x_marketplace_accounts", "write", [
        [accountId],
        updateFields
      ]);

      console.log(`✅ Updated marketplace account: ${accountId}`);
      return true;
    } catch (error) {
      console.error("❌ Error updating marketplace account:", error.message);
      throw error;
    }
  }

  async getAccountByShop(marketplace, shopId) {
    try {
      const result = await execute("x_marketplace_accounts", "search", [
        [
          ["marketplace", "=", marketplace],
          ["shop_id", "=", shopId],
          ["active", "=", true]
        ],
        0,
        1
      ]);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("❌ Error getting account by shop:", error.message);
      throw error;
    }
  }

  async getAccountById(accountId) {
    try {
      const result = await execute("x_marketplace_accounts", "search", [
        [["id", "=", accountId]]
      ]);

      if (result.length === 0) {
        return null;
      }

      const accounts = await execute("x_marketplace_accounts", "read", [
        result,
        [
          "id", "marketplace", "shop_id", "seller_id", 
          "access_token", "refresh_token", "expire_at",
          "company_id", "warehouse_id", "active", "created_at", "last_sync"
        ]
      ]);
      
      return accounts[0];
    } catch (error) {
      console.error("❌ Error getting account by ID:", error.message);
      throw error;
    }
  }

  async getAllAccounts(marketplace = null, activeOnly = true) {
    try {
      let domain = [];
      
      if (marketplace) {
        domain.push(["marketplace", "=", marketplace]);
      }
      
      if (activeOnly) {
        domain.push(["active", "=", true]);
      }

      const result = await execute("x_marketplace_accounts", "search", [domain]);
      const accounts = await execute("x_marketplace_accounts", "read", [
        result,
        [
          "id", "marketplace", "shop_id", "seller_id",
          "company_id", "warehouse_id", "active", "created_at", "last_sync", "expire_at"
        ]
      ]);
      
      return accounts;
    } catch (error) {
      console.error("❌ Error getting all accounts:", error.message);
      throw error;
    }
  }

  async getActiveAccountsByMarketplace(marketplace) {
    try {
      const result = await execute("x_marketplace_accounts", "search", [
        [
          ["marketplace", "=", marketplace],
          ["active", "=", true]
        ]
      ]);

      const accounts = await execute("x_marketplace_accounts", "read", [
        result,
        [
          "id", "shop_id", "seller_id", "company_id", 
          "warehouse_id", "expire_at", "last_sync"
        ]
      ]);
      
      return accounts;
    } catch (error) {
      console.error("❌ Error getting active accounts:", error.message);
      throw error;
    }
  }

  async deactivateAccount(accountId) {
    try {
      await execute("x_marketplace_accounts", "write", [
        [accountId],
        { 
          active: false,
          deactivated_at: new Date().toISOString()
        }
      ]);
      console.log(`✅ Deactivated account: ${accountId}`);
      return true;
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

      console.log(`✅ Refreshed access token for account ${accountId}`);
      return newTokenData.access_token;
    } catch (error) {
      console.error("❌ Error refreshing access token:", error.message);
      throw error;
    }
  }

  async refreshTokenForMarketplace(marketplace, refreshToken) {
    // This would be implemented based on each marketplace's OAuth flow
    // For now, return mock data
    const expireAt = new Date();
    expireAt.setHours(expireAt.getHours() + 24); // 24 hours from now

    return {
      access_token: `refreshed_token_${Date.now()}`,
      refresh_token: refreshToken,
      expire_at: expireAt.toISOString()
    };
  }

  async validateToken(accountId, token) {
    try {
      const account = await this.getAccountById(accountId);
      if (!account) {
        return { valid: false, reason: "Account not found" };
      }

      if (!account.active) {
        return { valid: false, reason: "Account is inactive" };
      }

      if (account.access_token !== token) {
        return { valid: false, reason: "Invalid token" };
      }

      if (account.expire_at && new Date(account.expire_at) <= new Date()) {
        return { valid: false, reason: "Token expired" };
      }

      return { valid: true, account };
    } catch (error) {
      console.error("❌ Error validating token:", error.message);
      throw error;
    }
  }

  // === SYNC OPERATIONS ===
  
  async updateLastSync(accountId) {
    try {
      await execute("x_marketplace_accounts", "write", [
        [accountId],
        { last_sync: new Date().toISOString() }
      ]);
      return true;
    } catch (error) {
      console.error("❌ Error updating last sync:", error.message);
      throw error;
    }
  }

  async getAccountsNeedingTokenRefresh() {
    try {
      const result = await execute("x_marketplace_accounts", "search", [
        [
          ["active", "=", true],
          ["expire_at", "<=", new Date().toISOString().slice(0, 19) + " 00:00:00"]
        ]
      ]);

      const accounts = await execute("x_marketplace_accounts", "read", [
        result,
        ["id", "marketplace", "shop_id", "expire_at"]
      ]);
      
      return accounts;
    } catch (error) {
      console.error("❌ Error getting accounts needing refresh:", error.message);
      throw error;
    }
  }

  // === COMPANY & WAREHOUSE VALIDATION ===
  
  async validateCompanyWarehouse(companyId, warehouseId) {
    try {
      // Validate company exists in Odoo
      const companyResult = await execute("res.company", "search", [
        [["id", "=", companyId]]
      ]);

      if (companyResult.length === 0) {
        throw new Error(`Company not found: ${companyId}`);
      }

      // Validate warehouse exists in Odoo
      const warehouseResult = await execute("stock.warehouse", "search", [
        [["id", "=", warehouseId]]
      ]);

      if (warehouseResult.length === 0) {
        throw new Error(`Warehouse not found: ${warehouseId}`);
      }

      // Validate warehouse belongs to company
      const warehouse = await execute("stock.warehouse", "read", [
        warehouseResult,
        ["id", "name", "company_id"]
      ]);

      if (warehouse[0].company_id[0] !== companyId) {
        throw new Error(`Warehouse ${warehouseId} does not belong to company ${companyId}`);
      }

      return { valid: true, company: companyResult[0], warehouse: warehouse[0] };
    } catch (error) {
      console.error("❌ Error validating company/warehouse:", error.message);
      throw error;
    }
  }

  // === BULK OPERATIONS ===
  
  async bulkCreateAccounts(accountsData) {
    try {
      console.log(`🔄 Starting bulk account creation...`);
      
      const results = [];
      for (const accountData of accountsData) {
        try {
          const accountId = await this.createAccount(accountData);
          results.push({ success: true, accountData, accountId });
        } catch (error) {
          results.push({ success: false, accountData, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Bulk account creation completed: ${successCount}/${accountsData.length} accounts`);
      
      return results;
    } catch (error) {
      console.error("❌ Error in bulk account creation:", error.message);
      throw error;
    }
  }

  async getAccountStats() {
    try {
      const accounts = await this.getAllAccounts();
      
      const stats = {
        total: accounts.length,
        active: accounts.filter(a => a.active).length,
        by_marketplace: {},
        expiring_soon: 0,
        expired: 0
      };

      // Count by marketplace
      accounts.forEach(account => {
        stats.by_marketplace[account.marketplace] = 
          (stats.by_marketplace[account.marketplace] || 0) + 1;

        // Check expiration
        if (account.expire_at) {
          const expireDate = new Date(account.expire_at);
          const now = new Date();
          const daysUntilExpiry = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24));
          
          if (daysUntilExpiry <= 0) {
            stats.expired++;
          } else if (daysUntilExpiry <= 7) {
            stats.expiring_soon++;
          }
        }
      });

      return stats;
    } catch (error) {
      console.error("❌ Error getting account stats:", error.message);
      throw error;
    }
  }
}

module.exports = new AccountService();
