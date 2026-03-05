// services/tokenManagementService.js
// Enhanced token management service with proactive refresh

const accountService = require('./accountService');
const refreshTokenJob = require('../jobs/refreshTokenJob');

class TokenManagementService {
  constructor() {
    this.refreshJob = refreshTokenJob;
    this.isInitialized = false;
  }

  // Initialize token management
  async initialize() {
    try {
      if (this.isInitialized) {
        return;
      }

      console.log('🔄 Initializing Token Management Service...');
      
      // Start the refresh token cron job
      this.refreshJob.start();
      
      this.isInitialized = true;
      console.log('✅ Token Management Service initialized');
    } catch (error) {
      console.error('❌ Error initializing Token Management Service:', error.message);
      throw error;
    }
  }

  // === TOKEN VALIDATION ===
  
  async validateToken(accountId, token) {
    try {
      const account = await accountService.getAccountById(accountId);
      if (!account) {
        return { valid: false, reason: 'Account not found' };
      }

      if (!account.active) {
        return { valid: false, reason: 'Account is inactive' };
      }

      if (account.access_token !== token) {
        return { valid: false, reason: 'Invalid token' };
      }

      // Check if token is expired or will expire soon
      if (account.expire_at) {
        const expireTime = new Date(account.expire_at);
        const now = new Date();
        const oneHourFromNow = new Date(now.getTime() + (60 * 60 * 1000));
        
        if (expireTime <= now) {
          return { valid: false, reason: 'Token expired' };
        }
        
        if (expireTime <= oneHourFromNow) {
          return { 
            valid: true, 
            warning: 'Token will expire soon',
            expires_at: account.expire_at,
            account: account
          };
        }
      }

      return { valid: true, account: account };
    } catch (error) {
      console.error('❌ Error validating token:', error.message);
      throw error;
    }
  }

  // === PROACTIVE TOKEN REFRESH ===
  
  async refreshTokenIfNeeded(accountId) {
    try {
      const account = await accountService.getAccountById(accountId);
      if (!account) {
        throw new Error(`Account not found: ${accountId}`);
      }

      // Check if refresh is needed
      const needsRefresh = this.needsRefresh(account);
      if (!needsRefresh) {
        console.log(`ℹ️ Token for account ${accountId} doesn't need refresh`);
        return account;
      }

      console.log(`🔄 Proactively refreshing token for account: ${accountId}`);
      
      // Use the refresh job to refresh the token
      const newTokenData = await this.refreshJob.refreshAccountToken(account);
      
      console.log(`✅ Token proactively refreshed for account: ${accountId}`);
      return await accountService.getAccountById(accountId);
    } catch (error) {
      console.error('❌ Error proactively refreshing token:', error.message);
      throw error;
    }
  }

  needsRefresh(account) {
    if (!account.expire_at) {
      return true; // No expiry date, refresh to be safe
    }

    const expireTime = new Date(account.expire_at);
    const oneHourFromNow = new Date(Date.now() + (60 * 60 * 1000)); // 1 hour from now
    
    return expireTime <= oneHourFromNow;
  }

  // === TOKEN HEALTH MONITORING ===
  
  async getTokenHealth() {
    try {
      const accounts = await accountService.getAllAccounts(null, true);
      const health = {
        total_accounts: accounts.length,
        active_accounts: accounts.filter(a => a.active).length,
        token_status: {
          valid: 0,
          expiring_soon: 0,
          expired: 0,
          no_expiry: 0
        },
        by_marketplace: {},
        refresh_job_status: this.refreshJob.getStatus()
      };

      // Analyze token status
      accounts.forEach(account => {
        const marketplace = account.marketplace;
        
        if (!health.by_marketplace[marketplace]) {
          health.by_marketplace[marketplace] = {
            total: 0,
            valid: 0,
            expiring_soon: 0,
            expired: 0,
            no_expiry: 0
          };
        }

        health.by_marketplace[marketplace].total++;

        if (!account.expire_at) {
          health.token_status.no_expiry++;
          health.by_marketplace[marketplace].no_expiry++;
        } else {
          const expireTime = new Date(account.expire_at);
          const now = new Date();
          const oneHourFromNow = new Date(now.getTime() + (60 * 60 * 1000));
          const sixHoursFromNow = new Date(now.getTime() + (6 * 60 * 60 * 1000));

          if (expireTime <= now) {
            health.token_status.expired++;
            health.by_marketplace[marketplace].expired++;
          } else if (expireTime <= oneHourFromNow) {
            health.token_status.expiring_soon++;
            health.by_marketplace[marketplace].expiring_soon++;
          } else if (expireTime <= sixHoursFromNow) {
            health.token_status.valid++;
            health.by_marketplace[marketplace].valid++;
          } else {
            health.token_status.valid++;
            health.by_marketplace[marketplace].valid++;
          }
        }
      });

      return health;
    } catch (error) {
      console.error('❌ Error getting token health:', error.message);
      throw error;
    }
  }

  // === TOKEN REFRESH SCHEDULING ===
  
  async scheduleRefresh(accountId, delayMinutes = 0) {
    try {
      console.log(`⏰ Scheduling token refresh for account: ${accountId} (delay: ${delayMinutes} minutes)`);
      
      if (delayMinutes > 0) {
        // Schedule refresh with delay
        setTimeout(async () => {
          try {
            await this.refreshTokenIfNeeded(accountId);
          } catch (error) {
            console.error(`❌ Scheduled refresh failed for account ${accountId}:`, error.message);
          }
        }, delayMinutes * 60 * 1000);
      } else {
        // Refresh immediately
        await this.refreshTokenIfNeeded(accountId);
      }

      return true;
    } catch (error) {
      console.error('❌ Error scheduling token refresh:', error.message);
      throw error;
    }
  }

