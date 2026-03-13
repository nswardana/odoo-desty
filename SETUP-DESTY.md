# Desty API Integration Setup Guide

## 📋 Overview

Desty is a comprehensive e-commerce platform that provides API endpoints for order management, product synchronization, inventory tracking, and more. This guide will help you integrate Desty with your marketplace middleware system.

## 🚀 Quick Start

### 1. Get Desty Credentials

You'll need the following credentials from your Desty dashboard:

```bash
# OAuth Credentials
DESTY_CLIENT_ID=your_desty_client_id
DESTY_CLIENT_SECRET=your_desty_client_secret
DESTY_REDIRECT_URI=http://localhost:3000/desty/callback

# API Access
DESTY_API_KEY=your_desty_api_key
DESTY_WEBHOOK_SECRET=your_desty_webhook_secret
```

### 2. Update Environment

Update your `.env` file with Desty credentials:

```bash
# Desty Configuration
DESTY_CLIENT_ID=your_actual_client_id
DESTY_CLIENT_SECRET=your_actual_client_secret
DESTY_API_KEY=your_actual_api_key
DESTY_WEBHOOK_SECRET=your_actual_webhook_secret
DESTY_REDIRECT_URI=http://localhost:3000/desty/callback
```

### 3. Test Integration

```bash
# Health Check
curl -X GET http://localhost:3000/webhook/desty/health

# OAuth Authorization
curl -X GET http://localhost:3000/desty/authorize

# Order Processing Test
curl -X POST http://localhost:3000/api/odoo/orders/process \
  -H "Content-Type: application/json" \
  -d '{
    "marketplace": "desty",
    "shop_id": "DESTY_SHOP_001",
    "marketplace_order_id": "TEST123",
    "customer": {"name": "Test Customer"},
    "items": [{
      "sku": "DOG-FOOD-PREM-001",
      "name": "Dog Food Premium 1kg",
      "quantity": 1,
      "price": 75000
    }]
  }'
```

## 🔐 OAuth Authentication Flow

### Step 1: Initiate OAuth

```bash
curl -X GET http://localhost:3000/desty/authorize
```

**Response:**
```json
{
  "success": true,
  "authorization_url": "https://api.desty.app/oauth/authorize?client_id=your_client_id&...",
  "state": "random_state_string",
  "message": "Visit the authorization URL to grant access to your Desty store"
}
```

### Step 2: Authorize Application

1. Visit the returned authorization URL
2. Login to your Desty account
3. Grant permissions for the requested scopes
4. You'll be redirected back to your callback URL

### Step 3: Handle Callback

The system automatically handles the OAuth callback and stores the access token.

### Step 4: Check Authentication Status

```bash
curl -X GET http://localhost:3000/desty/status
```

## 📡 Webhook Configuration

### Supported Webhook Events

| Event | Description | Action |
|-------|-------------|--------|
| `order.created` | New order created | Queue for processing |
| `order.updated` | Order details updated | Update existing order |
| `order.paid` | Order payment confirmed | Confirm order in Odoo |
| `order.confirmed` | Order confirmed by seller | Update order status |
| `product.created` | New product added | Sync product data |
| `product.updated` | Product information updated | Update product mapping |
| `product.price_changed` | Product price updated | Update pricing |
| `inventory.updated` | Stock levels changed | Update inventory |
| `payment.completed` | Payment processed | Update payment status |
| `payment.failed` | Payment failed | Handle payment issue |
| `shipment.created` | Shipping order created | Create shipment |
| `shipment.updated` | Shipping status updated | Track shipment |
| `shipment.delivered` | Order delivered | Complete order |

### Configure Webhooks in Desty

1. Login to your Desty dashboard
2. Navigate to Settings > Webhooks
3. Add webhook URL: `https://your-domain.com/webhook/desty`
4. Configure events you want to receive
5. Set webhook secret for signature validation

### Webhook Testing

```bash
# Test webhook connectivity
curl -X GET http://localhost:3000/webhook/desty/test

# Test webhook with payload
curl -X POST http://localhost:3000/webhook/desty \
  -H "Content-Type: application/json" \
  -H "X-Desty-Signature: test_signature" \
  -d '{
    "event": "order.created",
    "order_id": "TEST123",
    "customer": {"name": "Test Customer"},
    "items": [{"sku": "TEST-SKU", "quantity": 1, "price": 10000}]
  }'
```

## 🛒 Order Processing

### Order Format

Desty orders are automatically standardized to the common format:

```javascript
{
  order_sn: "order_id",
  buyer_username: "customer_name", 
  branch: "default_branch",
  items: [
    {
      name: "product_name",
      sku: "product_sku",
      qty: "quantity",
      price: "unit_price"
    }
  ],
  shop_id: "store_id",
  marketplace: "desty",
  raw_data: "original_desty_order"
}
```

