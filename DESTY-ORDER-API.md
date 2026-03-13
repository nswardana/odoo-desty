# Desty Order API Documentation

## 📋 Overview

This document describes the Desty Order API endpoints available in your marketplace middleware system. These endpoints allow you to manage orders in Desty directly through your middleware, providing comprehensive order management capabilities.

## 🔐 Authentication

The Desty Order API supports two authentication methods:

### 1. API Key Authentication (Recommended)
```bash
curl -X GET http://localhost:3000/desty/orders \
  -H "X-API-Key: your_desty_api_key"
```

### 2. OAuth Authentication
```bash
curl -X GET http://localhost:3000/desty/orders \
  -H "Authorization: Bearer your_oauth_access_token"
```

## 📦 Order Endpoints

### GET /desty/orders
Get all orders from Desty with advanced filtering and pagination.

**Request:**
```bash
curl -X GET "http://localhost:3000/desty/orders?page=1&limit=50&status=pending&payment_status=paid&shipping_status=preparing&date_from=2026-03-01&date_to=2026-03-31&customer_id=CUST001" \
  -H "X-API-Key: your_desty_api_key"
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)
- `status` (optional): Filter by order status
- `payment_status` (optional): Filter by payment status
- `shipping_status` (optional): Filter by shipping status
- `date_from` (optional): Filter orders from date
- `date_to` (optional): Filter orders to date
- `customer_id` (optional): Filter by customer ID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "ORDER123",
      "customer_id": "CUST001",
      "customer_name": "John Doe",
      "customer_email": "john@example.com",
      "status": "pending",
      "payment_status": "paid",
      "shipping_status": "preparing",
      "total_amount": 150000,
      "currency": "IDR",
      "items": [
        {
          "product_id": "PROD001",
          "product_sku": "DOG-FOOD-PREM-001",
          "product_name": "Dog Food Premium",
          "quantity": 2,
          "price": 75000,
          "total": 150000
        }
      ],
      "shipping_address": {
        "name": "John Doe",
        "phone": "+628123456789",
        "address": "123 Main Street",
        "city": "Jakarta",
        "postal_code": "12345"
      },
      "created_at": "2026-03-13T10:00:00Z",
      "updated_at": "2026-03-13T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 125
  },
  "auth_method": "API Key",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### GET /desty/orders/:orderId
Get a specific order by ID.

**Request:**
```bash
curl -X GET http://localhost:3000/desty/orders/ORDER123 \
  -H "X-API-Key: your_desty_api_key"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "ORDER123",
    "customer_id": "CUST001",
    "customer_name": "John Doe",
    "customer_email": "john@example.com",
    "status": "confirmed",
    "payment_status": "paid",
    "shipping_status": "shipped",
    "total_amount": 150000,
    "currency": "IDR",
    "items": [...],
    "shipping_address": {...},
    "tracking_numbers": ["TRK123456789"],
    "created_at": "2026-03-13T10:00:00Z",
    "updated_at": "2026-03-13T11:00:00Z"
  },
  "auth_method": "API Key",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### POST /desty/orders
Create a new order in Desty.

**Request:**
```bash
curl -X POST http://localhost:3000/desty/orders \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_desty_api_key" \
  -d '{
    "customer_id": "CUST001",
    "shop_id": "DESTY_SHOP_001",
    "items": [
      {
        "product_id": "PROD001",
        "product_sku": "DOG-FOOD-PREM-001",
        "quantity": 2,
        "price": 75000
      },
      {
        "product_id": "PROD002",
        "product_sku": "CAT-TOY-001",
        "quantity": 1,
        "price": 15000
      }
    ],
    "shipping_address": {
      "name": "John Doe",
      "phone": "+628123456789",
      "email": "john@example.com",
      "address": "123 Main Street",
      "city": "Jakarta",
      "province": "DKI Jakarta",
      "postal_code": "12345",
      "country": "Indonesia"
    },
    "notes": "Order created via middleware API",
    "payment_method": "transfer"
  }'
```

**Required Fields:**
- `customer_id`: Customer identifier
- `items`: Array of order items

**Required Item Fields:**
- `product_id`: Product identifier
- `quantity`: Order quantity
- `price`: Unit price

