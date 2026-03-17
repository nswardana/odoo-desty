# Inventory Sync Plan: Odoo ↔ Desty

## Overview
Two-way synchronization of product inventory between Odoo ERP and Desty marketplace platform.

## Architecture

```
┌─────────────┐    Sync To    ┌─────────────┐    Sync To    ┌─────────────┐
│             │──────────────►│             │──────────────►│             │
│    Odoo     │               │ Sync Engine │               │   Desty     │
│   (Master)  │◄──────────────│   (Node.js) │◄──────────────│  (Market)   │
│             │   From API    │             │   From API    │             │
└─────────────┘               └─────────────┘               └─────────────┘
```

## 1. Data Flow Direction

### 1.1 Odoo → Desty (Primary Flow)
- **Trigger**: Stock changes in Odoo (stock moves, deliveries, adjustments)
- **Frequency**: Real-time + Scheduled sync
- **Purpose**: Update marketplace stock levels

### 1.2 Desty → Odoo (Secondary Flow)  
- **Trigger**: Order fulfillment, returns, manual adjustments
- **Frequency**: Scheduled sync (hourly)
- **Purpose**: Update Odoo with marketplace activities

## 2. API Endpoints

### 2.1 Desty Stock Sync API
```javascript
POST /api/inventory/stock/sync
Content-Type: application/json
Authorization: Bearer {desty_token}

Request Body:
{
  "shopId": "string",
  "itemExternalCode": "string", 
  "stock": "number",
  "warehouseId": "string"
}
```

### 2.2 Odoo Stock Query API
```javascript
// Get product stock
GET /api/stock/quant?product_id={id}&location_id={warehouse_id}

// Get stock moves (for changes)
GET /api/stock.move?product_id={id}&date_from={date}
```

## 3. Implementation Plan

### Phase 1: Core Infrastructure

#### 3.1 Database Schema
```sql
-- Inventory sync tracking
CREATE TABLE inventory_sync_log (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) NOT NULL,
  source VARCHAR(20) NOT NULL, -- 'odoo' or 'desty'
  target VARCHAR(20) NOT NULL, -- 'odoo' or 'desty'
  old_stock INTEGER,
  new_stock INTEGER,
  sync_time TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) NOT NULL, -- 'success', 'failed', 'pending'
  error_message TEXT,
  api_response TEXT
);

-- Product mapping
CREATE TABLE product_mapping (
  id SERIAL PRIMARY KEY,
  odoo_product_id INTEGER NOT NULL,
  odoo_sku VARCHAR(100) NOT NULL,
  desty_item_id VARCHAR(100) NOT NULL,
  desty_external_code VARCHAR(100) NOT NULL,
  desty_shop_id VARCHAR(100) NOT NULL,
  last_sync TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);
```

#### 3.2 Service Structure
```
services/
├── inventorySyncService.js     # Main sync orchestrator
├── odooInventoryService.js     # Odoo stock operations
├── destyInventoryService.js   # Desty API operations
└── inventoryMappingService.js  # Product mapping management
```

### Phase 2: Odoo → Desty Sync

#### 3.3 Real-time Triggers
```javascript
// services/odooInventoryService.js
class OdooInventoryService {
  async onStockMove(move) {
    const product = await this.getProduct(move.product_id);
    const currentStock = await this.getCurrentStock(product.id);
    
    await this.syncToDesty({
      sku: product.default_code,
      stock: currentStock,
      shopId: product.desty_shop_id,
      warehouseId: product.desty_warehouse_id
    });
  }
  
  async getCurrentStock(productId, warehouseId = null) {
    const quants = await this.odooService.execute('stock.quant', 'search_read', [
      [['product_id', '=', productId], ['location_id.usage', '=', 'internal']]
    ], ['quantity']);
    
    return quants.reduce((total, quant) => total + quant.quantity, 0);
  }
}
```

#### 3.4 Desty API Integration
```javascript
// services/destyInventoryService.js
class DestyInventoryService {
  async updateStock(sku, stock, shopId, warehouseId) {
    try {
      const response = await axios.post(
        `${DESTY_CONFIG.base_url}/api/inventory/stock/sync`,
        {
          shopId,
          itemExternalCode: sku,
          stock,
          warehouseId
        },
        {
          headers: {
            'Authorization': `Bearer ${DESTY_CONFIG.api_key}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to sync stock for ${sku}:`, error.message);
      throw error;
    }
  }
}
```

### Phase 3: Desty → Odoo Sync

