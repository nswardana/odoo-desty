// controllers/inventoryController.js
// REST API endpoints for inventory management and sync

const inventorySyncService = require('../services/inventorySyncService');
const inventoryMappingService = require('../services/inventoryMappingService');
const inventorySyncJob = require('../jobs/inventorySyncJob');

class InventoryController {
  // Get sync statistics
  async getSyncStats(req, res) {
    try {
      const hours = parseInt(req.query.hours) || 24;
      const stats = await inventorySyncService.getSyncStats(hours);
      
      res.json({
        success: true,
        data: stats,
        hours
      });
    } catch (error) {
      console.error('❌ Failed to get sync stats:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get failed sync operations
  async getFailedSyncs(req, res) {
    try {
      const hours = parseInt(req.query.hours) || 24;
      const limit = parseInt(req.query.limit) || 100;
      const failedSyncs = await inventorySyncService.getFailedSyncs(hours, limit);
      
      res.json({
        success: true,
        data: failedSyncs,
        hours,
        limit
      });
    } catch (error) {
      console.error('❌ Failed to get failed syncs:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get product mappings
  async getMappings(req, res) {
    try {
      const { shopId, search, limit = 100, offset = 0 } = req.query;
      
      let mappings;
      if (search) {
        mappings = await inventoryMappingService.searchMappings(search, { destyShopId: shopId });
      } else if (shopId) {
        mappings = await inventoryMappingService.getMappingsByShop(shopId);
      } else {
        mappings = await inventoryMappingService.getActiveMappings(limit, offset);
      }
      
      res.json({
        success: true,
        data: mappings,
        total: mappings.length
      });
    } catch (error) {
      console.error('❌ Failed to get mappings:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Create product mapping
  async createMapping(req, res) {
    try {
      const { odooProduct, destyProduct } = req.body;
      
      if (!odooProduct || !destyProduct) {
        return res.status(400).json({
          success: false,
          error: 'Both odooProduct and destyProduct are required'
        });
      }
      
      const mapping = await inventoryMappingService.createMapping(odooProduct, destyProduct);
      
      res.status(201).json({
        success: true,
        data: mapping
      });
    } catch (error) {
      console.error('❌ Failed to create mapping:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Update product mapping
  async updateMapping(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const mapping = await inventoryMappingService.updateMapping(id, updates);
      
      if (!mapping) {
        return res.status(404).json({
          success: false,
          error: 'Mapping not found'
        });
      }
      
      res.json({
        success: true,
        data: mapping
      });
    } catch (error) {
      console.error('❌ Failed to update mapping:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Delete product mapping
  async deleteMapping(req, res) {
    try {
      const { id } = req.params;
      
      const mapping = await inventoryMappingService.deleteMapping(id);
      
      if (!mapping) {
        return res.status(404).json({
          success: false,
          error: 'Mapping not found'
        });
      }
      
      res.json({
        success: true,
        data: mapping
      });
    } catch (error) {
      console.error('❌ Failed to delete mapping:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Manual sync trigger
  async triggerSync(req, res) {
    try {
      const { direction, sku, productId } = req.body;
      
      if (!direction || !['odoo-to-desty', 'desty-to-odoo'].includes(direction)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid direction. Use "odoo-to-desty" or "desty-to-odoo"'
        });
      }
      
      let result;
      if (direction === 'odoo-to-desty') {
        if (!productId) {
          return res.status(400).json({
            success: false,
            error: 'productId is required for odoo-to-desty sync'
          });
        }
        
        // Get current stock and sync
        const stock = await inventorySyncService.odooService.getCurrentStock(productId);
        result = await inventorySyncService.syncOdooToDesty(productId, stock);
        
      } else {
        if (!sku) {
          return res.status(400).json({
            success: false,
            error: 'sku is required for desty-to-odoo sync'
          });
        }
        
        // Get current stock from Desty and sync
        const mapping = await inventoryMappingService.getBySku(sku);
        if (!mapping) {
          return res.status(404).json({
            success: false,
            error: 'No mapping found for SKU'
          });
        }
        
        const stock = await inventorySyncService.destyService.getProductStock(
          mapping.desty_item_id,
          mapping.desty_shop_id
        );
        result = await inventorySyncService.syncDestyToOdoo(sku, stock);
      }
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('❌ Failed to trigger sync:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Bulk sync trigger
  async triggerBulkSync(req, res) {
    try {
      const { direction, mappings } = req.body;
      
      if (!direction || !['odoo-to-desty', 'desty-to-odoo'].includes(direction)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid direction. Use "odoo-to-desty" or "desty-to-odoo"'
        });
      }
      
      if (!mappings || !Array.isArray(mappings)) {
        return res.status(400).json({
          success: false,
          error: 'mappings array is required'
        });
      }
      
      const results = {
        total: mappings.length,
        successful: 0,
        failed: 0,
        errors: []
      };
      
      for (const mapping of mappings) {
        try {
          let result;
          
          if (direction === 'odoo-to-desty') {
            const stock = await inventorySyncService.odooService.getCurrentStock(mapping.productId);
            result = await inventorySyncService.syncOdooToDesty(mapping.productId, stock);
          } else {
            const stock = await inventorySyncService.destyService.getProductStock(
              mapping.destyItemId,
              mapping.destyShopId
            );
            result = await inventorySyncService.syncDestyToOdoo(mapping.sku, stock);
          }
          
          if (result.success) {
            results.successful++;
          } else {
            results.failed++;
            results.errors.push({
              sku: mapping.sku || mapping.productId,
              error: result.error
            });
          }
          
        } catch (error) {
          results.failed++;
          results.errors.push({
            sku: mapping.sku || mapping.productId,
            error: error.message
          });
        }
      }
      
      res.json({
        success: true,
        data: results
      });
    } catch (error) {
      console.error('❌ Failed to trigger bulk sync:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get product stock from both systems
  async getProductStock(req, res) {
    try {
      const { sku, productId } = req.query;
      
      if (!sku && !productId) {
        return res.status(400).json({
          success: false,
          error: 'Either sku or productId is required'
        });
      }
      
      let mapping;
      if (sku) {
        mapping = await inventoryMappingService.getBySku(sku);
      } else {
        mapping = await inventoryMappingService.getByOdooId(productId);
      }
      
      if (!mapping) {
        return res.status(404).json({
          success: false,
          error: 'No mapping found'
        });
      }
      
      // Get stock from both systems
      const [odooStock, destyStock] = await Promise.all([
        inventorySyncService.odooService.getCurrentStock(mapping.odoo_product_id),
        inventorySyncService.destyService.getProductStock(
          mapping.desty_item_id,
          mapping.desty_shop_id
        ).catch(() => null) // Desty API might fail
      ]);
      
      const stockComparison = {
        odooStock,
        destyStock,
        difference: destyStock !== null ? odooStock - destyStock : null,
        inSync: destyStock !== null ? Math.abs(odooStock - destyStock) <= 1 : false,
        mapping
      };
      
      res.json({
        success: true,
        data: stockComparison
      });
    } catch (error) {
      console.error('❌ Failed to get product stock:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get sync job status
  async getSyncJobStatus(req, res) {
    try {
      const status = inventorySyncJob.getStatus();
      const health = await inventorySyncJob.healthCheck();
      
      res.json({
        success: true,
        data: {
          ...status,
          health
        }
      });
    } catch (error) {
      console.error('❌ Failed to get sync job status:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Run sync job manually
  async runSyncJob(req, res) {
    try {
      if (inventorySyncJob.isRunning) {
        return res.status(409).json({
          success: false,
          error: 'Sync job is already running'
        });
      }
      
      // Run job asynchronously
      inventorySyncJob.run().catch(error => {
        console.error('❌ Manual sync job failed:', error.message);
      });
      
      res.json({
        success: true,
        message: 'Sync job started'
      });
    } catch (error) {
      console.error('❌ Failed to start sync job:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get mapping statistics
  async getMappingStats(req, res) {
    try {
      const stats = await inventoryMappingService.getMappingStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('❌ Failed to get mapping stats:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Validate mapping integrity
  async validateMappings(req, res) {
    try {
      const issues = await inventoryMappingService.validateMappingIntegrity();
      
      res.json({
        success: true,
        data: {
          totalIssues: issues.length,
          issues
        }
      });
    } catch (error) {
      console.error('❌ Failed to validate mappings:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Export mappings
  async exportMappings(req, res) {
    try {
      const { format = 'json' } = req.query;
      
      if (!['json', 'csv'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'Format must be json or csv'
        });
      }
      
      const data = await inventoryMappingService.exportMappings(format);
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="product_mappings.csv"');
        res.send(data);
      } else {
        res.json({
          success: true,
          data
        });
      }
    } catch (error) {
      console.error('❌ Failed to export mappings:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Bulk import mappings
  async importMappings(req, res) {
    try {
      const { mappings } = req.body;
      
      if (!mappings || !Array.isArray(mappings)) {
        return res.status(400).json({
          success: false,
          error: 'mappings array is required'
        });
      }
      
      const results = await inventoryMappingService.bulkImportMappings(mappings);
      
      res.json({
        success: true,
        data: results
      });
    } catch (error) {
      console.error('❌ Failed to import mappings:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new InventoryController();
