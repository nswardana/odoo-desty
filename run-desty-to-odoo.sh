#!/bin/bash

echo "🧪 Testing Desty to Odoo Integration"
echo "=================================="

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "📋 Using PORT: $PORT"
else
    echo "⚠️ .env file not found, using default port 3000"
    PORT=3000
fi

#echo ""
#echo "2️⃣ Processing ALL unpaid orders to Odoo..."
#curl -X POST "http://localhost:$PORT/desty/orders/process-to-odoo" \
#  -H "Content-Type: application/json" \
#  -d '{
#    "processAll": true
#  }' | jq '.summary'

#echo ""
#echo "3️⃣ Processing specific orders to Odoo..."
#curl -X POST "http://localhost:$PORT/desty/orders/process-to-odoo" \
#  -H "Content-Type: application/json" \
#  -d '{
#    "orderIds": ["2033420707252584449", "2033396291273797633"]
#  }' | jq '.summary'

#echo ""
#echo "4️⃣ Getting completed orders..."
#curl -X GET "http://localhost:$PORT/desty/orders?status=Completed" | jq '.data.data.results | length' | xargs echo "Found completed orders:"

echo ""
echo "5️⃣ Processing completed orders to Odoo..."
curl -X POST "http://localhost:$PORT/desty/orders/process-to-odoo?status=Ready_To_Ship" \
  -H "Content-Type: application/json" \
  -d '{
    "processAll": true
  }' | jq '.summary'

#echo ""
#echo "✅ Test completed!"
