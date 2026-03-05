// controllers/authController.js
// Authentication and account management controller

const accountService = require('../services/accountService');
const tokenService = require('../services/tokenService');

class AuthController {
  
  // === AUTHENTICATION ENDPOINTS ===
  
  // Authenticate marketplace request
  async authenticateMarketplace(req, res) {
    try {
      const { marketplace, shop_id, access_token } = req.body;

      if (!marketplace || !shop_id || !access_token) {
        return res.status(400).json({ 
          error: 'marketplace, shop_id, and access_token are required' 
        });
      }

      // Get account from database
      const account = await accountService.getAccountByShop(marketplace, shop_id);
      
      if (!account) {
        return res.status(404).json({ 
          error: 'Account not found for this marketplace and shop' 
        });
      }

      // Validate token
      const validation = await accountService.validateToken(account.id, access_token);
      
      if (!validation.valid) {
        return res.status(401).json({ 
          error: validation.reason,
          code: 'INVALID_TOKEN'
        });
      }

      // Generate temporary auth token for API usage
      const authToken = await this.generateAuthToken(account);
      
      res.json({
        status: 'success',
        auth_token: authToken,
        account: {
          id: account.id,
          marketplace: account.marketplace,
          shop_id: account.shop_id,
          seller_id: account.seller_id,
          company_id: account.company_id,
          warehouse_id: account.warehouse_id
        },
        expires_in: 3600 // 1 hour
      });
    } catch (error) {
      console.error('❌ Authentication error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Refresh access token
  async refreshToken(req, res) {
    try {
      const { marketplace, shop_id, refresh_token } = req.body;

      if (!marketplace || !shop_id || !refresh_token) {
        return res.status(400).json({ 
          error: 'marketplace, shop_id, and refresh_token are required' 
        });
      }

      const account = await accountService.getAccountByShop(marketplace, shop_id);
      if (!account) {
        return res.status(404).json({ 
          error: 'Account not found' 
        });
      }

      if (account.refresh_token !== refresh_token) {
        return res.status(401).json({ 
          error: 'Invalid refresh token' 
        });
      }

      // Refresh the access token
      const newAccessToken = await accountService.refreshAccessToken(account.id);
      
      // Update last sync
      await accountService.updateLastSync(account.id);

      res.json({
        status: 'success',
        access_token: newAccessToken,
        account_id: account.id
      });
    } catch (error) {
      console.error('❌ Token refresh error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Validate auth token
  async validateAuthToken(req, res) {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Invalid authorization header' });
      }

      const authToken = authHeader.substring(7);
      const tokenData = await this.verifyAuthToken(authToken);
      
      if (!tokenData.valid) {
        return res.status(401).json({ 
          error: tokenData.reason,
          code: 'INVALID_AUTH_TOKEN'
        });
      }

      res.json({
        status: 'valid',
        account: tokenData.account,
        expires_at: tokenData.expires_at
      });
    } catch (error) {
      console.error('❌ Auth validation error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === ACCOUNT MANAGEMENT ENDPOINTS ===
  
  // Create new marketplace account
  async createAccount(req, res) {
    try {
      // Validate admin token (if required)
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const accountData = req.body;
      
      // Validate company and warehouse
      if (accountData.company_id && accountData.warehouse_id) {
        await accountService.validateCompanyWarehouse(
          accountData.company_id, 
          accountData.warehouse_id
        );
      }

      const accountId = await accountService.createAccount(accountData);
      
      res.json({
        status: 'success',
        account_id: accountId,
        message: 'Marketplace account created successfully'
      });
    } catch (error) {
      console.error('❌ Create account error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Update marketplace account
  async updateAccount(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { account_id } = req.params;
      const updateData = req.body;

      const success = await accountService.updateAccount(account_id, updateData);
      
      res.json({
        status: 'success',
        message: 'Account updated successfully'
      });
    } catch (error) {
      console.error('❌ Update account error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get account details
  async getAccount(req, res) {
    try {
      const { account_id } = req.params;
      
      const account = await accountService.getAccountById(account_id);
      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      // Remove sensitive data from response
      const safeAccount = { ...account };
      delete safeAccount.access_token;
      delete safeAccount.refresh_token;

      res.json({
        status: 'success',
        account: safeAccount
      });
    } catch (error) {
      console.error('❌ Get account error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // List all accounts
  async listAccounts(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { marketplace, active_only } = req.query;
      const accounts = await accountService.getAllAccounts(marketplace, active_only === 'true');

      // Remove sensitive data
      const safeAccounts = accounts.map(account => {
        const safe = { ...account };
        delete safe.access_token;
        delete safe.refresh_token;
        return safe;
      });

      res.json({
        status: 'success',
        accounts: safeAccounts,
        total: safeAccounts.length
      });
    } catch (error) {
      console.error('❌ List accounts error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Deactivate account
  async deactivateAccount(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { account_id } = req.params;
      const success = await accountService.deactivateAccount(account_id);
      
      res.json({
        status: 'success',
        message: 'Account deactivated successfully'
      });
    } catch (error) {
      console.error('❌ Deactivate account error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === UTILITY ENDPOINTS ===
  
  // Get account statistics
  async getAccountStats(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const stats = await accountService.getAccountStats();
      
      res.json({
        status: 'success',
        stats: stats
      });
    } catch (error) {
      console.error('❌ Get stats error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get accounts needing token refresh
  async getAccountsNeedingRefresh(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const accounts = await accountService.getAccountsNeedingTokenRefresh();
      
      res.json({
        status: 'success',
        accounts: accounts,
        total: accounts.length
      });
    } catch (error) {
      console.error('❌ Get refresh accounts error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Bulk create accounts
  async bulkCreateAccounts(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { accounts } = req.body;
      if (!accounts || !Array.isArray(accounts)) {
        return res.status(400).json({ error: 'accounts array is required' });
      }

      const results = await accountService.bulkCreateAccounts(accounts);
      
      res.json({
        status: 'success',
        results: results,
        total: accounts.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Bulk create error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === HELPER METHODS ===
  
  // Generate temporary auth token
  async generateAuthToken(account) {
    const tokenData = {
      account_id: account.id,
      marketplace: account.marketplace,
      shop_id: account.shop_id,
      generated_at: new Date().toISOString()
    };

    // Generate JWT-like token (simplified)
    const payload = JSON.stringify(tokenData);
    const authToken = Buffer.from(payload).toString('base64');
    
    // Store token in cache (in production, use Redis)
    const tokenCache = global.tokenCache || new Map();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);
    
    tokenCache.set(authToken, {
      ...tokenData,
      expires_at: expiresAt
    });

    return authToken;
  }

  // Verify auth token
  async verifyAuthToken(authToken) {
    const tokenCache = global.tokenCache || new Map();
    const tokenData = tokenCache.get(authToken);
    
    if (!tokenData) {
      return { valid: false, reason: 'Token not found' };
    }

    if (new Date(tokenData.expires_at) <= new Date()) {
      tokenCache.delete(authToken);
      return { valid: false, reason: 'Token expired' };
    }

    return { 
      valid: true, 
      account: {
        id: tokenData.account_id,
        marketplace: tokenData.marketplace,
        shop_id: tokenData.shop_id
      },
      expires_at: tokenData.expires_at
    };
  }

  // Validate admin token
  validateAdminToken(req) {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken) {
      console.warn("⚠️ Admin token not configured - skipping validation");
      return true;
    }

    const authHeader = req.headers['x-admin-token'];
    return authHeader === adminToken;
  }

  // Middleware for auth validation
  authMiddleware() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Authorization required' });
        }

        const authToken = authHeader.substring(7);
        const validation = await this.verifyAuthToken(authToken);
        
        if (!validation.valid) {
          return res.status(401).json({ error: validation.reason });
        }

        req.auth = validation.account;
        next();
      } catch (error) {
        console.error('❌ Auth middleware error:', error.message);
        res.status(500).json({ error: error.message });
      }
    };
  }

  // Admin middleware
  adminMiddleware() {
    return (req, res, next) => {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }
      next();
    };
  }
}

module.exports = new AuthController();
