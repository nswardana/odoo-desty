// services/marketplaceSyncService.js
// Service for syncing status back to marketplaces

const axios = require('axios');

class MarketplaceSyncService {
  constructor() {
    this.marketplaceConfigs = {
      'shopee': {
        baseUrl: process.env.SHOPEE_API_BASE_URL || 'https://partner.shopeemobile.com',
        endpoints: {
          updateTracking: '/api/v2/orders/update_tracking_number',
          updateStatus: '/api/v2/orders/update_shipping_status'
        },
        timeout: 30000,
        retries: 3
      },
      'tokopedia': {
        baseUrl: process.env.TOKOPEDIA_API_BASE_URL || 'https://fs.tokopedia.net',
        endpoints: {
          updateTracking: '/v1/fs/:shop_id/update-tracking',
          updateStatus: '/v1/fs/:shop_id/order-status'
        },
        timeout: 30000,
        retries: 3
      },
      'lazada': {
        baseUrl: process.env.LAZADA_API_BASE_URL || 'https://api.lazada.com.ph/rest',
        endpoints: {
          updateTracking: '/order/rts',
          updateStatus: '/order/status'
        },
        timeout: 30000,
        retries: 3
      },
      'tiktok': {
        baseUrl: process.env.TIKTOK_API_BASE_URL || 'https://developer.tiktok.com',
        endpoints: {
          updateTracking: '/api/v1/orders/tracking',
          updateStatus: '/api/v1/orders/status'
        },
        timeout: 30000,
        retries: 3
      }
    };
  }

  // === TRACKING NUMBER SYNC ===
  
  async updateTrackingNumber(marketplace, shopId, orderId, trackingData) {
    try {
      console.log(`📦 Updating tracking number for ${marketplace} order: ${orderId}`);
      
      const config = this.marketplaceConfigs[marketplace];
      if (!config) {
        throw new Error(`Marketplace not supported: ${marketplace}`);
      }

      const {
        tracking_number,
        courier_name,
        shipping_method,
        notes
      } = trackingData;

      // Prepare request data based on marketplace
      const requestData = this.prepareTrackingRequest(marketplace, {
        order_id: orderId,
        tracking_number,
        courier_name,
        shipping_method,
        notes,
        shop_id: shopId
      });

      // Make API call
      const response = await this.makeMarketplaceRequest(
        marketplace,
        'updateTracking',
        requestData,
        shopId
      );

      const result = {
        success: true,
        marketplace,
        order_id: orderId,
        tracking_number: tracking_number,
        response: response,
        synced_at: new Date().toISOString()
      };

      console.log(`✅ Tracking number updated: ${marketplace} - ${orderId} -> ${tracking_number}`);
      
      // Log the sync
      await this.logSync({
        marketplace,
        shop_id: shopId,
        order_id: orderId,
        sync_type: 'tracking_number',
        data: trackingData,
        result: result,
        status: 'success'
      });

      return result;
    } catch (error) {
      console.error(`❌ Error updating tracking number for ${marketplace}:`, error.message);
      
      // Log failed sync
      await this.logSync({
        marketplace,
        shop_id: shopId,
        order_id: orderId,
        sync_type: 'tracking_number',
        data: trackingData,
        error: error.message,
        status: 'failed'
      });

      throw error;
    }
  }

  // === ORDER STATUS SYNC ===
  
  async updateOrderStatus(marketplace, shopId, orderId, statusData) {
    try {
      console.log(`📊 Updating order status for ${marketplace} order: ${orderId} -> ${statusData.status}`);
      
      const config = this.marketplaceConfigs[marketplace];
      if (!config) {
        throw new Error(`Marketplace not supported: ${marketplace}`);
      }

      const {
        status,
        notes,
        images = [],
        timestamp = new Date().toISOString()
      } = statusData;

      // Prepare request data based on marketplace
      const requestData = this.prepareStatusRequest(marketplace, {
        order_id: orderId,
        status,
        notes,
        images,
        timestamp,
        shop_id: shopId
      });

      // Make API call
      const response = await this.makeMarketplaceRequest(
        marketplace,
        'updateStatus',
        requestData,
        shopId
      );

      const result = {
        success: true,
        marketplace,
        order_id: orderId,
        status: status,
        response: response,
        synced_at: new Date().toISOString()
      };

      console.log(`✅ Order status updated: ${marketplace} - ${orderId} -> ${status}`);
      
      // Log the sync
      await this.logSync({
        marketplace,
        shop_id: shopId,
        order_id: orderId,
        sync_type: 'order_status',
        data: statusData,
        result: result,
        status: 'success'
      });

      return result;
    } catch (error) {
      console.error(`❌ Error updating order status for ${marketplace}:`, error.message);
      
      // Log failed sync
      await this.logSync({
        marketplace,
        shop_id: shopId,
        order_id: orderId,
        sync_type: 'order_status',
        data: statusData,
        error: error.message,
        status: 'failed'
      });

      throw error;
    }
  }

