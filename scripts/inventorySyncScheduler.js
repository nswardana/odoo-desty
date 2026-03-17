// scripts/inventorySyncScheduler.js
// Scheduler for inventory synchronization jobs

const cron = require('node-cron');
const inventorySyncJob = require('../jobs/inventorySyncJob');

class InventorySyncScheduler {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  // Start all scheduled jobs
  start() {
    if (this.isRunning) {
      console.log('⚠️ Inventory sync scheduler already running');
      return;
    }

    console.log('🚀 Starting inventory sync scheduler...');
    this.isRunning = true;

    // Schedule main sync job (every hour)
    this.scheduleMainSync();

    // Schedule health check (every 30 minutes)
    this.scheduleHealthCheck();

    // Schedule cleanup (daily at 2 AM)
    this.scheduleCleanup();

    // Schedule stock validation (every 6 hours)
    this.scheduleStockValidation();

    console.log('✅ Inventory sync scheduler started');
  }

  // Stop all scheduled jobs
  stop() {
    console.log('🛑 Stopping inventory sync scheduler...');
    
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`⏹️ Stopped job: ${name}`);
    });
    
    this.jobs.clear();
    this.isRunning = false;
    
    console.log('✅ Inventory sync scheduler stopped');
  }

  // Schedule main sync job
  scheduleMainSync() {
    const cronExpression = process.env.INVENTORY_SYNC_CRON || '0 * * * *'; // Every hour
    
    const job = cron.schedule(cronExpression, async () => {
      console.log('⏰ Running scheduled inventory sync...');
      
      try {
        await inventorySyncJob.run();
      } catch (error) {
        console.error('❌ Scheduled inventory sync failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Jakarta'
    });

    this.jobs.set('mainSync', job);
    console.log(`📅 Main sync scheduled: ${cronExpression}`);
  }

  // Schedule health check
  scheduleHealthCheck() {
    const job = cron.schedule('*/30 * * * *', async () => {
      console.log('🏥 Running inventory sync health check...');
      
      try {
        const health = await inventorySyncJob.healthCheck();
        
        if (health.status === 'unhealthy') {
          console.log('🚨 Inventory sync health check failed:', health);
          // Send alert notification
          await this.sendHealthAlert(health);
        } else {
          console.log(`✅ Inventory sync health check passed: ${health.status}`);
        }
        
      } catch (error) {
        console.error('❌ Health check failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Jakarta'
    });

    this.jobs.set('healthCheck', job);
    console.log('📅 Health check scheduled: */30 * * * *');
  }

  // Schedule cleanup job
  scheduleCleanup() {
    const job = cron.schedule('0 2 * * *', async () => {
      console.log('🧹 Running inventory sync cleanup...');
      
      try {
        await this.cleanupOldLogs();
        await this.cleanupManualReviewQueue();
        
        console.log('✅ Inventory sync cleanup completed');
      } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Jakarta'
    });

    this.jobs.set('cleanup', job);
    console.log('📅 Cleanup scheduled: 0 2 * * *');
  }

  // Schedule stock validation
  scheduleStockValidation() {
    const job = cron.schedule('0 */6 * * *', async () => {
      console.log('🔍 Running stock validation...');
      
      try {
        await this.validateStockLevels();
        console.log('✅ Stock validation completed');
      } catch (error) {
        console.error('❌ Stock validation failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Jakarta'
    });

    this.jobs.set('stockValidation', job);
    console.log('📅 Stock validation scheduled: 0 */6 * * *');
  }

  // Cleanup old sync logs
  async cleanupOldLogs() {
    try {
      const daysToKeep = parseInt(process.env.SYNC_LOG_RETENTION_DAYS) || 30;
      
      const result = await db.query(`
        DELETE FROM inventory_sync_log 
        WHERE sync_time < NOW() - INTERVAL '${daysToKeep} days'
        RETURNING COUNT(*) as deleted_count
      `);

      console.log(`🗑️ Cleaned up ${result.rows[0].deleted_count} old sync logs`);
      
    } catch (error) {
      console.error('❌ Failed to cleanup old logs:', error.message);
    }
  }

  // Cleanup manual review queue
  async cleanupManualReviewQueue() {
    try {
      const daysToKeep = parseInt(process.env.MANUAL_REVIEW_RETENTION_DAYS) || 90;
      
      const result = await db.query(`
        DELETE FROM manual_review_queue 
        WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
        AND review_status = 'approved'
        RETURNING COUNT(*) as deleted_count
      `);

      console.log(`🗑️ Cleaned up ${result.rows[0].deleted_count} approved manual reviews`);
      
    } catch (error) {
      console.error('❌ Failed to cleanup manual review queue:', error.message);
    }
  }

  // Validate stock levels
  async validateStockLevels() {
    try {
      const inventoryMappingService = require('../services/inventoryMappingService');
      const inventorySyncService = require('../services/inventorySyncService');
      
      const mappings = await inventoryMappingService.getActiveMappings(50); // Sample 50 products
      const issues = [];
      
      for (const mapping of mappings) {
        try {
          const validation = await inventorySyncService.odooService.validateStockLevels(
            mapping.odoo_product_id,
            null, // Compare with Desty stock
            null  // All warehouses
          );
          
          if (!validation.isValid) {
            issues.push({
              sku: mapping.odoo_sku,
              issue: 'Stock mismatch',
              details: validation
            });
          }
          
        } catch (error) {
          issues.push({
            sku: mapping.odoo_sku,
            issue: 'Validation failed',
            error: error.message
          });
        }
      }
      
      if (issues.length > 0) {
        console.log(`⚠️ Found ${issues.length} stock validation issues`);
        await this.sendValidationAlert(issues);
      }
      
    } catch (error) {
      console.error('❌ Stock validation failed:', error.message);
    }
  }

  // Send health alert
  async sendHealthAlert(health) {
    try {
      console.log('🚨 Sending health alert notification...');
      
      // Implementation depends on your notification system
      const message = `Inventory Sync Health Alert: ${health.status.toUpperCase()}
      
Success Rate: ${health.successRate.toFixed(2)}%
Failed Syncs: ${health.failedCount}
Is Running: ${health.isRunning}

Details: ${JSON.stringify(health, null, 2)}`;
      
      await this.sendNotification({
        type: 'health_alert',
        subject: `Inventory Sync Health: ${health.status.toUpperCase()}`,
        message
      });
      
    } catch (error) {
      console.error('❌ Failed to send health alert:', error.message);
    }
  }

  // Send validation alert
  async sendValidationAlert(issues) {
    try {
      console.log('⚠️ Sending validation alert notification...');
      
      const message = `Stock Validation Alert: ${issues.length} issues found
      
Issues:
${issues.map(issue => `- ${issue.sku}: ${issue.issue}`).join('\n')}`;

      await this.sendNotification({
        type: 'validation_alert',
        subject: `Stock Validation: ${issues.length} Issues Found`,
        message
      });
      
    } catch (error) {
      console.error('❌ Failed to send validation alert:', error.message);
    }
  }

  // Send notification
  async sendNotification(notification) {
    // Implementation depends on your notification system
    console.log(`📧 Notification: ${notification.subject}`);
    
    const emailConfig = process.env.INVENTORY_NOTIFICATION_EMAIL;
    const slackWebhook = process.env.INVENTORY_SLACK_WEBHOOK;
    
    if (emailConfig) {
      console.log(`📧 Email would be sent to: ${emailConfig}`);
      // Implement email sending
    }
    
    if (slackWebhook) {
      console.log(`💬 Slack notification would be sent`);
      // Implement Slack notification
    }
  }

  // Get scheduler status
  getStatus() {
    const jobStatus = {};
    
    this.jobs.forEach((job, name) => {
      jobStatus[name] = {
        running: job.running,
        scheduled: job.scheduled,
        lastExecution: job.lastExecution ? new Date(job.lastExecution).toISOString() : null
      };
    });
    
    return {
      isRunning: this.isRunning,
      jobs: jobStatus,
      totalJobs: this.jobs.size
    };
  }

  // Manually trigger a job
  async triggerJob(jobName) {
    if (!this.jobs.has(jobName)) {
      throw new Error(`Job ${jobName} not found`);
    }
    
    const job = this.jobs.get(jobName);
    
    console.log(`🔄 Manually triggering job: ${jobName}`);
    
    try {
      if (jobName === 'mainSync') {
        await inventorySyncJob.run();
      } else if (jobName === 'healthCheck') {
        const health = await inventorySyncJob.healthCheck();
        console.log(`🏥 Health check result: ${health.status}`);
      } else if (jobName === 'cleanup') {
        await this.cleanupOldLogs();
        await this.cleanupManualReviewQueue();
      } else if (jobName === 'stockValidation') {
        await this.validateStockLevels();
      }
      
      console.log(`✅ Job ${jobName} completed successfully`);
      
    } catch (error) {
      console.error(`❌ Job ${jobName} failed:`, error.message);
      throw error;
    }
  }

  // Update job schedule
  updateJobSchedule(jobName, newCronExpression) {
    if (!this.jobs.has(jobName)) {
      throw new Error(`Job ${jobName} not found`);
    }
    
    const oldJob = this.jobs.get(jobName);
    oldJob.stop();
    
    // Create new job with updated schedule
    if (jobName === 'mainSync') {
      this.scheduleMainSync();
      // Override the cron expression
      this.jobs.get('mainSync').stop();
      const newJob = cron.schedule(newCronExpression, async () => {
        await inventorySyncJob.run();
      }, { scheduled: true, timezone: 'Asia/Jakarta' });
      this.jobs.set('mainSync', newJob);
    }
    
    console.log(`📅 Updated ${jobName} schedule: ${newCronExpression}`);
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🛑 Gracefully shutting down inventory sync scheduler...');
    
    // Wait for current jobs to finish
    if (inventorySyncJob.isRunning) {
      console.log('⏳ Waiting for current sync job to finish...');
      // Wait up to 5 minutes for job to finish
      let attempts = 0;
      while (inventorySyncJob.isRunning && attempts < 300) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      
      if (inventorySyncJob.isRunning) {
        console.log('⚠️ Sync job still running, forcing shutdown');
      }
    }
    
    this.stop();
    console.log('✅ Inventory sync scheduler shutdown complete');
  }
}

// Handle process shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n📡 Received SIGINT, shutting down gracefully...');
  scheduler.shutdown().then(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n📡 Received SIGTERM, shutting down gracefully...');
  scheduler.shutdown().then(() => {
    process.exit(0);
  });
});

const scheduler = new InventorySyncScheduler();

module.exports = scheduler;
