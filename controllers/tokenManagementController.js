// controllers/tokenManagementController.js
// Controller for token management operations

const tokenManagementService = require('../services/tokenManagementService');
const refreshTokenJob = require('../jobs/refreshTokenJob');

class TokenManagementController {
  
  // === TOKEN HEALTH ENDPOINTS ===
  
  // Get token health status
  async getTokenHealth(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const health = await tokenManagementService.getTokenHealth();
      
      res.json({
        status: 'success',
        token_health: health
      });
    } catch (error) {
      console.error('❌ Get token health error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get token expiry alerts
  async getExpiryAlerts(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { hours_ahead = 24 } = req.query;
      
      const alerts = await tokenManagementService.getExpiryAlerts(parseInt(hours_ahead));
      
      res.json({
        status: 'success',
        alerts: alerts,
        hours_ahead: parseInt(hours_ahead),
        total: alerts.length
      });
    } catch (error) {
      console.error('❌ Get expiry alerts error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === TOKEN REFRESH ENDPOINTS ===
  
  // Refresh token for specific account
  async refreshToken(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { account_id } = req.params;
      
      const account = await tokenManagementService.refreshTokenIfNeeded(parseInt(account_id));
      
      res.json({
        status: 'success',
        account: account,
        message: 'Token refreshed successfully'
      });
    } catch (error) {
      console.error('❌ Refresh token error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Refresh all tokens
  async refreshAllTokens(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const results = await tokenManagementService.refreshAllTokens();
      
      res.json({
        status: 'success',
        results: results,
        total: results.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Refresh all tokens error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Refresh tokens by marketplace
  async refreshTokensByMarketplace(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { marketplace } = req.params;
      
      const results = await tokenManagementService.refreshTokensByMarketplace(marketplace);
      
      res.json({
        status: 'success',
        marketplace: marketplace,
        results: results,
        total: results.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Refresh tokens by marketplace error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === TOKEN ROTATION ENDPOINTS ===
  
  // Rotate token (force refresh)
  async rotateToken(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { account_id } = req.params;
      const { force = false } = req.body;
      
      const account = await tokenManagementService.rotateToken(parseInt(account_id), force);
      
      res.json({
        status: 'success',
        account: account,
        message: 'Token rotated successfully'
      });
    } catch (error) {
      console.error('❌ Rotate token error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === SCHEDULED REFRESH ENDPOINTS ===
  
  // Schedule token refresh
  async scheduleRefresh(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { account_id } = req.params;
      const { delay_minutes = 0 } = req.body;
      
      await tokenManagementService.scheduleRefresh(parseInt(account_id), parseInt(delay_minutes));
      
      res.json({
        status: 'success',
        account_id: account_id,
        delay_minutes: delay_minutes,
        message: 'Token refresh scheduled'
      });
    } catch (error) {
      console.error('❌ Schedule refresh error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === CLEANUP ENDPOINTS ===
  
  // Cleanup expired tokens
  async cleanupExpiredTokens(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const results = await tokenManagementService.cleanupExpiredTokens();
      
      res.json({
        status: 'success',
        results: results,
        total: results.length,
        success: results.filter(r => r.success).length
      });
    } catch (error) {
      console.error('❌ Cleanup expired tokens error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === CRON JOB MANAGEMENT ===
  
  // Get refresh job status
  async getRefreshJobStatus(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const status = refreshTokenJob.getStatus();
      
      res.json({
        status: 'success',
        refresh_job: status
      });
    } catch (error) {
      console.error('❌ Get refresh job status error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Run refresh job manually
  async runRefreshJobManually(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      await refreshTokenJob.runManually();
      
      res.json({
        status: 'success',
        message: 'Refresh job executed manually'
      });
    } catch (error) {
      console.error('❌ Run refresh job manually error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === TOKEN VALIDATION ENDPOINTS ===
  
  // Validate token
  async validateToken(req, res) {
    try {
      const { account_id } = req.params;
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: 'token is required' });
      }

      const validation = await tokenManagementService.validateToken(parseInt(account_id), token);
      
      res.json({
        status: 'success',
        validation: validation
      });
    } catch (error) {
      console.error('❌ Validate token error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === TOKEN USAGE TRACKING ===
  
  // Track token usage
  async trackTokenUsage(req, res) {
    try {
      const { account_id } = req.params;
      const { operation, success = true } = req.body;
      
      if (!operation) {
        return res.status(400).json({ error: 'operation is required' });
      }

      const tracked = await tokenManagementService.trackTokenUsage(
        parseInt(account_id), 
        operation, 
        success
      );
      
      res.json({
        status: 'success',
        tracked: tracked
      });
    } catch (error) {
      console.error('❌ Track token usage error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === SERVICE MANAGEMENT ===
  
  // Initialize token management service
  async initializeService(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      await tokenManagementService.initialize();
      
      res.json({
        status: 'success',
        message: 'Token management service initialized'
      });
    } catch (error) {
      console.error('❌ Initialize service error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get service status
  async getServiceStatus(req, res) {
    try {
      const status = tokenManagementService.getStatus();
      
      res.json({
        status: 'success',
        service_status: status
      });
    } catch (error) {
      console.error('❌ Get service status error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Stop service
  async stopService(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      await tokenManagementService.stop();
      
      res.json({
        status: 'success',
        message: 'Token management service stopped'
      });
    } catch (error) {
      console.error('❌ Stop service error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === UTILITY ENDPOINTS ===
  
  // Test token refresh flow
  async testTokenRefresh(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { account_id } = req.params;
      
      // This would test the complete refresh flow without actually refreshing
      const account = await require('../services/accountService').getAccountById(parseInt(account_id));
      
      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const needsRefresh = tokenManagementService.needsRefresh(account);
      
      res.json({
        status: 'success',
        account: {
          id: account.id,
          marketplace: account.marketplace,
          shop_id: account.shop_id,
          expire_at: account.expire_at
        },
        needs_refresh: needsRefresh,
        test_result: 'Token refresh flow test completed'
      });
    } catch (error) {
      console.error('❌ Test token refresh error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === ADMIN ENDPOINTS ===
  
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

module.exports = new TokenManagementController();