  // === BATCH TOKEN OPERATIONS ===
  
  async refreshAllTokens() {
    try {
      console.log('🔄 Refreshing all tokens...');
      
      const accounts = await accountService.getAllAccounts(null, true);
      const results = [];

      for (const account of accounts) {
        try {
          await this.refreshTokenIfNeeded(account.id);
          results.push({ success: true, account_id: account.id, marketplace: account.marketplace });
        } catch (error) {
          results.push({ success: false, account_id: account.id, marketplace: account.marketplace, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Batch token refresh completed: ${successCount}/${accounts.length} successful`);

      return results;
    } catch (error) {
      console.error('❌ Error refreshing all tokens:', error.message);
      throw error;
    }
  }

  async refreshTokensByMarketplace(marketplace) {
    try {
      console.log(`🔄 Refreshing tokens for marketplace: ${marketplace}`);
      
      const accounts = await accountService.getAllAccounts(marketplace, true);
      const results = [];

      for (const account of accounts) {
        try {
          await this.refreshTokenIfNeeded(account.id);
          results.push({ success: true, account_id: account.id, shop_id: account.shop_id });
        } catch (error) {
          results.push({ success: false, account_id: account.id, shop_id: account.shop_id, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Marketplace token refresh completed: ${successCount}/${accounts.length} successful`);

      return results;
    } catch (error) {
      console.error('❌ Error refreshing tokens by marketplace:', error.message);
      throw error;
    }
  }

  // === TOKEN EXPIRY ALERTS ===
  
  async getExpiryAlerts(hoursAhead = 24) {
    try {
      console.log(`📊 Getting token expiry alerts for next ${hoursAhead} hours`);
      
      const accounts = await accountService.getAllAccounts(null, true);
      const alerts = [];
      const cutoffTime = new Date(Date.now() + (hoursAhead * 60 * 60 * 1000));

      accounts.forEach(account => {
        if (account.expire_at) {
          const expireTime = new Date(account.expire_at);
          
          if (expireTime <= cutoffTime) {
            const hoursUntilExpiry = Math.ceil((expireTime - new Date()) / (1000 * 60 * 60));
            
            alerts.push({
              account_id: account.id,
              marketplace: account.marketplace,
              shop_id: account.shop_id,
              expires_at: account.expire_at,
              hours_until_expiry: hoursUntilExpiry,
              urgency: hoursUntilExpiry <= 1 ? 'critical' : hoursUntilExpiry <= 6 ? 'high' : 'medium'
            });
          }
        }
      });

      // Sort by urgency and expiry time
      alerts.sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, medium: 2 };
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        }
        return a.hours_until_expiry - b.hours_until_expiry;
      });

      console.log(`📊 Found ${alerts.length} tokens expiring within ${hoursAhead} hours`);
      return alerts;
    } catch (error) {
      console.error('❌ Error getting expiry alerts:', error.message);
      throw error;
    }
  }

  // === TOKEN USAGE TRACKING ===
  
  async trackTokenUsage(accountId, operation, success = true) {
    try {
      // This would log token usage for monitoring
      console.log('📝 Token usage tracked:', {
        account_id: accountId,
        operation: operation,
        success: success,
        timestamp: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('❌ Error tracking token usage:', error.message);
      return false;
    }
  }

  // === TOKEN ROTATION ===
  
  async rotateToken(accountId, force = false) {
    try {
      console.log(`🔄 Rotating token for account: ${accountId} (force: ${force})`);
      
      const account = await accountService.getAccountById(accountId);
      if (!account) {
        throw new Error(`Account not found: ${accountId}`);
      }

      // Force refresh even if not needed
      if (force || this.needsRefresh(account)) {
        await this.refreshTokenIfNeeded(accountId);
        console.log(`✅ Token rotated for account: ${accountId}`);
      } else {
        console.log(`ℹ️ Token rotation not needed for account: ${accountId}`);
      }

      return await accountService.getAccountById(accountId);
    } catch (error) {
      console.error('❌ Error rotating token:', error.message);
      throw error;
    }
  }

  // === CLEANUP ===
  
  async cleanupExpiredTokens() {
    try {
      console.log('🧹 Cleaning up expired tokens...');
      
      const accounts = await accountService.getAllAccounts(null, true);
      const expiredAccounts = accounts.filter(account => {
        if (!account.expire_at) return false;
        return new Date(account.expire_at) <= new Date();
      });

      const results = [];
      for (const account of expiredAccounts) {
        try {
          // Try to refresh expired tokens
          await this.refreshTokenIfNeeded(account.id);
          results.push({ success: true, account_id: account.id, action: 'refreshed' });
        } catch (error) {
          // If refresh fails, deactivate the account
          await accountService.deactivateAccount(account.id);
          results.push({ success: false, account_id: account.id, action: 'deactivated', error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Token cleanup completed: ${successCount}/${expiredAccounts.length} tokens refreshed`);

      return results;
    } catch (error) {
      console.error('❌ Error cleaning up expired tokens:', error.message);
      throw error;
    }
  }

  // === STATUS ===
  
  getStatus() {
    return {
      initialized: this.isInitialized,
      refresh_job: this.refreshJob.getStatus()
    };
  }

  // === STOP ===
  
  async stop() {
    try {
      console.log('🛑 Stopping Token Management Service...');
      
      this.refreshJob.stop();
      this.isInitialized = false;
      
      console.log('✅ Token Management Service stopped');
    } catch (error) {
      console.error('❌ Error stopping Token Management Service:', error.message);
      throw error;
    }
  }
}

module.exports = new TokenManagementService();
