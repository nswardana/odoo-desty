# Desty Product API Documentation

## 📋 Overview

This document describes the Desty Product API endpoints available in your marketplace middleware system. These endpoints allow you to manage products in Desty directly through your middleware.

## 🔐 Authentication

The Desty Product API supports two authentication methods:

### 1. API Key Authentication (Recommended)
```bash
curl -X GET http://localhost:3000/desty/products \
  -H "X-API-Key: your_desty_api_key"
```

### 2. OAuth Authentication
```bash
curl -X GET http://localhost:3000/desty/products \
  -H "Authorization: Bearer your_oauth_access_token"
```

## 📦 Product Endpoints

### GET /desty/products
Get all products from Desty with pagination support.

**Request:**
```bash
curl -X GET "http://localhost:3000/desty/products?page=1&limit=50&search=dog&category=pet-food&status=active" \
  -H "X-API-Key: your_desty_api_key"
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)
- `search` (optional): Search term
- `category` (optional): Filter by category
- `status` (optional): Filter by status

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "prod_123",
      "name": "Dog Food Premium",
      "sku": "DOG-FOOD-PREM-001",
      "price": 75000,
      "category": "pet-food",
      "stock": 100,
      "status": "active"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150
  },
  "auth_method": "API Key",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### GET /desty/products/:productId
Get a specific product by ID.

**Request:**
```bash
curl -X GET http://localhost:3000/desty/products/prod_123 \
  -H "X-API-Key: your_desty_api_key"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "prod_123",
    "name": "Dog Food Premium",
    "sku": "DOG-FOOD-PREM-001",
    "price": 75000,
    "description": "Premium dog food for adult dogs",
    "category": "pet-food",
    "stock": 100,
    "status": "active",
    "images": [...],
    "attributes": {...}
  },
  "auth_method": "API Key",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### POST /desty/products
Create a new product in Desty.

**Request:**
```bash
curl -X POST http://localhost:3000/desty/products \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_desty_api_key" \
  -d '{
    "name": "Cat Toy Premium",
    "sku": "CAT-TOY-PREM-001",
    "price": 15000,
    "description": "Premium cat toy with safe materials",
    "category": "pet-toys",
    "stock": 50,
    "weight": 200,
    "dimensions": {
      "length": 10,
      "width": 10,
      "height": 5
    },
    "images": [
      "https://example.com/image1.jpg",
      "https://example.com/image2.jpg"
    ]
  }'
```

**Required Fields:**
- `name`: Product name
- `sku`: Product SKU
- `price`: Product price

**Optional Fields:**
- `description`: Product description
- `category`: Product category
- `stock`: Stock quantity
- `weight`: Product weight (grams)
- `dimensions`: Product dimensions (cm)
- `images`: Array of image URLs

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "prod_456",
    "name": "Cat Toy Premium",
    "sku": "CAT-TOY-PREM-001",
    "price": 15000,
    "status": "active"
  },
  "message": "Product created successfully",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### PUT /desty/products/:productId
Update an existing product in Desty.

**Request:**
```bash
curl -X PUT http://localhost:3000/desty/products/prod_123 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_desty_api_key" \
  -d '{
    "name": "Dog Food Premium (Updated)",
    "price": 80000,
    "stock": 150,
    "description": "Updated description for premium dog food"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "prod_123",
    "name": "Dog Food Premium (Updated)",
    "sku": "DOG-FOOD-PREM-001",
    "price": 80000,
    "stock": 150
  },
  "message": "Product updated successfully",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### DELETE /desty/products/:productId
Delete a product from Desty.

**Request:**
```bash
curl -X DELETE http://localhost:3000/desty/products/prod_123 \
  -H "X-API-Key: your_desty_api_key"
