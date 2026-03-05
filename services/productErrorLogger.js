// services/productErrorLogger.js
// Service for logging product-related errors and admin notifications

class ProductErrorLogger {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 1000;
  }

  // Log product not found error
  async logProductNotFound(orderData, missingSkus) {
    try {
      const errorEntry = {
        timestamp: new Date().toISOString(),
        error_type: 'PRODUCT_NOT_FOUND',
        marketplace: orderData.marketplace,
        shop_id: orderData.shop_id,
        marketplace_order_id: orderData.marketplace_order_id,
        customer: orderData.customer?.name || 'Unknown',
        missing_skus: missingSkus,
        order_data: orderData,
        status: 'PENDING_ADMIN_ACTION',
        severity: 'HIGH',
        action_required: 'CREATE_PRODUCTS',
        recommended_action: 'Admin should create missing products in Odoo and map SKUs'
      };

      // Add to log
      this.errorLog.push(errorEntry);
      
      // Trim log if too large
      if (this.errorLog.length > this.maxLogSize) {
        this.errorLog = this.errorLog.slice(-this.maxLogSize);
      }

      // Log to console
      console.error('🚨 PRODUCT NOT FOUND ERROR:', {
        marketplace: errorEntry.marketplace,
        shop_id: errorEntry.shop_id,
        order_id: errorEntry.marketplace_order_id,
        missing_skus: missingSkus,
        action: 'Order FAILED - Admin action required'
      });

      // Log to file/database (implement as needed)
      await this.persistErrorLog(errorEntry);

      // Send admin notification (implement as needed)
      await this.sendAdminNotification(errorEntry);

      return errorEntry;
    } catch (error) {
      console.error('❌ Error logging product not found:', error.message);
      throw error;
    }
  }

  // Log insufficient stock error
  async logInsufficientStock(orderData, stockIssues) {
    try {
      const errorEntry = {
        timestamp: new Date().toISOString(),
        error_type: 'INSUFFICIENT_STOCK',
        marketplace: orderData.marketplace,
        shop_id: orderData.shop_id,
        marketplace_order_id: orderData.marketplace_order_id,
        customer: orderData.customer?.name || 'Unknown',
        stock_issues: stockIssues,
        order_data: orderData,
        status: 'PENDING_ADMIN_ACTION',
        severity: 'MEDIUM',
        action_required: 'CHECK_INVENTORY',
        recommended_action: 'Admin should check inventory levels and restock if needed'
      };

      this.errorLog.push(errorEntry);
      
      if (this.errorLog.length > this.maxLogSize) {
        this.errorLog = this.errorLog.slice(-this.maxLogSize);
      }

      console.error('🚨 INSUFFICIENT STOCK ERROR:', {
        marketplace: errorEntry.marketplace,
        shop_id: errorEntry.shop_id,
        order_id: errorEntry.marketplace_order_id,
        stock_issues: stockIssues,
        action: 'Order FAILED - Admin action required'
      });

      await this.persistErrorLog(errorEntry);
      await this.sendAdminNotification(errorEntry);

      return errorEntry;
    } catch (error) {
      console.error('❌ Error logging insufficient stock:', error.message);
      throw error;
    }
  }

  // Get error statistics
  getErrorStats() {
    try {
      const stats = {
        total_errors: this.errorLog.length,
        by_type: {},
        by_marketplace: {},
        by_severity: {
          HIGH: 0,
          MEDIUM: 0,
          LOW: 0
        },
        pending_action: 0,
        recent_errors: this.errorLog.slice(-10)
      };

      this.errorLog.forEach(error => {
        // By type
        stats.by_type[error.error_type] = (stats.by_type[error.error_type] || 0) + 1;
        
        // By marketplace
        stats.by_marketplace[error.marketplace] = (stats.by_marketplace[error.marketplace] || 0) + 1;
        
        // By severity
        stats.by_severity[error.severity] = (stats.by_severity[error.severity] || 0) + 1;
        
        // Pending action
        if (error.status === 'PENDING_ADMIN_ACTION') {
          stats.pending_action++;
        }
      });

      return stats;
    } catch (error) {
      console.error('❌ Error getting error stats:', error.message);
      throw error;
    }
  }

  // Get errors by marketplace
  getErrorsByMarketplace(marketplace, limit = 50) {
    try {
      const errors = this.errorLog
        .filter(error => error.marketplace === marketplace)
        .slice(-limit)
        .reverse(); // Most recent first

      return errors;
    } catch (error) {
      console.error('❌ Error getting errors by marketplace:', error.message);
      throw error;
    }
  }

  // Get pending errors
  getPendingErrors(limit = 100) {
    try {
      const pendingErrors = this.errorLog
        .filter(error => error.status === 'PENDING_ADMIN_ACTION')
        .slice(-limit)
        .reverse();

      return pendingErrors;
    } catch (error) {
      console.error('❌ Error getting pending errors:', error.message);
      throw error;
    }
  }

  // Mark error as resolved
  async markErrorResolved(errorId, resolution, adminId) {
    try {
      const errorIndex = this.errorLog.findIndex(error => error.id === errorId);
      if (errorIndex === -1) {
        throw new Error(`Error not found: ${errorId}`);
      }

      this.errorLog[errorIndex].status = 'RESOLVED';
      this.errorLog[errorIndex].resolution = resolution;
      this.errorLog[errorIndex].resolved_by = adminId;
      this.errorLog[errorIndex].resolved_at = new Date().toISOString();

      console.log(`✅ Error marked as resolved: ${errorId} by ${adminId}`);
      
      return this.errorLog[errorIndex];
    } catch (error) {
      console.error('❌ Error marking error as resolved:', error.message);
      throw error;
    }
  }

  // Generate admin report
  generateAdminReport() {
    try {
      const stats = this.getErrorStats();
      const pendingErrors = this.getPendingErrors(20);

      const report = {
        generated_at: new Date().toISOString(),
        summary: {
          total_errors: stats.total_errors,
          pending_action: stats.pending_action,
          high_severity: stats.by_severity.HIGH,
          medium_severity: stats.by_severity.MEDIUM
        },
        breakdown: {
          by_type: stats.by_type,
          by_marketplace: stats.by_marketplace
        },
        urgent_actions: pendingErrors.filter(error => error.severity === 'HIGH'),
        all_pending_errors: pendingErrors,
        recommendations: this.generateRecommendations(stats)
      };

      return report;
    } catch (error) {
      console.error('❌ Error generating admin report:', error.message);
      throw error;
    }
  }

  // Generate recommendations based on error patterns
  generateRecommendations(stats) {
    const recommendations = [];

    if (stats.by_type.PRODUCT_NOT_FOUND > 0) {
      recommendations.push({
        type: 'PRODUCT_MAPPING',
        priority: 'HIGH',
        message: `${stats.by_type.PRODUCT_NOT_FOUND} orders failed due to missing products. Consider bulk product import or SKU mapping.`,
        action: 'Create missing products in Odoo'
      });
    }

    if (stats.by_type.INSUFFICIENT_STOCK > 5) {
      recommendations.push({
        type: 'INVENTORY_MANAGEMENT',
        priority: 'MEDIUM',
        message: `${stats.by_type.INSUFFICIENT_STOCK} orders failed due to insufficient stock. Review inventory levels.`,
        action: 'Restock products or adjust safety stock levels'
      });
    }

    const highSeverityErrors = stats.by_severity.HIGH;
    if (highSeverityErrors > 10) {
      recommendations.push({
        type: 'SYSTEM_HEALTH',
        priority: 'HIGH',
        message: `${highSeverityErrors} high severity errors detected. Immediate attention required.`,
        action: 'Review error patterns and address root causes'
      });
    }

    return recommendations;
  }

  // Persist error log (implement based on your storage)
  async persistErrorLog(errorEntry) {
    try {
      // This would persist to database or file
      // For now, just log to console
      console.log('📝 Error logged to persistent storage:', errorEntry.error_type);
    } catch (error) {
      console.error('❌ Error persisting log:', error.message);
    }
  }

  // Send admin notification (implement based on your notification system)
  async sendAdminNotification(errorEntry) {
    try {
      // This would send email, Slack, or other notifications
      console.log('📧 Admin notification sent for:', errorEntry.error_type);
      
      // For high severity errors, send immediate notification
      if (errorEntry.severity === 'HIGH') {
        console.log('🚨 URGENT: High severity error detected - immediate admin notification sent');
      }
    } catch (error) {
      console.error('❌ Error sending admin notification:', error.message);
    }
  }

  // Clear old logs
  clearOldLogs(olderThanHours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - (olderThanHours * 60 * 60 * 1000));
      
      const beforeCount = this.errorLog.length;
      this.errorLog = this.errorLog.filter(error => new Date(error.timestamp) > cutoffTime);
      const clearedCount = beforeCount - this.errorLog.length;

      console.log(`🧹 Cleared ${clearedCount} old error logs (older than ${olderThanHours} hours)`);
      
      return clearedCount;
    } catch (error) {
      console.error('❌ Error clearing old logs:', error.message);
      throw error;
    }
  }

  // Get error by ID
  getErrorById(errorId) {
    try {
      return this.errorLog.find(error => error.id === errorId);
    } catch (error) {
      console.error('❌ Error getting error by ID:', error.message);
      throw error;
    }
  }

  // Search errors
  searchErrors(query, filters = {}) {
    try {
      let results = this.errorLog;

      // Apply filters
      if (filters.marketplace) {
        results = results.filter(error => error.marketplace === filters.marketplace);
      }
      
      if (filters.error_type) {
        results = results.filter(error => error.error_type === filters.error_type);
      }
      
      if (filters.severity) {
        results = results.filter(error => error.severity === filters.severity);
      }
      
      if (filters.status) {
        results = results.filter(error => error.status === filters.status);
      }

      // Apply text search
      if (query) {
        const lowerQuery = query.toLowerCase();
        results = results.filter(error => 
          error.marketplace_order_id?.toLowerCase().includes(lowerQuery) ||
          error.missing_skus?.some(sku => sku.toLowerCase().includes(lowerQuery)) ||
          error.customer?.toLowerCase().includes(lowerQuery)
        );
      }

      return results.slice(-100); // Return last 100 results
    } catch (error) {
      console.error('❌ Error searching errors:', error.message);
      throw error;
    }
  }
}

module.exports = new ProductErrorLogger();
