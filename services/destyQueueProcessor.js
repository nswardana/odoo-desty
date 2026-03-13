// services/destyQueueProcessor.js
// Enhanced queue processor for Desty orders

const { orderQueue } = require('../queue');

class DestyQueueProcessor {
  constructor() {
    this.setupQueueProcessor();
  }

  setupQueueProcessor() {
    try {
      console.log('🔄 Setting up Desty order queue processor...');

      orderQueue.process('order', async (job) => {
        const startTime = Date.now();
        const { source, order, webhook_event, timestamp } = job.data;
        
        try {
          if (source === 'desty') {
            await this.processDestyOrder(order, webhook_event);
          } else {
            await this.processStandardOrder(order);
          }
          
          const processingTime = Date.now() - startTime;
          console.log(`✅ Order processed in ${processingTime}ms: ${order.order_sn}`);
          
          return { success: true, processingTime };
        } catch (error) {
          const processingTime = Date.now() - startTime;
          console.error(`❌ Order processing failed after ${processingTime}ms: ${order.order_sn}`, error.message);
          
          // Handle error
          await this.handleOrderError(order, error, processingTime);
          
          throw error; // Re-throw to trigger queue retry mechanism
        }
      });

      // Handle failed jobs
      orderQueue.on('failed', async (job, err) => {
        console.error(`❌ Queue job failed for order: ${job.data.order?.order_sn}`, err.message);
        
        // Attempt error recovery
        await this.attemptErrorRecovery(job.data.order, err);
      });

      // Handle completed jobs
      orderQueue.on('completed', async (job, result) => {
        console.log(`✅ Queue job completed for order: ${job.data.order?.order_sn}`);
        
        // Track metrics
        await this.trackOrderMetrics(job.data.order, result.processingTime, true);
      });

      console.log('✅ Desty queue processor setup complete');
    } catch (error) {
      console.error('❌ Error setting up queue processor:', error.message);
    }
  }

