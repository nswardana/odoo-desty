#!/bin/bash

#echo "🔐 Getting Desty Access Token..."

echo -e "\n\n📦 Testing Local Desty Order API..."
curl -X POST http://localhost:3000/desty/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzUxMiJ9.eyJtZXJjaGFudElkIjoyMDMyMDAyMDMzNTM0NDMxMjMzLCJ0ZW5hbnRJZCI6MTc1NDY1LCJleHAiOjE3NzYyMjMzOTcsImlhdCI6MTc3MzYzMTM5N30.ko_Cf49FC5urWMAehx4J6oqlrtRmC3G81DbzWscXx8CDx6qduL_oisdbJ6FqJQoQxnhefT_6XH14dDcqc_IZhg" \
  -d '{
  "platform": "shopee",
  "startDate": 1773594000000,
  "endDate": 1773642917870,
  "status": "Unpaid",
  "pageNumber": 1,
  "pageSize": 50
}'