#### 3.5 Scheduled Sync Job
```javascript
// jobs/inventorySyncJob.js
class InventorySyncJob {
  async run() {
    console.log('🔄 Starting Desty → Odoo inventory sync...');
    
    // Get all active product mappings
    const mappings = await this.mappingService.getActiveMappings();
    
    for (const mapping of mappings) {
      try {
        // Get current stock from Desty
        const destyStock = await this.destyService.getProductStock(
          mapping.desty_item_id,
          mapping.desty_shop_id
        );
        
        // Get current stock from Odoo
        const odooStock = await this.odooService.getCurrentStock(
          mapping.odoo_product_id
        );
        
        // Sync if different
        if (destyStock !== odooStock) {
          await this.syncToOdoo(mapping, destyStock);
        }
        
      } catch (error) {
        console.error(`❌ Sync failed for ${mapping.odoo_sku}:`, error);
      }
    }
  }
}
```

### Phase 4: Conflict Resolution

#### 3.6 Sync Rules Engine
```javascript
// services/inventorySyncService.js
class InventorySyncService {
  resolveConflict(source, target, sourceStock, targetStock) {
    // Rule 1: Odoo is master for physical inventory
    if (source === 'odoo' && target === 'desty') {
      return sourceStock; // Trust Odoo stock
    }
    
    // Rule 2: For Desty → Odoo, use conservative approach
    if (source === 'desty' && target === 'odoo') {
      return Math.min(sourceStock, targetStock); // Use minimum
    }
    
    // Rule 3: Manual intervention for large discrepancies
    if (Math.abs(sourceStock - targetStock) > 100) {
      this.flagForManualReview(source, target, sourceStock, targetStock);
      return targetStock; // Keep current until review
    }
    
    return sourceStock;
  }
}
```

## 4. Implementation Files

### 4.1 Main Sync Service
```javascript
// services/inventorySyncService.js
class InventorySyncService {
  constructor() {
    this.odooService = require('./odooInventoryService');
    this.destyService = require('./destyInventoryService');
    this.mappingService = require('./inventoryMappingService');
  }
  
  async syncOdooToDesty(productId, stock) {
    const mapping = await this.mappingService.getByOdooId(productId);
    
    if (!mapping) {
      console.warn(`⚠️ No mapping found for Odoo product ${productId}`);
      return;
    }
    
    try {
      await this.destyService.updateStock(
        mapping.desty_external_code,
        stock,
        mapping.desty_shop_id,
        mapping.desty_warehouse_id
      );
      
      await this.logSync(mapping.odoo_sku, 'odoo', 'desty', stock, 'success');
      
    } catch (error) {
      await this.logSync(mapping.odoo_sku, 'odoo', 'desty', stock, 'failed', error.message);
      throw error;
    }
  }
  
  async syncDestyToOdoo(sku, stock) {
    const mapping = await this.mappingService.getBySku(sku);
    
    if (!mapping) {
      console.warn(`⚠️ No mapping found for SKU ${sku}`);
      return;
    }
    
    try {
      // Update Odoo stock via stock adjustment
      await this.odooService.adjustStock(mapping.odoo_product_id, stock);
      
      await this.logSync(sku, 'desty', 'odoo', stock, 'success');
      
    } catch (error) {
      await this.logSync(sku, 'desty', 'odoo', stock, 'failed', error.message);
      throw error;
    }
  }
}
```

### 4.2 Product Mapping Service
```javascript
// services/inventoryMappingService.js
class InventoryMappingService {
  async createMapping(odooProduct, destyProduct) {
    await db.query(`
      INSERT INTO product_mapping 
      (odoo_product_id, odoo_sku, desty_item_id, desty_external_code, desty_shop_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      odooProduct.id,
      odooProduct.default_code,
      destyProduct.itemId,
      destyProduct.itemExternalCode,
      destyProduct.shopId
    ]);
  }
  
  async getActiveMappings() {
    return await db.query(`
      SELECT * FROM product_mapping 
      WHERE is_active = TRUE
      ORDER BY last_sync ASC
    `);
  }
}
```

## 5. Configuration

### 5.1 Environment Variables
```bash
# .env
INVENTORY_SYNC_ENABLED=true
INVENTORY_SYNC_INTERVAL=3600000  # 1 hour
INVENTORY_BATCH_SIZE=50
INVENTORY_RETRY_ATTEMPTS=3

# Desty API
DESTY_INVENTORY_API_URL=https://api.desty.app/api/inventory
DESTY_API_KEY=your_desty_api_key

