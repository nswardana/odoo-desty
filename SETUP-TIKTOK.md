# TikTok Shop Partner Setup Guide

## 📋 Onboarding Checklist

### ✅ Completed
- [x] App Development
- [x] App Review  
- [x] Publish Button Active
- [x] Partner Registration Review

### 🔄 Next Steps

## 1. Get TikTok Shop Credentials

Setelah app di-publish, Anda akan mendapatkan:

```
TIKTOK_APP_ID=your_app_id_from_dashboard
TIKTOK_APP_SECRET=your_app_secret_from_dashboard
TIKTOK_SHOP_ID=your_shop_id
TIKTOK_SELLER_ID=your_seller_id
```

## 2. Webhook Configuration

TikTok Shop akan membutuhkan webhook endpoints:

```
Webhook URL: https://your-domain.com/webhook/tiktok
Events:
- order.created
- order.updated  
- order.paid
- order.cancelled
- product.updated
- inventory.updated
```

## 3. API Endpoints Testing

### Health Check
```bash
curl -X GET http://localhost:3000/health
```

### Token Status
```bash
curl -X GET http://localhost:3000/api/tokens
```

### Order Processing Test
```bash
curl -X POST http://localhost:3000/api/odoo/orders/process \
  -H "Content-Type: application/json" \
  -d '{
    "marketplace": "tiktok",
    "shop_id": "YOUR_TIKTOK_SHOP_ID",
    "marketplace_order_id": "TT123456",
    "customer": {
      "name": "TikTok Customer",
      "email": "customer@example.com"
    },
    "items": [
      {
        "sku": "DOG-FOOD-PREM-001",
        "name": "Dog Food Premium 1kg",
        "quantity": 1,
        "price": 75000
      }
    ]
  }'
```

## 4. Environment Variables Update

Update .env file dengan TikTok credentials:

```bash
# TikTok Shop
TIKTOK_APP_ID=your_actual_app_id
TIKTOK_APP_SECRET=your_actual_app_secret
TIKTOK_SHOP_ID=your_actual_shop_id
TIKTOK_SELLER_ID=your_actual_seller_id

# TikTok Webhook
TIKTOK_WEBHOOK_SECRET=your_tiktok_webhook_secret
```

## 5. Production Deployment

Untuk production:

```bash
# Update production config
NODE_ENV=production
PORT=3000

# Enable HTTPS
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem

# Production database
PG_HOST=production_db_host
REDIS_HOST=production_redis_host
```

## 6. Testing Checklist

### Basic Tests
- [ ] Health check endpoint
- [ ] Token management
- [ ] Order processing
- [ ] Error handling
- [ ] Webhook validation

### Integration Tests  
- [ ] TikTok Shop API connection
- [ ] Order sync from TikTok
- [ ] Product sync to TikTok
- [ ] Stock sync
- [ ] Odoo integration

### Security Tests
- [ ] Webhook signature validation
- [ ] Admin token protection
- [ ] Rate limiting
- [ ] Input validation

## 7. Go Live Checklist

### Before Launch
- [ ] All credentials configured
- [ ] SSL certificate installed
- [ ] Database backups enabled
- [ ] Monitoring setup
- [ ] Error logging configured

### After Launch
- [ ] Monitor error logs
- [ ] Check token refresh
- [ ] Verify order processing
- [ ] Test webhook delivery
- [ ] Monitor performance

## 8. Support & Monitoring

### Key Metrics to Monitor
- Order processing success rate
- Token refresh failures
- API response times
- Error rates
- Webhook delivery success

### Alert Thresholds
- Error rate > 5%
- Token refresh failures > 3
- API response time > 5s
- Webhook failures > 10%

## 9. Troubleshooting

### Common Issues
1. **Token Expired**: Check token refresh job
2. **Webhook Failures**: Verify signature validation
3. **Order Processing**: Check Odoo connection
4. **API Rate Limits**: Monitor rate limiting

### Debug Commands
```bash
# Check token status
curl -X GET http://localhost:3000/api/tokens/health

# Check error stats
curl -X GET http://localhost:3000/api/errors/stats \
  -H "X-Admin-Token: your_secure_admin_token_here"

# Manual token refresh
curl -X POST http://localhost:3000/api/tokens/refresh/tiktok \
  -H "X-Admin-Token: your_secure_admin_token_here"
```

## 10. Next Steps

After TikTok Shop is live:

1. **Tokopedia Integration** - Similar setup process
2. **Multi-marketplace Dashboard** - Unified management
3. **Advanced Analytics** - Sales reporting
4. **Automated Reconciliation** - Order matching
5. **Mobile App** - On-the-go management
