// controllers/errorManagementController.js
// Controller for product error management and admin operations

const productErrorLogger = require('../services/productErrorLogger');

class ErrorManagementController {
  
  // === ERROR REPORTING ENDPOINTS ===
  
  // Get comprehensive error report
  async getErrorReport(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const report = productErrorLogger.generateAdminReport();
      
      res.json({
        status: 'success',
        report: report
      });
    } catch (error) {
      console.error('❌ Get error report error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get error statistics
  async getErrorStats(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const stats = productErrorLogger.getErrorStats();
      
      res.json({
        status: 'success',
        stats: stats
      });
    } catch (error) {
      console.error('❌ Get error stats error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get pending errors
  async getPendingErrors(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { limit = 100 } = req.query;
      const pendingErrors = productErrorLogger.getPendingErrors(parseInt(limit));
      
      res.json({
        status: 'success',
        pending_errors: pendingErrors,
        total: pendingErrors.length
      });
    } catch (error) {
      console.error('❌ Get pending errors error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get errors by marketplace
  async getErrorsByMarketplace(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { marketplace } = req.params;
      const { limit = 50 } = req.query;
      
      const errors = productErrorLogger.getErrorsByMarketplace(marketplace, parseInt(limit));
      
      res.json({
        status: 'success',
        marketplace: marketplace,
        errors: errors,
        total: errors.length
      });
    } catch (error) {
      console.error('❌ Get errors by marketplace error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === ERROR RESOLUTION ENDPOINTS ===
  
  // Mark error as resolved
  async resolveError(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { error_id } = req.params;
      const { resolution, admin_id } = req.body;
      
      if (!resolution || !admin_id) {
        return res.status(400).json({ error: 'resolution and admin_id are required' });
      }

      const resolvedError = await productErrorLogger.markErrorResolved(error_id, resolution, admin_id);
      
      res.json({
        status: 'success',
        error: resolvedError,
        message: 'Error marked as resolved'
      });
    } catch (error) {
      console.error('❌ Resolve error error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Bulk resolve errors
  async bulkResolveErrors(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { error_ids, resolution, admin_id } = req.body;
      
      if (!error_ids || !Array.isArray(error_ids) || !resolution || !admin_id) {
        return res.status(400).json({ error: 'error_ids (array), resolution, and admin_id are required' });
      }

      const results = [];
      for (const errorId of error_ids) {
        try {
          const resolvedError = await productErrorLogger.markErrorResolved(errorId, resolution, admin_id);
          results.push({ success: true, error_id: errorId, error: resolvedError });
        } catch (error) {
          results.push({ success: false, error_id: errorId, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      res.json({
        status: 'success',
        results: results,
        total: error_ids.length,
        success: successCount,
        message: `Resolved ${successCount}/${error_ids.length} errors`
      });
    } catch (error) {
      console.error('❌ Bulk resolve errors error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === ERROR SEARCH ENDPOINTS ===
  
  // Search errors
  async searchErrors(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { q: query, marketplace, error_type, severity, status, limit = 100 } = req.query;
      
      const filters = {};
      if (marketplace) filters.marketplace = marketplace;
      if (error_type) filters.error_type = error_type;
      if (severity) filters.severity = severity;
      if (status) filters.status = status;

      const errors = productErrorLogger.searchErrors(query, filters);
      const limitedErrors = errors.slice(0, parseInt(limit));
      
      res.json({
        status: 'success',
        query: query,
        filters: filters,
        errors: limitedErrors,
        total: errors.length,
        returned: limitedErrors.length
      });
    } catch (error) {
      console.error('❌ Search errors error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get error by ID
  async getErrorById(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { error_id } = req.params;
      
      const error = productErrorLogger.getErrorById(error_id);
      
      if (!error) {
        return res.status(404).json({ error: 'Error not found' });
      }

      res.json({
        status: 'success',
        error: error
      });
    } catch (error) {
      console.error('❌ Get error by ID error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === LOG MANAGEMENT ENDPOINTS ===
  
  // Clear old logs
  async clearOldLogs(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { older_than_hours = 24 } = req.body;
      
      const clearedCount = productErrorLogger.clearOldLogs(parseInt(older_than_hours));
      
      res.json({
        status: 'success',
        cleared_count: clearedCount,
        older_than_hours: older_than_hours,
        message: `Cleared ${clearedCount} old error logs`
      });
    } catch (error) {
      console.error('❌ Clear old logs error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Get log size and status
  async getLogStatus(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const stats = productErrorLogger.getErrorStats();
      
      const logStatus = {
        total_errors: stats.total_errors,
        max_log_size: 1000,
        current_size: stats.total_errors,
        usage_percentage: (stats.total_errors / 1000) * 100,
        pending_action: stats.pending_action,
        oldest_error: stats.total_errors > 0 ? 'Check individual errors' : null,
        newest_error: stats.total_errors > 0 ? 'Check individual errors' : null
      };
      
      res.json({
        status: 'success',
        log_status: logStatus
      });
    } catch (error) {
      console.error('❌ Get log status error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === DASHBOARD ENDPOINTS ===
  
  // Get dashboard data
  async getDashboardData(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const stats = productErrorLogger.getErrorStats();
      const recentErrors = productErrorLogger.getPendingErrors(10);
      const urgentErrors = recentErrors.filter(error => error.severity === 'HIGH');

      const dashboardData = {
        summary: {
          total_errors: stats.total_errors,
          pending_action: stats.pending_action,
          high_severity: stats.by_severity.HIGH,
          medium_severity: stats.by_severity.MEDIUM,
          low_severity: stats.by_severity.LOW
        },
        breakdown: {
          by_type: stats.by_type,
          by_marketplace: stats.by_marketplace
        },
        urgent_actions: urgentErrors,
        recent_errors: recentErrors.slice(0, 5),
        recommendations: productErrorLogger.generateRecommendations(stats)
      };
      
      res.json({
        status: 'success',
        dashboard: dashboardData
      });
    } catch (error) {
      console.error('❌ Get dashboard data error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // === UTILITY ENDPOINTS ===
  
  // Test error logging
  async testErrorLogging(req, res) {
    try {
      if (!this.validateAdminToken(req)) {
        return res.status(401).json({ error: 'Admin access required' });
      }

      const { error_type = 'TEST_ERROR' } = req.body;
      
      // Create test error
      const testOrderData = {
        marketplace: 'test',
        shop_id: 'TEST001',
        marketplace_order_id: 'TEST_ORDER_123',
        customer: { name: 'Test Customer' },
        items: [{ sku: 'TEST_SKU', name: 'Test Product', quantity: 1, price: 10000 }]
      };

      const testMissingSkus = [{ sku: 'TEST_SKU', name: 'Test Product', quantity: 1, price: 10000 }];

      const loggedError = await productErrorLogger.logProductNotFound(testOrderData, testMissingSkus);
      
      res.json({
        status: 'success',
        test_error: loggedError,
        message: 'Test error logged successfully'
      });
    } catch (error) {
      console.error('❌ Test error logging error:', error.message);
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

module.exports = new ErrorManagementController();