# Odoo Configuration  
ODOO_STOCK_WAREHOUSE_ID=1
ODOO_STOCK_LOCATION_ID=8
```

### 5.2 Sync Schedule
```javascript
// scripts/inventorySync.js
const cron = require('node-cron');

// Every hour: sync Desty → Odoo
cron.schedule('0 * * * *', async () => {
  await inventorySyncJob.run();
});

// Every 15 minutes: check for Odoo stock changes
cron.schedule('*/15 * * * *', async () => {
  await odooInventoryService.checkRecentChanges();
});
```

## 6. Monitoring & Error Handling

### 6.1 Sync Dashboard
```javascript
// controllers/inventoryController.js
class InventoryController {
  async getSyncStatus(req, res) {
    const stats = await db.query(`
      SELECT 
        source,
        target,
        status,
        COUNT(*) as count,
        MAX(sync_time) as last_sync
      FROM inventory_sync_log 
      WHERE sync_time > NOW() - INTERVAL '24 hours'
      GROUP BY source, target, status
    `);
    
    res.json(stats);
  }
  
  async getFailedSyncs(req, res) {
    const failed = await db.query(`
      SELECT * FROM inventory_sync_log 
      WHERE status = 'failed' 
      AND sync_time > NOW() - INTERVAL '24 hours'
      ORDER BY sync_time DESC
      LIMIT 100
    `);
    
    res.json(failed);
  }
}
```

### 6.2 Error Recovery
```javascript
// services/inventorySyncService.js
async handleFailedSync(sku, error) {
  // Retry logic
  const retryCount = await this.getRetryCount(sku);
  
  if (retryCount < INVENTORY_SYNC_RETRY_ATTEMPTS) {
    await this.scheduleRetry(sku, retryCount + 1);
  } else {
    // Escalate to manual review
    await this.escalateToManualReview(sku, error);
  }
}
```

## 7. Testing Strategy

### 7.1 Unit Tests
```javascript
// tests/inventorySync.test.js
describe('Inventory Sync', () => {
  test('should sync stock from Odoo to Desty', async () => {
    const result = await inventorySyncService.syncOdooToDesty(123, 50);
    expect(result.success).toBe(true);
  });
  
  test('should handle Desty API errors gracefully', async () => {
    // Mock Desty API error
    await expect(
      inventorySyncService.syncOdooToDesty(123, 50)
    ).rejects.toThrow('Desty API error');
  });
});
```

### 7.2 Integration Tests
```javascript
// tests/integration.test.js
describe('End-to-End Inventory Sync', () => {
  test('should complete full sync cycle', async () => {
    // Update Odoo stock
    await odooService.adjustStock(product.id, 100);
    
    // Wait for sync
    await sleep(5000);
    
    // Check Desty stock
    const destyStock = await destyService.getProductStock(product.itemId);
    expect(destyStock).toBe(100);
  });
});
```

## 8. Deployment

### 8.1 Docker Configuration
```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["npm", "run", "inventory-sync"]
```

### 8.2 Monitoring
```javascript
// health-check.js
app.get('/health/inventory-sync', async (req, res) => {
  const lastSync = await getLastSuccessfulSync();
  const isHealthy = lastSync > Date.now() - (2 * 60 * 60 * 1000); // 2 hours
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    lastSync,
    queueSize: await getSyncQueueSize()
  });
});
```

## 9. Rollout Plan

### Phase 1: Setup (Week 1)
- [ ] Database schema setup
- [ ] Service infrastructure
- [ ] Product mapping import
- [ ] Basic connectivity tests

### Phase 2: Odoo → Desty (Week 2)
- [ ] Real-time stock triggers
- [ ] Desty API integration
- [ ] Error handling & logging
- [ ] Monitoring dashboard

### Phase 3: Desty → Odoo (Week 3)
- [ ] Scheduled sync jobs
- [ ] Conflict resolution
- [ ] Manual review process
- [ ] Performance optimization

### Phase 4: Production (Week 4)
- [ ] Full integration testing
- [ ] Load testing
- [ ] Documentation
- [ ] Go-live & monitoring

## 10. Success Metrics

- **Sync Accuracy**: >99.9% stock level consistency
- **Sync Latency**: <5 minutes for Odoo → Desty
- **Error Rate**: <1% failed sync operations
- **System Uptime**: >99.5% availability

This plan provides a robust, scalable inventory sync solution between Odoo and Desty marketplace platform.
