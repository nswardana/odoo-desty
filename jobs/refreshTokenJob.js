// jobs/refreshTokenJob.js
// Cron job for refreshing marketplace tokens

const accountService = require('../services/accountService');
const marketplaceSyncService = require('../services/marketplaceSyncService');
const cron = require('node-cron');

class RefreshTokenJob {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0
    };
  }

  // Start the cron job
  start() {
    try {
      console.log('🔄 Starting Token Refresh Cron Job...');
      
      // Run every 30 minutes
      cron.schedule('*/30 * * * *', async () => {
        await this.execute();
      });

      // Also run once immediately on startup
      this.execute();

      console.log('✅ Token Refresh Cron Job started (runs every 30 minutes)');
    } catch (error) {
      console.error('❌ Error starting Token Refresh Cron Job:', error.message);
      throw error;
    }
  }

  // Execute token refresh
  async execute() {
    if (this.isRunning) {
      console.log('⏳ Token refresh job already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('🔄 Executing Token Refresh Job...');
      
      // Reset stats for this run
      this.stats = {
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0
      };

      // Get accounts needing token refresh
      const accountsNeedingRefresh = await accountService.getAccountsNeedingTokenRefresh();
      
      if (accountsNeedingRefresh.length === 0) {
        console.log('ℹ️ No accounts need token refresh');
        this.lastRun = new Date();
        this.isRunning = false;
        return;
      }

      console.log(`📊 Found ${accountsNeedingRefresh.length} accounts needing token refresh`);

      // Process each account
      for (const account of accountsNeedingRefresh) {
        try {
          await this.refreshAccountToken(account);
          this.stats.success++;
        } catch (error) {
          console.error(`❌ Failed to refresh token for account ${account.id}:`, error.message);
          this.stats.failed++;
          
          // Log failed refresh attempt
          await this.logFailedRefresh(account, error.message);
        }
        
        this.stats.total++;
        
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const duration = Date.now() - startTime;
      this.lastRun = new Date();

      console.log(`✅ Token Refresh Job completed in ${duration}ms:`, {
        total: this.stats.total,
        success: this.stats.success,
        failed: this.stats.failed,
        skipped: this.stats.skipped
      });

      // Send notification if there are failures
      if (this.stats.failed > 0) {
        await this.sendFailureNotification();
      }

    } catch (error) {
      console.error('❌ Token Refresh Job failed:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  // Refresh token for individual account
  async refreshAccountToken(account) {
    try {
      console.log(`🔄 Refreshing token for account: ${account.marketplace} - ${account.shop_id}`);

      // Check if token actually needs refresh (within 1 hour)
      const needsRefresh = this.needsRefresh(account);
      if (!needsRefresh) {
        console.log(`ℹ️ Token for account ${account.id} doesn't need refresh yet`);
        this.stats.skipped++;
        return;
      }

      // Refresh token based on marketplace
      const newTokenData = await this.refreshTokenForMarketplace(account);
      
      // Update account with new token
      await accountService.updateAccount(account.id, {
        access_token: newTokenData.access_token,
        refresh_token: newTokenData.refresh_token || account.refresh_token,
        expire_at: newTokenData.expire_at
      });

      // Test new token
      await this.testNewToken(account.marketplace, account.shop_id, newTokenData.access_token);

      console.log(`✅ Token refreshed successfully for account: ${account.id}`);
      
      // Log successful refresh
      await this.logSuccessfulRefresh(account, newTokenData);

      return newTokenData;
    } catch (error) {
      console.error(`❌ Error refreshing token for account ${account.id}:`, error.message);
      throw error;
    }
  }

  // Check if token needs refresh
  needsRefresh(account) {
    if (!account.expire_at) {
      return true; // No expiry date, refresh to be safe
    }

    const expireTime = new Date(account.expire_at);
    const oneHourFromNow = new Date(Date.now() + (60 * 60 * 1000)); // 1 hour from now
    
    return expireTime <= oneHourFromNow;
  }

  // Refresh token based on marketplace
  async refreshTokenForMarketplace(account) {
    switch (account.marketplace) {
      case 'shopee':
        return await this.refreshShopeeToken(account);
      case 'tokopedia':
        return await this.refreshTokopediaToken(account);
      case 'lazada':
        return await this.refreshLazadaToken(account);
      case 'tiktok':
        return await this.refreshTiktokToken(account);
      default:
        throw new Error(`Unsupported marketplace: ${account.marketplace}`);
    }
  }

  // Shopee token refresh
  async refreshShopeeToken(account) {
    try {
      console.log(`🔄 Refreshing Shopee token for shop: ${account.shop_id}`);
      
      // Shopee OAuth flow
      const tokenUrl = 'https://partner.shopeemobile.com/api/v2/auth/token_refresh';
      
      const response = await this.makeTokenRequest(tokenUrl, {
        refresh_token: account.refresh_token,
        partner_id: process.env.SHOPEE_PARTNER_ID || account.shop_id
      });

      const expireAt = new Date();
      expireAt.setHours(expireAt.getHours() + 24); // Shopee tokens typically last 24 hours

      return {
        access_token: response.access_token,
        refresh_token: response.refresh_token || account.refresh_token,
        expire_at: expireAt.toISOString()
      };
    } catch (error) {
      console.error(`❌ Shopee token refresh failed:`, error.message);
      throw error;
    }
  }

  // Tokopedia token refresh
  async refreshTokopediaToken(account) {
    try {
      console.log(`🔄 Refreshing Tokopedia token for shop: ${account.shop_id}`);
      
      // Tokopedia OAuth flow
      const tokenUrl = `https://fs.tokopedia.net/v1/fs/${account.shop_id}/token`;
      
      const response = await this.makeTokenRequest(tokenUrl, {
        refresh_token: account.refresh_token,
        grant_type: 'refresh_token'
      });

      const expireAt = new Date();
      expireAt.setHours(expireAt.getHours() + 24); // Tokopedia tokens typically last 24 hours

      return {
        access_token: response.access_token,
        refresh_token: response.refresh_token || account.refresh_token,
        expire_at: expireAt.toISOString()
      };
    } catch (error) {
      console.error(`❌ Tokopedia token refresh failed:`, error.message);
      throw error;
    }
  }

  // Lazada token refresh
  async refreshLazadaToken(account) {
    try {
      console.log(`🔄 Refreshing Lazada token for shop: ${account.shop_id}`);
      
      // Lazada OAuth flow
      const tokenUrl = 'https://auth.lazada.com/rest/token/refresh';
      
      const response = await this.makeTokenRequest(tokenUrl, {
        refresh_token: account.refresh_token
      });

      const expireAt = new Date();
      expireAt.setHours(expireAt.getHours() + 24); // Lazada tokens typically last 24 hours

      return {
        access_token: response.access_token,
        refresh_token: response.refresh_token || account.refresh_token,
        expire_at: expireAt.toISOString()
      };
    } catch (error) {
      console.error(`❌ Lazada token refresh failed:`, error.message);
      throw error;
    }
  }

  // TikTok token refresh
  async refreshTiktokToken(account) {
    try {
      console.log(`🔄 Refreshing TikTok token for shop: ${account.shop_id}`);
      
      // TikTok OAuth flow
      const tokenUrl = 'https://developer.tiktok.com/openapi/v1.2/token/refresh';
      
      const response = await this.makeTokenRequest(tokenUrl, {
        refresh_token: account.refresh_token,
        app_id: process.env.TIKTOK_APP_ID
      });

      const expireAt = new Date();
      expireAt.setHours(expireAt.getHours() + 24); // TikTok tokens typically last 24 hours

      return {
        access_token: response.access_token,
        refresh_token: response.refresh_token || account.refresh_token,
        expire_at: expireAt.toISOString()
      };
    } catch (error) {
      console.error(`❌ TikTok token refresh failed:`, error.message);
      throw error;
    }
  }

  // Make token request to marketplace
  async makeTokenRequest(url, data) {
    try {
      const axios = require('axios');
      
      const config = {
        method: 'POST',
        url: url,
        data: data,
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      };

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`❌ Token request failed to ${url}:`, error.message);
      throw error;
    }
  }

  // Test new token
  async testNewToken(marketplace, shopId, accessToken) {
    try {
      console.log(`🧪 Testing new token for ${marketplace} - ${shopId}`);
      
      // Make a simple API call to test the token
      switch (marketplace) {
        case 'shopee':
          await this.testShopeeToken(shopId, accessToken);
          break;
        case 'tokopedia':
          await this.testTokopediaToken(shopId, accessToken);
          break;
        case 'lazada':
          await this.testLazadaToken(accessToken);
          break;
        case 'tiktok':
          await this.testTiktokToken(shopId, accessToken);
          break;
      }

      console.log(`✅ Token test passed for ${marketplace} - ${shopId}`);
    } catch (error) {
      console.error(`❌ Token test failed for ${marketplace} - ${shopId}:`, error.message);
      throw error;
    }
  }

  // Test Shopee token
  async testShopeeToken(shopId, accessToken) {
    const axios = require('axios');
    const url = `https://partner.shopeemobile.com/api/v2/shop/get_shop_info`;
    
    const response = await axios.post(url, {
      shop_id: parseInt(shopId)
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data.shop_info) {
      throw new Error('Invalid token response');
    }
  }

  // Test Tokopedia token
  async testTokopediaToken(shopId, accessToken) {
    const axios = require('axios');
    const url = `https://fs.tokopedia.net/v1/fs/${shopId}/shop/info`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.data.data) {
      throw new Error('Invalid token response');
    }
  }

  // Test Lazada token
  async testLazadaToken(accessToken) {
    const axios = require('axios');
    const url = 'https://api.lazada.com.ph/rest/products/get';
    
    const response = await axios.get(url, {
      params: {
        filter: 'all',
        limit: 1
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.data.data) {
      throw new Error('Invalid token response');
    }
  }

  // Test TikTok token
  async testTiktokToken(shopId, accessToken) {
    const axios = require('axios');
    const url = 'https://developer.tiktok.com/openapi/v1.2/product/products';
    
    const response = await axios.get(url, {
      params: {
        page_size: 1
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Shop-Id': shopId
      }
    });

    if (!response.data.data) {
      throw new Error('Invalid token response');
    }
  }

  // === LOGGING ===
  
  async logSuccessfulRefresh(account, newTokenData) {
    try {
      console.log('📝 Successful token refresh logged:', {
        account_id: account.id,
        marketplace: account.marketplace,
        shop_id: account.shop_id,
        new_expire_at: newTokenData.expire_at
      });
    } catch (error) {
      console.error('❌ Error logging successful refresh:', error.message);
    }
  }

  async logFailedRefresh(account, errorMessage) {
    try {
      console.log('📝 Failed token refresh logged:', {
        account_id: account.id,
        marketplace: account.marketplace,
        shop_id: account.shop_id,
        error: errorMessage
      });
    } catch (error) {
      console.error('❌ Error logging failed refresh:', error.message);
    }
  }

  // === NOTIFICATIONS ===
  
  async sendFailureNotification() {
    try {
      if (this.stats.failed > 0) {
        console.warn(`⚠️ Token refresh failures detected: ${this.stats.failed}/${this.stats.total}`);
        
        // This could send email, Slack notification, etc.
        // For now, just log the warning
        console.log('📧 Failure notification would be sent here');
      }
    } catch (error) {
      console.error('❌ Error sending failure notification:', error.message);
    }
  }

  // === STATUS & MONITORING ===
  
  getStatus() {
    return {
      is_running: this.isRunning,
      last_run: this.lastRun,
      stats: this.stats,
      next_run: this.getNextRunTime()
    };
  }

  getNextRunTime() {
    // Calculate next run time (every 30 minutes)
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setMinutes(Math.ceil(now.getMinutes() / 30) * 30);
    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);
    
    if (nextRun <= now) {
      nextRun.setMinutes(nextRun.getMinutes() + 30);
    }
    
    return nextRun;
  }

  // Manual execution
  async runManually() {
    console.log('🔄 Manual token refresh triggered...');
    await this.execute();
  }

  // Stop the cron job
  stop() {
    try {
      console.log('🛑 Stopping Token Refresh Cron Job...');
      cron.getTasks().forEach(task => task.stop());
      console.log('✅ Token Refresh Cron Job stopped');
    } catch (error) {
      console.error('❌ Error stopping Token Refresh Cron Job:', error.message);
    }
  }
}

module.exports = new RefreshTokenJob();