```

**Response:**
```json
{
  "success": true,
  "message": "Product deleted successfully",
  "product_id": "prod_123",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

## 🔍 Utility Endpoints

### POST /desty/products/sync
Sync products from Desty to local mapping system.

**Request:**
```bash
curl -X POST http://localhost:3000/desty/products/sync \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_desty_api_key" \
  -d '{
    "shop_id": "DESTY_SHOP_001",
    "limit": 100
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Synced 95 products successfully",
  "total_processed": 100,
  "success_count": 95,
  "error_count": 5,
  "results": [
    {
      "product_id": "prod_123",
      "sku": "DOG-FOOD-PREM-001",
      "status": "success"
    },
    {
      "product_id": "prod_124",
      "sku": "CAT-TOY-001",
      "status": "error",
      "error": "Invalid SKU format"
    }
  ],
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### GET /desty/products/search
Search products in Desty.

**Request:**
```bash
curl -X GET "http://localhost:3000/desty/products/search?q=dog food&category=pet-food&min_price=10000&max_price=100000&page=1&limit=20" \
  -H "X-API-Key: your_desty_api_key"
```

**Query Parameters:**
- `q` (required): Search query
- `category` (optional): Filter by category
- `min_price` (optional): Minimum price filter
- `max_price` (optional): Maximum price filter
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response:**
```json
{
  "success": true,
  "query": "dog food",
  "data": [
    {
      "id": "prod_123",
      "name": "Dog Food Premium",
      "sku": "DOG-FOOD-PREM-001",
      "price": 75000,
      "category": "pet-food"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 25
  },
  "auth_method": "API Key",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### GET /desty/products/categories
Get all product categories from Desty.

**Request:**
```bash
curl -X GET http://localhost:3000/desty/products/categories \
  -H "X-API-Key: your_desty_api_key"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "pet-food",
      "name": "Pet Food",
      "parent_id": null,
      "product_count": 150
    },
    {
      "id": "pet-toys",
      "name": "Pet Toys",
      "parent_id": null,
      "product_count": 75
    }
  ],
  "total": 2,
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
  "error": "Missing required fields: name, sku, price",
  "details": null
}
```

#### 404 Not Found
```json
{
  "error": "Product not found",
  "product_id": "prod_999"
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

### Bulk Product Creation
```javascript
const products = [
  {
    name: "Product 1",
    sku: "PROD-001",
    price: 10000,
    category: "electronics"
  },
  {
    name: "Product 2", 
    sku: "PROD-002",
    price: 20000,
    category: "electronics"
  }
];

for (const product of products) {
  const response = await fetch('/desty/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'your_desty_api_key'
    },
    body: JSON.stringify(product)
  });
  
  console.log(await response.json());
}
```

### Product Search and Filter
```javascript
const searchParams = new URLSearchParams({
  q: 'dog food',
  category: 'pet-food',
  min_price: '10000',
  max_price: '100000',
  page: '1',
  limit: '20'
});

const response = await fetch(`/desty/products/search?${searchParams}`, {
  headers: {
    'X-API-Key': 'your_desty_api_key'
  }
});

const results = await response.json();
console.log('Found products:', results.data);
```

### Product Synchronization
```javascript
const syncResponse = await fetch('/desty/products/sync', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your_desty_api_key'
  },
  body: JSON.stringify({
    shop_id: 'DESTY_SHOP_001',
    limit: 100
  })
});

const syncResults = await syncResponse.json();
console.log(`Synced ${syncResults.success_count} products`);
console.log(`Failed: ${syncResults.error_count} products`);
```

## 📊 Integration with Order Processing

The Desty Product API integrates seamlessly with your order processing system:

### Automatic SKU Validation
When orders come through Desty webhooks, the system automatically:
1. Validates SKU against product database
2. Checks stock availability
3. Verifies pricing
4. Syncs with Odoo inventory

### Real-time Updates
- Product changes in Desty → Local mapping updates
- Stock adjustments → Order processing updates
- Price changes → Real-time validation

### Error Handling
- Invalid SKUs → Admin notifications
- Low stock alerts → Automatic warnings
- Product not found → Order rejection with details

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

### Monitoring
All product API calls are logged with:
- Request timestamp
- Authentication method used
- Response status
- Processing time
- Error details (if any)

---

**🎉 Your Desty Product API is now fully integrated!**

This completes your marketplace middleware with comprehensive product management capabilities across all 5 platforms: Shopee, Tokopedia, Lazada, TikTok, and Desty.
