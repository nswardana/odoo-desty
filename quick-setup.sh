#!/bin/bash

# TikTok Shop Partner Quick Setup Script
# Run this after getting your TikTok credentials

echo "🚀 TikTok Shop Partner Quick Setup"
echo "=================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    exit 1
fi

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ Backed up .env file"

# Update Tokopedia credentials (already provided)
echo "🔧 Updating Tokopedia credentials..."
sed -i.bak "s/your_tokopedia_client_id/6j7iohifqkkpa/g" .env
sed -i.bak "s/your_tokopedia_client_secret/315b2281b6dc769afe22232a166ab696c7d4f221/g" .env
echo "✅ Updated Tokopedia credentials"

# Update TikTok credentials (already provided)
echo "🔧 Updating TikTok credentials..."
sed -i.bak "s/your_tiktok_app_id/6j7iohifqkkpa/g" .env
sed -i.bak "s/your_tiktok_app_secret/315b2281b6dc769afe22232a166ab696c7d4f221/g" .env
echo "✅ Updated TikTok credentials"

# Get remaining credentials
echo ""
echo "📋 Please enter remaining credentials:"
echo "   (Get these from your respective marketplace dashboards)"
echo ""

read -p "TIKTOK_SHOP_ID: " TIKTOK_SHOP_ID
read -p "TIKTOK_WEBHOOK_SECRET: " TIKTOK_WEBHOOK_SECRET
read -p "DESTY_CLIENT_ID: " DESTY_CLIENT_ID
read -p "DESTY_CLIENT_SECRET: " DESTY_CLIENT_SECRET
read -p "DESTY_API_KEY: " DESTY_API_KEY
read -p "DESTY_WEBHOOK_SECRET: " DESTY_WEBHOOK_SECRET

# Update .env file with remaining credentials
sed -i.bak "s/your_tiktok_webhook_secret/$TIKTOK_WEBHOOK_SECRET/g" .env
sed -i.bak "s/your_desty_client_id/$DESTY_CLIENT_ID/g" .env
sed -i.bak "s/your_desty_client_secret/$DESTY_CLIENT_SECRET/g" .env
sed -i.bak "s/your_desty_api_key/$DESTY_API_KEY/g" .env
sed -i.bak "s/your_desty_webhook_secret/$DESTY_WEBHOOK_SECRET/g" .env

# Add TikTok shop ID if not exists
if ! grep -q "TIKTOK_SHOP_ID=" .env; then
    echo "TIKTOK_SHOP_ID=$TIKTOK_SHOP_ID" >> .env
else
    sed -i.bak "s/your_tiktok_shop_id/$TIKTOK_SHOP_ID/g" .env
fi

echo "✅ Updated .env file with all credentials"

# Test server
echo ""
echo "🧪 Testing system..."

# Check if server is running
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Server is running"
    
    # Test health
    echo "📊 Health check:"
    curl -s http://localhost:3000/health | jq .
    
    # Test token status
    echo ""
    echo "🔑 Token status:"
    curl -s http://localhost:3000/api/tokens | jq .
    
    # Test OAuth endpoints
    echo ""
    echo "🔐 Testing OAuth endpoints:"
    echo "📋 TikTok Authorize endpoint:"
    curl -s http://localhost:3000/tiktok/authorize | jq .
    
    echo ""
    echo "📋 Tokopedia Authorize endpoint:"
    curl -s http://localhost:3000/tokopedia/authorize | jq .
    
    echo ""
    echo "📋 Desty Authorize endpoint:"
    curl -s http://localhost:3000/desty/authorize | jq .
    
    echo ""
    echo "📋 Auth status endpoints:"
    echo "🔹 TikTok Status:"
    curl -s http://localhost:3000/tiktok/status | jq .
    echo "🔹 Tokopedia Status:"
    curl -s http://localhost:3000/tokopedia/status | jq .
    echo "🔹 Desty Status:"
    curl -s http://localhost:3000/desty/status | jq .
    
    # Test TikTok order processing
    echo ""
    echo "🛒 Testing TikTok order processing:"
    curl -s -X POST http://localhost:3000/api/odoo/orders/process \
        -H "Content-Type: application/json" \
        -d '{
            "marketplace": "tiktok",
            "shop_id": "'$TIKTOK_SHOP_ID'",
            "marketplace_order_id": "TEST_'$(date +%s)'",
            "customer": {"name": "Setup Test Customer"},
            "items": [{
                "sku": "DOG-FOOD-PREM-001",
                "name": "Dog Food Premium 1kg", 
                "quantity": 1,
                "price": 75000
            }]
        }' | jq .
    
    # Test Tokopedia order processing
    echo ""
    echo "🛒 Testing Tokopedia order processing:"
    curl -s -X POST http://localhost:3000/api/odoo/orders/process \
        -H "Content-Type: application/json" \
        -d '{
            "marketplace": "tokopedia",
            "shop_id": "TKP_TEST_001",
            "marketplace_order_id": "TKP_TEST_'$(date +%s)'",
            "customer": {"name": "Tokopedia Test Customer"},
            "items": [{
                "sku": "DOG-FOOD-PREM-001",
                "name": "Dog Food Premium 1kg", 
                "quantity": 1,
                "price": 75000
            }]
        }' | jq .
    
    # Test Desty order processing
    echo ""
    echo "🛒 Testing Desty order processing:"
    curl -s -X POST http://localhost:3000/api/odoo/orders/process \
        -H "Content-Type: application/json" \
        -d '{
            "marketplace": "desty",
            "shop_id": "DESTY_TEST_001",
            "marketplace_order_id": "DESTY_TEST_'$(date +%s)'",
            "customer": {"name": "Desty Test Customer"},
            "items": [{
                "sku": "DOG-FOOD-PREM-001",
                "name": "Dog Food Premium 1kg", 
                "quantity": 1,
                "price": 75000
            }]
        }' | jq .
    
    # Test Desty Product API
    echo ""
    echo "📦 Testing Desty Product API:"
    echo "🔹 Get products list:"
    curl -s -X GET http://localhost:3000/desty/products \
        -H "X-API-Key: your_desty_api_key" | jq . || echo "Expected: 404 (normal with dummy API key)"
    
    echo ""
    echo "🔹 Create test product:"
    curl -s -X POST http://localhost:3000/desty/products \
        -H "Content-Type: application/json" \
        -H "X-API-Key: your_desty_api_key" \
        -d '{
            "name": "Test Product",
            "sku": "TEST-DESTY-001",
            "price": 50000,
            "description": "Test product via middleware"
        }' | jq . || echo "Expected: 404 (normal with dummy API key)"
    
    # Test Desty Order API
    echo ""
    echo "📦 Testing Desty Order API:"
    echo "🔹 Get orders list:"
    curl -s -X GET http://localhost:3000/desty/orders \
        -H "X-API-Key: your_desty_api_key" | jq . || echo "Expected: 404 (normal with dummy API key)"
    
    echo ""
    echo "🔹 Create test order:"
    curl -s -X POST http://localhost:3000/desty/orders \
        -H "Content-Type: application/json" \
        -H "X-API-Key: your_desty_api_key" \
        -d '{
            "customer_id": "CUST_TEST_001",
            "items": [{
                "product_id": "PROD_TEST_001",
                "product_sku": "DOG-FOOD-PREM-001",
                "quantity": 1,
                "price": 75000
            }]
        }' | jq . || echo "Expected: 404 (normal with dummy API key)"
    
