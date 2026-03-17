# Inventory Sync Implementation

## 📋 Overview

Complete two-way inventory synchronization system between Odoo ERP and Desty marketplace platform.

## 🏗️ Architecture

```
┌─────────────┐    Sync To    ┌─────────────┐    Sync To    ┌─────────────┐
│             │──────────────►│             │──────────────►│             │
│    Odoo     │               │ Sync Engine │               │   Desty     │
│   (Master)  │◄──────────────│   (Node.js) │◄──────────────│  (Market)   │
│             │   From API    │             │   From API    │             │
└─────────────┘               └─────────────┘               └─────────────┘
```

## 📁 File Structure

```
├── services/
│   ├── inventorySyncService.js      # Main sync orchestrator
│   ├── odooInventoryService.js      # Odoo stock operations
│   ├── destyInventoryService.js     # Desty API operations
│   └── inventoryMappingService.js   # Product mapping management
├── jobs/
│   └── inventorySyncJob.js          # Scheduled sync job
├── controllers/
│   └── inventoryController.js       # REST API endpoints
├── scripts/
│   └── inventorySyncScheduler.js    # Cron job scheduler
├── database/
│   └── inventory_sync_schema.sql    # Database schema
└── INVENTORY_SYNC_PLAN.md          # Complete documentation
```

## 🚀 Quick Start

### 1. Database Setup

```bash
# Create database schema
psql -d your_database -f database/inventory_sync_schema.sql
```

### 2. Environment Configuration

```bash
# .env
INVENTORY_SYNC_ENABLED=true
INVENTORY_SYNC_INTERVAL=3600000  # 1 hour
INVENTORY_SYNC_BATCH_SIZE=50
INVENTORY_SYNC_RETRY_ATTEMPTS=3

# Desty API
DESTY_API_KEY=your_desty_api_key
DESTY_BASE_URL=https://api.desty.app

# Odoo Configuration  
ODOO_STOCK_WAREHOUSE_ID=1
ODOO_STOCK_LOCATION_ID=8

# Notifications
INVENTORY_NOTIFICATION_EMAIL=admin@company.com
INVENTORY_SLACK_WEBHOOK=https://hooks.slack.com/...
```

### 3. Install Dependencies

```bash
npm install node-cron axios
```

### 4. Start Scheduler

```bash
# Start the inventory sync scheduler
node scripts/inventorySyncScheduler.js

# Or run with your main application
require('./scripts/inventorySyncScheduler').start();
```

## 🔧 Core Services

### InventorySyncService

Main orchestrator for sync operations:

```javascript
const inventorySyncService = require('./services/inventorySyncService');

// Sync Odoo → Desty
await inventorySyncService.syncOdooToDesty(productId, stock);

// Sync Desty → Odoo  
await inventorySyncService.syncDestyToOdoo(sku, stock);

// Get sync statistics
const stats = await inventorySyncService.getSyncStats(24);
```

### Product Mapping

Manage product relationships between systems:

```javascript
const inventoryMappingService = require('./services/inventoryMappingService');

// Create mapping
await inventoryMappingService.createMapping(odooProduct, destyProduct);

// Get active mappings
const mappings = await inventoryMappingService.getActiveMappings();

// Search mappings
const results = await inventoryMappingService.searchMappings('SKU-001');
```

## 📡 REST API Endpoints

### Sync Management

```bash
# Get sync statistics
GET /api/inventory/stats?hours=24

# Get failed syncs
GET /api/inventory/failed-syncs?hours=24&limit=100

# Trigger manual sync
POST /api/inventory/sync
{
  "direction": "odoo-to-desty",
  "productId": 1234
}
```

### Product Mapping

```bash
# Get all mappings
GET /api/inventory/mappings

# Create mapping
POST /api/inventory/mappings
{
  "odooProduct": {
    "id": 1234,
    "default_code": "SKU-001"
  },
  "destyProduct": {
    "itemId": "desty-123",
    "itemExternalCode": "SKU-001",
    "shopId": "shop-001"
  }
}
```

### Stock Comparison

```bash
# Get product stock from both systems
GET /api/inventory/stock?sku=SKU-001
```

## ⏰ Scheduled Jobs

### Main Sync Job

Runs every hour (configurable):

```javascript
// Automatically triggered by scheduler
await inventorySyncJob.run();
```

### Health Check

Runs every 30 minutes:

```javascript
const health = await inventorySyncJob.healthCheck();
```

### Stock Validation

Runs every 6 hours:

```javascript
await scheduler.validateStockLevels();
```

## 🔍 Monitoring & Debugging

### Sync Statistics

```javascript
// Get 24-hour sync stats
const stats = await inventorySyncService.getSyncStats(24);

console.log('Sync Statistics:', stats);
// [
//   { source: 'odoo', target: 'desty', status: 'success', count: 145 },
//   { source: 'desty', target: 'odoo', status: 'failed', count: 3 }
// ]
```

### Failed Syncs

