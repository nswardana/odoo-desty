#!/bin/bash

echo "🧪 RUN Desty to Odoo Integration"
echo "=================================="

# 🔹 Check jq
if ! command -v jq &> /dev/null
then
    echo "❌ jq is not installed. Install with:"
    echo "sudo apt install jq"
    exit 1
fi

# 🔹 Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo "📋 Using PORT: ${PORT:-3000}"
else
    echo "⚠️ .env file not found, using default port 3000"
    PORT=3000
fi

PORT=${PORT:-3000}

echo ""
echo "5️⃣ Processing completed orders to Odoo..."

response=$(curl -s -X POST "http://localhost:$PORT/desty/orders/process-to-odoo?status=Ready_To_Ship" \
  -H "Content-Type: application/json" \
  -d '{
    "processAll": true
  }')

# 🔹 Check kalau curl gagal
if [ -z "$response" ]; then
    echo "❌ No response from API (server mungkin belum jalan di port $PORT)"
    exit 1
fi

# 🔹 Extract summary values
total=$(echo "$response" | jq -r '.summary.total // 0')
success=$(echo "$response" | jq -r '.summary.successful // 0')
failed=$(echo "$response" | jq -r '.summary.failed // 0')

# 🔹 Print ke console
echo "Total   : $total"
echo "Success : $success"
echo "Failed  : $failed"

# 🔹 Save ke log file
echo "$(date '+%Y-%m-%d %H:%M:%S') - Total: $total | Success: $success | Failed: $failed" >> sync.log

echo ""
echo "✅ Test completed!"