**Optional Fields:**
- `shop_id`: Shop identifier
- `shipping_address`: Complete shipping address
- `notes`: Order notes
- `payment_method`: Payment method

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "ORDER456",
    "customer_id": "CUST001",
    "status": "pending",
    "total_amount": 165000,
    "items": [...],
    "created_at": "2026-03-13T10:00:00Z"
  },
  "message": "Order created successfully",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### PUT /desty/orders/:orderId
Update an existing order in Desty.

**Request:**
```bash
curl -X PUT http://localhost:3000/desty/orders/ORDER123 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_desty_api_key" \
  -d '{
    "shipping_address": {
      "address": "456 Updated Street",
      "city": "Surabaya"
    },
    "notes": "Updated shipping address"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "ORDER123",
    "shipping_address": {
      "address": "456 Updated Street",
      "city": "Surabaya"
    },
    "updated_at": "2026-03-13T11:00:00Z"
  },
  "message": "Order updated successfully",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

## 🎯 Order Action Endpoints

### POST /desty/orders/:orderId/confirm
Confirm an order in Desty.

**Request:**
```bash
curl -X POST http://localhost:3000/desty/orders/ORDER123/confirm \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_desty_api_key" \
  -d '{
    "notes": "Order confirmed and ready for processing",
    "confirmed_at": "2026-03-13T10:00:00Z"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "ORDER123",
    "status": "confirmed",
    "confirmed_at": "2026-03-13T10:00:00Z"
  },
  "message": "Order confirmed successfully",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### POST /desty/orders/:orderId/cancel
Cancel an order in Desty.

**Request:**
```bash
curl -X POST http://localhost:3000/desty/orders/ORDER123/cancel \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_desty_api_key" \
  -d '{
    "reason": "Customer request",
    "note": "Customer requested cancellation due to change of mind"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "ORDER123",
    "status": "cancelled",
    "cancelled_at": "2026-03-13T10:00:00Z",
    "reason": "Customer request"
  },
  "message": "Order cancelled successfully",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### POST /desty/orders/:orderId/ship
Create shipment for an order in Desty.

**Request:**
```bash
curl -X POST http://localhost:3000/desty/orders/ORDER123/ship \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_desty_api_key" \
  -d '{
    "tracking_number": "TRK123456789",
    "carrier": "JNE",
    "service": "REG",
    "estimated_delivery": "2026-03-15T10:00:00Z",
    "notes": "Shipped via JNE Regular service"
  }'
```

**Required Fields:**
- `tracking_number`: Shipment tracking number
- `carrier`: Shipping carrier name

**Optional Fields:**
- `service`: Shipping service type
- `estimated_delivery`: Estimated delivery date
- `notes`: Shipment notes

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "ORDER123",
    "tracking_number": "TRK123456789",
    "carrier": "JNE",
    "status": "shipped",
    "shipped_at": "2026-03-13T10:00:00Z"
  },
  "message": "Shipment created successfully",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

## 🔍 Order Utility Endpoints

### GET /desty/orders/search
Search orders in Desty with multiple search criteria.

**Request:**
```bash
curl -X GET "http://localhost:3000/desty/orders/search?q=dog food&customer_name=John&customer_email=john@example.com&product_sku=DOG-FOOD-PREM-001&status=pending&page=1&limit=20" \
  -H "X-API-Key: your_desty_api_key"
