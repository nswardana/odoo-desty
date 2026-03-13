# Desty Bridge (Desty → Odoo v12)

## Webhook Endpoints

### Desty Webhooks
- `POST /webhook/desty` - Main webhook endpoint for Desty events
- `POST /webhook/desty/sync` - Sync products from Desty
- `GET /webhook/desty/mappings` - Get product mappings for Desty
- `GET /webhook/desty/orders` - Get orders from Desty (with filtering)
- `GET /webhook/desty/orders/:order_id` - Get specific order by ID
- `POST /webhook/desty/test` - Test webhook functionality

### Desty GET Orders API

#### Get Multiple Orders
```
GET /webhook/desty/orders
```

Query Parameters:
- `shop_id` (optional) - Filter by shop ID
- `status` (optional) - Filter by order status
- `limit` (optional, default: 50) - Number of orders to return
- `offset` (optional, default: 0) - Number of orders to skip
- `start_date` (optional) - Filter orders from this date (ISO format)
- `end_date` (optional) - Filter orders until this date (ISO format)
- `order_id` (optional) - Filter by specific order ID

Example:
```
GET /webhook/desty/orders?shop_id=123&status=pending&limit=10&offset=0
```

#### Get Single Order
```
GET /webhook/desty/orders/:order_id
```

Example:
```
GET /webhook/desty/orders/DESTY-001
```

### Supported Desty Events
- `order.created` - New order created
- `order.updated` - Order status updated
- `product.updated` - Product information updated
- `inventory.updated` - Inventory levels updated