  // Process Desty-specific orders
  async processDestyOrder(order, webhook_event) {
    try {
      console.log(`🔄 Processing Desty order: ${order.order_sn} (Event: ${webhook_event})`);
      
      // Lazy load dependencies
      const destyOdooService = require('./destyOdooService');
      const destyValidationService = require('./destyValidationService');
      
      // Step 1: Comprehensive validation
      const validationResult = await destyValidationService.validateCompleteOrder(order);
      
      if (!validationResult.isValid) {
        throw new Error(`Order validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Log warnings if any
      if (validationResult.warnings.length > 0) {
        console.log(`⚠️ Order warnings for ${order.order_sn}:`, validationResult.warnings);
      }

      // Step 2: Check/update customer
      const customer = await destyOdooService.createDestyCustomer(order);

      // Step 3: Validate products and stock
      const productValidation = await destyOdooService.validateDestyProducts(order.items);
      
      if (!productValidation.canProceed) {
        throw new Error(`Product validation failed: ${productValidation.errors.join(', ')}`);
      }

      // Log product warnings
      if (productValidation.warnings.length > 0) {
        console.log(`⚠️ Product warnings for ${order.order_sn}:`, productValidation.warnings);
      }

      // Step 4: Create/update order in Odoo
      const odooOrder = await destyOdooService.createDestyOrder(order, customer, productValidation.validatedItems);

      // Step 5: Handle order confirmation based on payment status
      if (webhook_event === 'order.paid' || order.payment_status === 'paid') {
        await destyOdooService.confirmDestyOrder(odooOrder.id);
      }

      // Step 6: Create shipment if ready to ship
      if (webhook_event === 'order.confirmed' || order.shipping_status === 'ready_to_ship') {
        await destyOdooService.createDestyShipment(odooOrder.id, order);
      }

      // Step 7: Send notifications
      await this.sendOrderNotifications(order, odooOrder, validationResult);

      console.log(`✅ Desty order processed successfully: ${order.order_sn}`);
      
      return {
        success: true,
        odooOrderId: odooOrder.id,
        customerId: customer.id,
        validationResult: validationResult.summary
      };

    } catch (error) {
      console.error(`❌ Error processing Desty order ${order.order_sn}:`, error.message);
      throw error;
    }
  }

  // Process standard orders (non-Desty)
  async processStandardOrder(order) {
    try {
      console.log(`🔄 Processing standard order: ${order.order_sn}`);
      
      // Use existing workflow service for standard orders
      const odooWorkflowService = require('./odooWorkflowService');
      await odooWorkflowService.processOrder(order);
      
      console.log(`✅ Standard order processed: ${order.order_sn}`);
    } catch (error) {
      console.error(`❌ Error processing standard order ${order.order_sn}:`, error.message);
      throw error;
    }
  }

  // Find or create customer
  async findOrCreateDestyCustomer(order) {
    try {
      console.log(`👤 Processing customer for order: ${order.order_sn}`);
      
      const customer = await this.odooService.createDestyCustomer(order);
      
      console.log(`✅ Customer processed: ${customer.id} for order: ${order.order_sn}`);
      return customer;
    } catch (error) {
      console.error(`❌ Error processing customer for order ${order.order_sn}:`, error.message);
      throw error;
    }
  }

  // Create order in Odoo
  async createDestyOrderInOdoo(order, customer, validatedItems) {
    try {
      console.log(`📦 Creating Odoo order: ${order.order_sn}`);
      
      const odooOrder = await this.odooService.createDestyOrder(order, customer, validatedItems);
      
      console.log(`✅ Odoo order created: ${odooOrder.id} for Desty order: ${order.order_sn}`);
      return odooOrder;
    } catch (error) {
      console.error(`❌ Error creating Odoo order for ${order.order_sn}:`, error.message);
      throw error;
    }
  }

  // Confirm order in Odoo
  async confirmOdooOrder(odooOrderId) {
    try {
      console.log(`✅ Confirming Odoo order: ${odooOrderId}`);
      
      await this.odooService.confirmDestyOrder(odooOrderId);
      
      console.log(`✅ Odoo order confirmed: ${odooOrderId}`);
    } catch (error) {
      console.error(`❌ Error confirming Odoo order ${odooOrderId}:`, error.message);
      throw error;
    }
  }

  // Create shipment in Odoo
  async createOdooShipment(odooOrderId, order) {
    try {
      console.log(`📦 Creating shipment for Odoo order: ${odooOrderId}`);
      
      const shipment = await this.odooService.createDestyShipment(odooOrderId, order);
      
      console.log(`✅ Shipment created: ${shipment.id} for Odoo order: ${odooOrderId}`);
      return shipment;
    } catch (error) {
      console.error(`❌ Error creating shipment for Odoo order ${odooOrderId}:`, error.message);
      // Don't throw error for shipment creation - order is still valid
      console.warn(`⚠️ Shipment creation failed but order processing continues`);
    }
  }

  // Send order notifications
  async sendOrderNotifications(order, odooOrder, validationResult) {
    try {
      console.log(`📧 Sending notifications for order: ${order.order_sn}`);
      
      // Send admin notification for warnings
      if (validationResult.warnings.length > 0) {
        await this.sendAdminNotification(order, validationResult.warnings, 'warning');
      }

      // Send customer notification (if configured)
      if (process.env.DESTY_CUSTOMER_NOTIFICATIONS_ENABLED === 'true') {
        await this.sendCustomerNotification(order, odooOrder);
      }

      console.log(`✅ Notifications sent for order: ${order.order_sn}`);
    } catch (error) {
      console.warn(`⚠️ Could not send notifications for order ${order.order_sn}:`, error.message);
    }
  }

  // Send admin notification
  async sendAdminNotification(order, messages, type = 'info') {
    try {
      const notification = {
        order_sn: order.order_sn,
        marketplace: 'desty',
        shop_id: order.shop_id,
        type: type,
        messages: messages,
        timestamp: new Date().toISOString()
      };

      // Store notification (implement notification storage)
      console.log(`📋 Admin notification stored: ${JSON.stringify(notification)}`);
    } catch (error) {
      console.warn('⚠️ Could not send admin notification:', error.message);
    }
  }

  // Send customer notification
  async sendCustomerNotification(order, odooOrder) {
    try {
      console.log(`📧 Customer notification would be sent to: ${order.buyer_email}`);
      // Implement email/SMS notification logic here
    } catch (error) {
      console.warn('⚠️ Could not send customer notification:', error.message);
    }
  }

  // Handle order processing errors
  async handleOrderError(order, error, processingTime) {
    try {
      console.error(`❌ Handling order error for: ${order.order_sn}`, error.message);

      // Store error record
      await this.storeErrorRecord(order, error, processingTime);

      // Send admin notification
      await this.sendAdminNotification(order, [error.message], 'error');

      // Attempt auto-recovery if possible
      const recoveryResult = await this.attemptErrorRecovery(order, error);
      
      return recoveryResult;
    } catch (handlingError) {
      console.error('❌ Error in error handling:', handlingError.message);
    }
  }

  // Store error record
  async storeErrorRecord(order, error, processingTime) {
    try {
      const errorRecord = {
        order_sn: order.order_sn,
        marketplace: 'desty',
        shop_id: order.shop_id,
        error_message: error.message,
        error_stack: error.stack,
        processing_time_ms: processingTime,
        order_data: order,
        timestamp: new Date().toISOString(),
        status: 'failed'
      };

      // Store error in database or file system
      console.log(`📝 Error record stored: ${JSON.stringify(errorRecord)}`);
    } catch (storeError) {
      console.warn('⚠️ Could not store error record:', storeError.message);
    }
  }

  // Attempt error recovery
  async attemptErrorRecovery(order, error) {
    try {
      console.log(`🔧 Attempting error recovery for order: ${order.order_sn}`);

      const recoveryActions = [];
      const errorMessage = error.message.toLowerCase();

      // Check for specific error types and attempt recovery
      if (errorMessage.includes('product not found')) {
        const sku = this.extractSkuFromError(error.message);
        if (sku) {
          recoveryActions.push({
            action: 'create_missing_product',
            sku: sku,
            status: 'pending'
          });
        }
      }

      if (errorMessage.includes('insufficient stock')) {
        recoveryActions.push({
          action: 'request_stock_adjustment',
          order_sn: order.order_sn,
          status: 'pending'
        });
      }

      if (errorMessage.includes('customer')) {
        recoveryActions.push({
          action: 'fix_customer_data',
          order_sn: order.order_sn,
          status: 'pending'
        });
      }

      console.log(`🔧 Recovery actions identified: ${recoveryActions.length}`);

      return {
        recoveryAttempted: true,
        actions: recoveryActions,
        canRetry: recoveryActions.length > 0,
        nextRetryDelay: this.calculateRetryDelay(recoveryActions.length)
      };

    } catch (recoveryError) {
      console.error('❌ Error in recovery attempt:', recoveryError.message);
      return { recoveryAttempted: false, error: recoveryError.message };
    }
  }

  // Extract SKU from error message
  extractSkuFromError(errorMessage) {
    const match = errorMessage.match(/product (\w+) not found/i);
    return match ? match[1] : null;
  }

  // Calculate retry delay based on recovery actions
  calculateRetryDelay(actionCount) {
    // Exponential backoff with jitter
    const baseDelay = 5000; // 5 seconds
    const maxDelay = 300000; // 5 minutes
    const delay = Math.min(baseDelay * Math.pow(2, actionCount), maxDelay);
    return delay + Math.random() * 1000; // Add jitter
  }

  // Track order metrics
  async trackOrderMetrics(order, processingTime, success) {
    try {
      const metrics = {
        order_sn: order.order_sn,
        marketplace: 'desty',
        shop_id: order.shop_id,
        processing_time_ms: processingTime,
        result: success ? 'success' : 'failed',
        items_count: order.items?.length || 0,
        total_amount: order.total_amount,
        webhook_event: order.webhook_event,
        timestamp: new Date().toISOString()
      };

      // Store metrics (implement metrics storage)
      console.log(`📊 Order metrics tracked: ${JSON.stringify(metrics)}`);
    } catch (error) {
      console.warn('⚠️ Could not track order metrics:', error.message);
    }
  }

  // Get queue statistics
  async getQueueStats() {
    try {
      const waiting = await orderQueue.getWaiting();
      const active = await orderQueue.getActive();
      const completed = await orderQueue.getCompleted();
      const failed = await orderQueue.getFailed();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: waiting.length + active.length + completed.length + failed.length
      };
    } catch (error) {
      console.error('❌ Error getting queue stats:', error.message);
      return null;
    }
  }
}

// Initialize and export the processor
const destyQueueProcessor = new DestyQueueProcessor();
module.exports = destyQueueProcessor;