```javascript
// Get recent failures
const failures = await inventorySyncService.getFailedSyncs(24);

console.log('Failed Syncs:', failures);
```

### Health Check

```javascript
const health = await inventorySyncJob.healthCheck();

console.log('Health Status:', health);
// {
//   status: 'healthy',
//   successRate: 98.5,
//   failedCount: 2,
//   isRunning: false
// }
```

## 🛠️ Configuration Options

### Sync Behavior

```javascript
// Sync intervals
INVENTORY_SYNC_INTERVAL=3600000        // 1 hour
INVENTORY_SYNC_BATCH_SIZE=50            // Products per batch
INVENTORY_SYNC_RETRY_ATTEMPTS=3         // Max retries

// Stock tolerance
INVENTORY_STOCK_TOLERANCE=1            // Acceptable difference
INVENTORY_AUTO_APPROVE_THRESHOLD=10     // Auto-sync threshold
```

### Notification Settings

```javascript
// Email notifications
INVENTORY_NOTIFICATION_EMAIL=admin@company.com

// Slack notifications  
INVENTORY_SLACK_WEBHOOK=https://hooks.slack.com/...

// Alert thresholds
INVENTORY_FAILURE_ALERT_THRESHOLD=10   // Alert after X failures
INVENTORY_HEALTH_CHECK_INTERVAL=1800000 // 30 minutes
```

## 🔄 Sync Flow

### Odoo → Desty (Real-time)

1. **Stock Move Detected** in Odoo
2. **Calculate Current Stock** for product
3. **Find Product Mapping** 
4. **Update Desty Stock** via API
5. **Log Sync Result**

### Desty → Odoo (Scheduled)

1. **Get Active Mappings** from database
2. **Fetch Desty Stock** for each product
3. **Fetch Odoo Stock** for each product  
4. **Compare Stock Levels**
5. **Sync if Different** (with tolerance)
6. **Log Results**

## 🚨 Error Handling

### Retry Logic

```javascript
// Automatic retry with exponential backoff
await inventorySyncService.handleFailedSync(
  'SKU-001', 
  'desty', 
  'odoo', 
  50, 
  error
);
```

### Manual Review Queue

```javascript
// Failed syncs queued for manual review
await inventorySyncService.escalateToManualReview(
  'SKU-001',
  'desty',
  'odoo', 
  50,
  error
);
```

### Conflict Resolution

```javascript
// Built-in conflict resolution rules
const resolvedStock = inventorySyncService.resolveConflict(
  'odoo',     // source
  'desty',    // target
  100,        // source stock
  95          // target stock
);
```

## 📊 Performance Optimization

### Batch Processing

```javascript
// Process in batches to avoid API limits
const batchSize = 50;
for (let i = 0; i < mappings.length; i += batchSize) {
  const batch = mappings.slice(i, i + batchSize);
  await processBatch(batch);
}
```

### Caching

```javascript
// Cache product mappings
const mappings = await inventoryMappingService.getActiveMappings();
// Cache for 1 hour
```

### Rate Limiting

```javascript
// Respect API rate limits
await delay(1000); // 1 second between API calls
```

## 🧪 Testing

### Unit Tests

```bash
# Run inventory sync tests
npm test -- --grep "inventory sync"
```

### Integration Tests

```bash
# Test end-to-end sync flow
npm run test:integration:inventory
```

### Manual Testing

```bash
# Trigger manual sync
curl -X POST http://localhost:3000/api/inventory/sync \
  -H "Content-Type: application/json" \
  -d '{"direction": "odoo-to-desty", "productId": 1234}'
```

## 📈 Monitoring Dashboard

Create a monitoring dashboard to track:

- **Sync Success Rate**: Target >95%
- **Sync Latency**: Target <5 minutes  
- **Failed Syncs**: Alert if >10 per hour
- **System Health**: Real-time status
- **Product Coverage**: % of products synced

## 🔒 Security Considerations

- **API Keys**: Store securely in environment variables
- **Rate Limiting**: Implement client-side rate limiting
- **Data Validation**: Validate all API inputs
- **Error Logging**: Don't log sensitive data
- **Access Control**: Secure API endpoints with authentication

## 🚀 Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables

```bash
# Production
NODE_ENV=production
INVENTORY_SYNC_ENABLED=true
INVENTORY_SYNC_INTERVAL=3600000
```

### Health Check

```javascript
// Health check endpoint
app.get('/health/inventory', async (req, res) => {
  const health = await inventorySyncJob.healthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

## 📞 Support

For issues and questions:

1. **Check Logs**: Review sync logs for errors
2. **Health Check**: Verify system health status
3. **Configuration**: Validate environment settings
4. **API Status**: Check Desty/Odoo API connectivity

## 🔄 Maintenance

### Daily

- Monitor sync success rate
- Review failed syncs
- Check system health

### Weekly

- Review manual review queue
- Update product mappings
- Optimize batch sizes

### Monthly

- Clean up old logs
- Review performance metrics
- Update configurations

This implementation provides a robust, scalable inventory sync solution between Odoo and Desty marketplace platform.