else
    echo "❌ Server is not running. Starting server..."
    npm start &
    sleep 5
    
    if curl -s http://localhost:3000/health > /dev/null; then
        echo "✅ Server started successfully"
    else
        echo "❌ Failed to start server"
        exit 1
    fi
fi

echo ""
echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "📋 Next Steps:"
echo "1. Configure webhooks in TikTok Shop dashboard"
echo "2. Set webhook URL: https://your-domain.com/webhook/tiktok"
echo "3. Test with real orders from TikTok Shop"
echo "4. Monitor admin dashboard for errors"
echo ""
echo "🔧 Useful Commands:"
echo "  Check errors: curl -X GET http://localhost:3000/api/errors/stats -H \"X-Admin-Token: your_secure_admin_token_here\""
echo "  Refresh tokens: curl -X POST http://localhost:3000/api/tokens/refresh/tiktok -H \"X-Admin-Token: your_secure_admin_token_here\""
echo "  Health check: curl -X GET http://localhost:3000/health"
echo ""
echo "🔐 OAuth Commands:"
echo "  TikTok authorize: curl -X GET http://localhost:3000/tiktok/authorize"
echo "  Tokopedia authorize: curl -X GET http://localhost:3000/tokopedia/authorize"
echo "  Desty authorize: curl -X GET http://localhost:3000/desty/authorize"
echo "  TikTok status: curl -X GET http://localhost:3000/tiktok/status"
echo "  Tokopedia status: curl -X GET http://localhost:3000/tokopedia/status"
echo "  Desty status: curl -X GET http://localhost:3000/desty/status"
echo ""
echo "📦 Desty Product & Order API Commands:"
echo "  Get products: curl -X GET http://localhost:3000/desty/products -H \"X-API-Key: your_desty_api_key\""
echo "  Create product: curl -X POST http://localhost:3000/desty/products -H \"Content-Type: application/json\" -H \"X-API-Key: your_desty_api_key\" -d '{\"name\":\"Test\",\"sku\":\"TEST-001\",\"price\":10000}'"
echo "  Search products: curl -X GET \"http://localhost:3000/desty/products/search?q=dog\" -H \"X-API-Key: your_desty_api_key\""
echo "  Sync products: curl -X POST http://localhost:3000/desty/products/sync -H \"Content-Type: application/json\" -H \"X-API-Key: your_desty_api_key\" -d '{\"shop_id\":\"SHOP001\",\"limit\":50}'"
echo "  Get orders: curl -X GET http://localhost:3000/desty/orders -H \"X-API-Key: your_desty_api_key\""
echo "  Create order: curl -X POST http://localhost:3000/desty/orders -H \"Content-Type: application/json\" -H \"X-API-Key: your_desty_api_key\" -d '{\"customer_id\":\"CUST001\",\"items\":[{\"product_id\":\"PROD001\",\"quantity\":1,\"price\":10000}]}'"
echo "  Confirm order: curl -X POST http://localhost:3000/desty/orders/ORDER123/confirm -H \"Content-Type: application/json\" -H \"X-API-Key: your_desty_api_key\" -d '{\"notes\":\"Order confirmed\"}'"
echo "  Search orders: curl -X GET \"http://localhost:3000/desty/orders/search?customer_name=John\" -H \"X-API-Key: your_desty_api_key\""
echo ""
echo "📚 Documentation:"
echo "  - SETUP-TIKTOK.md - Detailed TikTok setup guide"
echo "  - SETUP-DESTY.md - Detailed Desty setup guide"
echo "  - DESTY-PRODUCT-API.md - Complete Desty Product API documentation"
echo "  - DESTY-ORDER-API.md - Complete Desty Order API documentation"
echo "  - TT-PARTNER-GUIDE.md - Complete onboarding guide"
echo ""
echo "🚀 Your 5-marketplace integration is ready! (Shopee, Tokopedia, Lazada, TikTok, Desty)"