```

**Query Parameters:**
- `q` (optional): General search query
- `customer_name` (optional): Search by customer name
- `customer_email` (optional): Search by customer email
- `product_sku` (optional): Search by product SKU
- `status` (optional): Filter by order status
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**At least one search parameter is required.**

**Response:**
```json
{
  "success": true,
  "query": {
    "q": "dog food",
    "customer_name": "John",
    "customer_email": "john@example.com",
    "product_sku": "DOG-FOOD-PREM-001"
  },
  "data": [
    {
      "id": "ORDER123",
      "customer_name": "John Doe",
      "items": [
        {
          "product_sku": "DOG-FOOD-PREM-001",
          "product_name": "Dog Food Premium"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5
  },
  "auth_method": "API Key",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### GET /desty/orders/stats
Get order statistics from Desty.

**Request:**
```bash
curl -X GET "http://localhost:3000/desty/orders/stats?date_from=2026-03-01&date_to=2026-03-31&shop_id=DESTY_SHOP_001&status=completed" \
  -H "X-API-Key: your_desty_api_key"
```

**Query Parameters:**
- `date_from` (optional): Statistics start date
- `date_to` (optional): Statistics end date
- `shop_id` (optional): Filter by shop
- `status` (optional): Filter by order status

**Response:**
```json
{
  "success": true,
  "data": {
    "total_orders": 150,
    "completed_orders": 120,
    "pending_orders": 25,
    "cancelled_orders": 5,
    "total_revenue": 15000000,
    "average_order_value": 100000,
    "top_products": [
      {
        "product_sku": "DOG-FOOD-PREM-001",
        "quantity_sold": 80,
        "revenue": 6000000
      }
    ],
    "daily_breakdown": [
      {
        "date": "2026-03-13",
        "orders": 25,
        "revenue": 2500000
      }
    ]
  },
  "filters": {
    "date_from": "2026-03-01",
    "date_to": "2026-03-31",
    "shop_id": "DESTY_SHOP_001",
    "status": "completed"
  },
  "timestamp": "2026-03-13T10:00:00Z"
}
```

## 🚨 Error Handling

### Common Error Responses

#### 401 Unauthorized
```json
{
  "error": "Invalid API key",
  "details": null
}
```

#### 400 Bad Request
```json
{
  "error": "Missing required fields: customer_id, items",
  "details": null
}
```

#### 404 Not Found
```json
{
  "error": "Order not found",
  "order_id": "ORDER999"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Desty API error: Request timeout",
  "details": {
    "code": "TIMEOUT",
    "message": "Request to Desty API timed out"
  }
}
```

## 🔧 Usage Examples

### Bulk Order Processing
```javascript
const orders = [
  {
    customer_id: 'CUST001',
    items: [
      { product_id: 'PROD001', quantity: 2, price: 75000 }
    ]
  },
  {
    customer_id: 'CUST002',
    items: [
      { product_id: 'PROD002', quantity: 1, price: 50000 }
    ]
  }
];

for (const order of orders) {
  const response = await fetch('/desty/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'your_desty_api_key'
    },
    body: JSON.stringify(order)
  });
  
  const result = await response.json();
  console.log(`Order created: ${result.data.id}`);
}
```

### Order Status Management
```javascript
// Confirm order
const confirmResponse = await fetch('/desty/orders/ORDER123/confirm', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your_desty_api_key'
  },
  body: JSON.stringify({ notes: 'Order ready for processing' })
});

// Ship order
const shipResponse = await fetch('/desty/orders/ORDER123/ship', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your_desty_api_key'
  },
  body: JSON.stringify({
    tracking_number: 'TRK123456789',
    carrier: 'JNE'
  })
});
```

### Advanced Order Search
```javascript
const searchParams = new URLSearchParams({
  customer_name: 'John Doe',
  status: 'pending',
  page: '1',
  limit: '50'
});

const searchResponse = await fetch(`/desty/orders/search?${searchParams}`, {
  headers: {
    'X-API-Key': 'your_desty_api_key'
  }
});

const results = await searchResponse.json();
console.log(`Found ${results.pagination.total} orders`);
```

## 📊 Integration with Order Processing

The Desty Order API integrates seamlessly with your existing order processing system:

### Automatic Order Queue Integration
- **New orders** → Automatically queued for processing
- **Order updates** → Real-time status synchronization
- **Shipment creation** → Tracking number updates
- **Order confirmation** → Odoo integration trigger

### Multi-Channel Order Management
- **Unified order dashboard** across all platforms
- **Centralized order tracking** and management
- **Consistent order processing** workflow
- **Real-time order status** updates

### Advanced Order Analytics
- **Order statistics** and reporting
- **Performance metrics** tracking
- **Revenue analytics** by period
- **Customer behavior** analysis

## 🚀 Production Deployment

### Environment Configuration
```bash
# Required for production
DESTY_API_KEY=your_production_api_key
DESTY_CLIENT_ID=your_production_client_id
DESTY_CLIENT_SECRET=your_production_client_secret

# Optional
DESTY_API_BASE_URL=https://api.desty.app
DESTY_RATE_LIMIT=120
```

### Rate Limiting
- Production: 120 requests per minute
- Development: No limits
- Automatic retry on rate limit errors
- Request queuing for high-volume operations

### Monitoring
All order API calls are logged with:
- Request timestamp and endpoint
- Authentication method used
- Order ID and customer information
- Response status and processing time
- Error details and recovery actions

---

**🎉 Your Desty Order API is now fully integrated!**

This completes your comprehensive order management system with full CRUD operations, advanced search, order actions, and analytics capabilities. Combined with the Product API, you now have complete control over your Desty marketplace operations.