  // === BATCH SYNC OPERATIONS ===
  
  async batchUpdateTrackingNumbers(syncRequests) {
    try {
      console.log(`🔄 Starting batch tracking number sync: ${syncRequests.length} requests`);
      
      const results = [];
      for (const request of syncRequests) {
        try {
          const result = await this.updateTrackingNumber(
            request.marketplace,
            request.shop_id,
            request.order_id,
            request.tracking_data
          );
          results.push({ success: true, request, result });
        } catch (error) {
          results.push({ success: false, request, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Batch tracking sync completed: ${successCount}/${syncRequests.length} successful`);
      
      return results;
    } catch (error) {
      console.error('❌ Batch tracking sync failed:', error.message);
      throw error;
    }
  }

  async batchUpdateOrderStatus(syncRequests) {
    try {
      console.log(`🔄 Starting batch order status sync: ${syncRequests.length} requests`);
      
      const results = [];
      for (const request of syncRequests) {
        try {
          const result = await this.updateOrderStatus(
            request.marketplace,
            request.shop_id,
            request.order_id,
            request.status_data
          );
          results.push({ success: true, request, result });
        } catch (error) {
          results.push({ success: false, request, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Batch status sync completed: ${successCount}/${syncRequests.length} successful`);
      
      return results;
    } catch (error) {
      console.error('❌ Batch status sync failed:', error.message);
      throw error;
    }
  }

  // === MARKETPLACE-SPECIFIC REQUESTS ===
  
  prepareTrackingRequest(marketplace, data) {
    switch (marketplace) {
      case 'shopee':
        return {
          order_sn: data.order_id,
          tracking_number: data.tracking_number,
          shipping_carrier: data.courier_name,
          service_type: data.shipping_method,
          note: data.notes || ''
        };

      case 'tokopedia':
        return {
          order_id: data.order_id,
          awb_number: data.tracking_number,
          courier: data.courier_name,
          service_type: data.shipping_method,
          notes: data.notes || ''
        };

      case 'lazada':
        return {
          order_item_ids: [data.order_id],
          tracking_number: data.tracking_number,
          shipping_provider: data.courier_name,
          note: data.notes || ''
        };

      case 'tiktok':
        return {
          order_id: data.order_id,
          tracking_info: {
            tracking_number: data.tracking_number,
            carrier_name: data.courier_name,
            shipping_method: data.shipping_method
          },
          notes: data.notes || ''
        };

      default:
        throw new Error(`Unsupported marketplace for tracking: ${marketplace}`);
    }
  }

  prepareStatusRequest(marketplace, data) {
    switch (marketplace) {
      case 'shopee':
        return {
          order_sn: data.order_id,
          shipping_status: data.status,
          note: data.notes || '',
          images: data.images || []
        };

      case 'tokopedia':
        return {
          order_id: data.order_id,
          status: data.status,
          notes: data.notes || '',
          images: data.images || []
        };

      case 'lazada':
        return {
          order_item_ids: [data.order_id],
          status: data.status,
          note: data.notes || '',
          images: data.images || []
        };

      case 'tiktok':
        return {
          order_id: data.order_id,
          order_status: data.status,
          notes: data.notes || '',
          images: data.images || [],
          timestamp: data.timestamp
        };

      default:
        throw new Error(`Unsupported marketplace for status: ${marketplace}`);
    }
  }

  // === HTTP REQUEST HANDLER ===
  
  async makeMarketplaceRequest(marketplace, requestType, data, shopId) {
    try {
      const config = this.marketplaceConfigs[marketplace];
      const accountService = require('./accountService');
      
      // Get account credentials
      const account = await accountService.getAccountByShop(marketplace, shopId);
      if (!account) {
        throw new Error(`Account not found for ${marketplace} - ${shopId}`);
      }

      // Get endpoint URL
      let endpoint = config.endpoints[requestType];
      if (endpoint.includes(':shop_id')) {
        endpoint = endpoint.replace(':shop_id', shopId);
      }
      const url = config.baseUrl + endpoint;

      // Prepare headers with authentication
      const headers = await this.prepareAuthHeaders(marketplace, account);

      // Make request with retry logic
      const response = await this.makeRequestWithRetry(
        'POST',
        url,
        data,
        headers,
        config.timeout,
        config.retries
      );

      console.log(`✅ ${marketplace} ${requestType} request successful:`, {
        url: endpoint,
        status: response.status
      });

      return response.data;
    } catch (error) {
      console.error(`❌ ${marketplace} ${requestType} request failed:`, error.message);
      throw error;
    }
  }

  async prepareAuthHeaders(marketplace, account) {
    switch (marketplace) {
      case 'shopee':
        return {
          'Authorization': `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
          'Shop-Id': account.shop_id
        };

      case 'tokopedia':
        return {
          'Authorization': `Bearer ${account.access_token}`,
          'Content-Type': 'application/json'
        };

      case 'lazada':
        return {
          'Authorization': `Bearer ${account.access_token}`,
          'Content-Type': 'application/json'
        };

      case 'tiktok':
        return {
          'Authorization': `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
          'Shop-Id': account.shop_id
        };

      default:
        throw new Error(`Unsupported marketplace: ${marketplace}`);
    }
  }

  async makeRequestWithRetry(method, url, data, headers, timeout, retries) {
    let lastError;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const config = {
          method,
          url,
          data,
          headers,
          timeout: timeout
        };

        const response = await axios(config);
        return response;
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Request attempt ${attempt} failed:`, error.message);
        
        if (attempt < retries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  // === SYNC LOGGING ===
  
  async logSync(logData) {
    try {
      // This would log to a sync_logs table in PostgreSQL
      console.log('📝 Sync logged:', {
        marketplace: logData.marketplace,
        shop_id: logData.shop_id,
        order_id: logData.order_id,
        sync_type: logData.sync_type,
        status: logData.status
      });
      return true;
    } catch (error) {
      console.error('❌ Error logging sync:', error.message);
      // Don't throw - logging failure shouldn't stop the process
    }
  }

  // === SYNC STATUS TRACKING ===
  
  async getSyncHistory(marketplace = null, shopId = null, limit = 100) {
    try {
      // This would query the sync_logs table
      console.log(`📊 Getting sync history for ${marketplace || 'all'} - ${shopId || 'all'}`);
      
      // Mock data for now
      return {
        marketplace: marketplace,
        shop_id: shopId,
        limit: limit,
        syncs: [],
        total: 0
      };
    } catch (error) {
      console.error('❌ Error getting sync history:', error.message);
      throw error;
    }
  }

  async getFailedSyncs(marketplace = null, shopId = null, hours = 24) {
    try {
      // This would query failed syncs from the sync_logs table
      console.log(`📊 Getting failed syncs for last ${hours} hours`);
      
      // Mock data for now
      return {
        marketplace: marketplace,
        shop_id: shopId,
        hours: hours,
        failed_syncs: [],
        total: 0
      };
    } catch (error) {
      console.error('❌ Error getting failed syncs:', error.message);
      throw error;
    }
  }

  // === HEALTH CHECK ===
  
  async healthCheck() {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        marketplaces: {},
        total_marketplaces: Object.keys(this.marketplaceConfigs).length
      };

      // Check each marketplace configuration
      for (const marketplace of Object.keys(this.marketplaceConfigs)) {
        const config = this.marketplaceConfigs[marketplace];
        health.marketplaces[marketplace] = {
          configured: true,
          base_url: config.baseUrl,
          endpoints: config.endpoints,
          timeout: config.timeout,
          retries: config.retries
        };
      }

      return health;
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // === RETRY FAILED SYNCS ===
  
  async retryFailedSyncs(marketplace = null, shopId = null, hours = 24) {
    try {
      console.log(`🔄 Retrying failed syncs for last ${hours} hours`);
      
      const failedSyncs = await this.getFailedSyncs(marketplace, shopId, hours);
      const results = [];

      for (const failedSync of failedSyncs.failed_syncs) {
        try {
          let result;
          
          if (failedSync.sync_type === 'tracking_number') {
            result = await this.updateTrackingNumber(
              failedSync.marketplace,
              failedSync.shop_id,
              failedSync.order_id,
              failedSync.data
            );
          } else if (failedSync.sync_type === 'order_status') {
            result = await this.updateOrderStatus(
              failedSync.marketplace,
              failedSync.shop_id,
              failedSync.order_id,
              failedSync.data
            );
          }

          results.push({ success: true, failed_sync, result });
        } catch (error) {
          results.push({ success: false, failed_sync, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Retry completed: ${successCount}/${failedSyncs.failed_syncs.length} successful`);
      
      return results;
    } catch (error) {
      console.error('❌ Retry failed syncs error:', error.message);
      throw error;
    }
  }
}

module.exports = new MarketplaceSyncService();