### Processing Flow

1. **Webhook Received** - Order webhook from Desty
2. **Validation** - Check signature and format
3. **Standardization** - Convert to common format
4. **Queue Processing** - Add to order queue
5. **Odoo Integration** - Create/update sale order
6. **Confirmation** - Send success response

## 📦 Product Synchronization

### Manual Product Sync

```bash
curl -X POST http://localhost:3000/webhook/desty/sync \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_desty_api_key" \
  -d '{
    "shop_id": "DESTY_SHOP_001",
    "products": [
      {
        "product_id": "PROD001",
        "sku": "DOG-FOOD-PREM-001",
        "name": "Dog Food Premium 1kg",
        "price": 75000,
        "stock": 100
      }
    ]
  }'
```

### Get Product Mappings

```bash
curl -X GET "http://localhost:3000/webhook/desty/mappings?shop_id=DESTY_SHOP_001" \
  -H "X-API-Key: your_desty_api_key"
```

## 🔧 API Endpoints

### OAuth Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/desty/authorize` | Initiate OAuth flow |
| GET | `/desty/callback` | Handle OAuth callback |
| POST | `/desty/token` | Refresh access token |
| GET | `/desty/status` | Check authentication status |
| POST | `/desty/revoke` | Revoke access token |

### API Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/desty/stores` | List connected stores |
| POST | `/desty/api-key` | Generate API key |

### Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhook/desty` | Main webhook handler |
| POST | `/webhook/desty/sync` | Manual product sync |
| GET | `/webhook/desty/mappings` | Get product mappings |
| GET | `/webhook/desty/test` | Test webhook connectivity |
| GET | `/webhook/desty/health` | Health check |

## 🚨 Error Handling

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| 401 | Invalid signature | Check webhook secret |
| 401 | Invalid API key | Verify API key configuration |
| 400 | Missing required fields | Check request payload |
| 500 | Internal server error | Check server logs |

### Error Response Format

```json
{
  "error": "Error description",
  "details": "Additional error details",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

## 📊 Monitoring

### Health Check

```bash
curl -X GET http://localhost:3000/webhook/desty/health
```

**Response:**
```json
{
  "marketplace": "desty",
  "status": "healthy",
  "endpoints": {
    "webhook": "/webhook/desty",
    "sync": "/webhook/desty/sync",
    "mappings": "/webhook/desty/mappings",
    "test": "/webhook/desty/test"
  },
  "configuration": {
    "has_webhook_secret": true,
    "has_api_key": true,
    "base_url": "https://api.desty.app"
  },
  "supported_events": [...],
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### Logging

All Desty integration events are logged with the following format:

```
📥 Desty webhook received
✅ Desty order queued: ORDER123
🔄 Processing Desty product update...
💳 Processing Desty payment update...
📦 Processing Desty shipment update...
```

## 🔒 Security

### Signature Validation

Desty webhooks use HMAC-SHA256 signature validation:

```javascript
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');
```

### API Key Validation

API endpoints require valid API key in header:

```bash
curl -X GET http://localhost:3000/webhook/desty/mappings \
  -H "X-API-Key: your_desty_api_key"
```

## 🚀 Production Deployment

### Environment Variables

```bash
NODE_ENV=production
DESTY_CLIENT_ID=your_production_client_id
DESTY_CLIENT_SECRET=your_production_client_secret
DESTY_API_KEY=your_production_api_key
DESTY_WEBHOOK_SECRET=your_production_webhook_secret
DESTY_REDIRECT_URI=https://your-domain.com/desty/callback
```

### Webhook URLs

- **Development**: `http://localhost:3000/webhook/desty`
- **Production**: `https://your-domain.com/webhook/desty`

### Rate Limiting

Desty API rate limits are configured as:

```bash
DESTY_RATE_LIMIT=120  # requests per minute
```

## 📞 Support

### Troubleshooting

1. **Webhook not received**: Check webhook URL configuration in Desty
2. **Signature validation failed**: Verify webhook secret matches
3. **API key invalid**: Check API key generation and configuration
4. **OAuth flow fails**: Verify redirect URI matches Desty configuration

### Debug Commands

```bash
# Check authentication status
curl -X GET http://localhost:3000/desty/status

# Test webhook connectivity
curl -X GET http://localhost:3000/webhook/desty/test

# Check system health
curl -X GET http://localhost:3000/health
```

---

**🎉 Your Desty integration is now ready!** 

With Desty added, your marketplace middleware now supports 5 platforms: Shopee, Tokopedia, Lazada, TikTok, and Desty!
