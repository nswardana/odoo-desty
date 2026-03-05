# Marketplace Middleware Architecture

## Overview
Middleware yang menghubungkan multiple marketplace dengan Odoo Master system.

```
              ODOO (MASTER)
        ┌────────────┬────────────┐
        │            │            │
     Stock        Pricelist    Product
        │            │            │
        └────────────┴────────────┘
                     ↓
               Middleware
                     ↓
   ┌──────────┬──────────┬──────────┬──────────┐
   Shopee   Tokopedia   Lazada    TikTok
```

## Features

### 🏪 **Multi-Marketplace Support**
- **Shopee** - `/webhook/shopee`
- **Tokopedia** - `/webhook/tokopedia` 
- **Lazada** - `/webhook/lazada`
- **TikTok Shop** - `/webhook/tiktok`

### 🔄 **Order Standardization**
- Mengubah format order dari berbagai marketplace ke format standar
- Automatic branch assignment per marketplace
- Item standardization (name, sku, qty, price)

### 📦 **Odoo Integration**
- **Product Management** - Create, read, update products
- **Stock Management** - Real-time stock checking and updates
- **Pricelist Management** - Multiple pricing support
- **Warehouse Management** - Multi-warehouse order routing

### 🏭 **Branch & Warehouse Mapping**
```
KEDURUS → SKDR (Beepetmart DZ Petshop Kedurus)
GUBENG → GBG (Beepetmart DZ Petshop Gubeng)
PUCANG → SPCG (Beepetmart DZ Petshop Pucang)
```

## API Endpoints

### Webhook Endpoints
- `POST /webhook/shopee` - Shopee order webhook
- `POST /webhook/tokopedia` - Tokopedia order webhook
- `POST /webhook/lazada` - Lazada order webhook
- `POST /webhook/tiktok` - TikTok order webhook

### Management Endpoints
- `GET /health` - Service health check
- `GET /api/marketplaces` - List supported marketplaces

## Order Processing Flow

1. **Webhook Received** - Order dari marketplace masuk ke middleware
2. **Standardization** - Data order di-convert ke format standar
3. **Queue Processing** - Order masuk ke antrian Redis queue
4. **Odoo Integration** - Order diproses ke Odoo Master system
5. **Confirmation** - Order dikonfirmasi dan stock ter-update

## Standard Order Format

```json
{
  "order_sn": "SP999001",
  "buyer_username": "Customer Name",
  "branch": "KEDURUS",
  "items": [
    {
      "name": "Product Name",
      "sku": "PRODUCT-SKU-001",
      "qty": 2,
      "price": 50000
    }
  ],
  "marketplace": "shopee",
  "raw_data": { ... }
}
```

## Services Structure

### 📁 **Services**
- `marketplaceService.js` - Multi-marketplace coordination
- `orderService.js` - Order processing logic
- `odooService.js` - Odoo XML-RPC client
- `odooMasterService.js` - Odoo Master operations
- `productService.js` - Product management
- `mappingService.js` - Branch & warehouse mapping

### 📁 **Core**
- `server.js` - Express API server
- `worker.js` - Queue processor
- `queue.js` - Redis queue configuration

## Configuration

### Environment Variables
```env
PORT=3000
ODOO_URL=https://rap.beepetmart.com
ODOO_DB=RAP
ODOO_USERNAME=bintangtimurjaya.cv@gmail.com
ODOO_PASSWORD=b33p3t103d
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

## Testing

### Test All Marketplaces
```bash
# Shopee
curl -X POST http://localhost:3000/webhook/shopee \
  -H "Content-Type: application/json" \
  -d '{"order_sn":"SP001","buyer_username":"Test","branch":"KEDURUS","items":[{"name":"Test","sku":"TEST001","qty":1,"price":10000}]}'

# Tokopedia  
curl -X POST http://localhost:3000/webhook/tokopedia \
  -H "Content-Type: application/json" \
  -d '{"order_sn":"TKP001","buyer_username":"Test","branch":"GUBENG","items":[{"name":"Test","sku":"TEST002","qty":1,"price":10000}]}'

# Health Check
curl http://localhost:3000/health

# Marketplace Info
curl http://localhost:3000/api/marketplaces
```

## Benefits

✅ **Scalable** - Easy to add new marketplaces  
✅ **Standardized** - Unified order format  
✅ **Reliable** - Queue-based processing  
✅ **Flexible** - Multi-warehouse support  
✅ **Integrated** - Real-time Odoo sync
