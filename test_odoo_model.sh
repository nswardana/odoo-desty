#!/bin/bash

# Test script untuk mengecek model 'sale.order' di Odoo
# Usage: ./test_odoo_model.sh

echo "🔍 Testing Odoo 'sale.order' model..."
echo "================================"

# Load environment variables from .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo "✅ Loaded environment from .env"
else
    echo "⚠️ .env file not found, using defaults"
fi

# Odoo Configuration from environment
ODOO_URL=${ODOO_URL:-"http://localhost:8069"}
ODOO_DB=${ODOO_DB:-"your_database_name"}
ODOO_USER=${ODOO_USERNAME:-"your_username"}
ODOO_PASSWORD=${ODOO_PASSWORD:-"your_password"}

echo "📋 Configuration:"
echo "URL: $ODOO_URL"
echo "DB: $ODOO_DB"
echo "User: $ODOO_USER"
echo ""

# Test 1: Check if sale.order model exists
echo "🔍 Test 1: Check if 'sale.order' model exists..."
curl -X POST "$ODOO_URL/xmlrpc/2/object" \
  -H "Content-Type: text/xml" \
  -d "<?xml version='1.0'?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>$ODOO_DB</string></value></param>
    <param><value><int>1</int></value></param>
    <param><value><string>$ODOO_PASSWORD</string></value></param>
    <param><value><string>ir.model</string></value></param>
    <param><value><string>search</string></value></param>
    <param><value><array><data>
      <value><struct>
        <member><name>name</name><value><string>sale.order</string></value></member>
      </struct></value>
    </data></array></value></param>
  </params>
</methodCall>" \
  --silent --show-error

echo ""
echo ""

# Test 2: Get fields of sale.order model
echo "🔍 Test 2: Get fields of 'sale.order' model..."
curl -X POST "$ODOO_URL/xmlrpc/2/object" \
  -H "Content-Type: text/xml" \
  -d "<?xml version='1.0'?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>$ODOO_DB</string></value></param>
    <param><value><int>1</int></value></param>
    <param><value><string>$ODOO_PASSWORD</string></value></param>
    <param><value><string>sale.order</string></value></param>
    <param><value><string>fields_get</string></value></param>
    <param><value><array></array></value></param>
    <param><value><array><data>
      <value><string>name</string></value>
      <value><string>help</string></value>
      <value><string>type</string></value>
      <value><string>required</string></value>
    </data></array></value></param>
  </params>
</methodCall>" \
  --silent --show-error | xmllint --format -

echo ""
echo ""

# Test 3: Check if warehouse_id field exists
echo "🔍 Test 3: Check specific fields (warehouse_id, platform_name, etc)..."
curl -X POST "$ODOO_URL/xmlrpc/2/object" \
  -H "Content-Type: text/xml" \
  -d "<?xml version='1.0'?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>$ODOO_DB</string></value></param>
    <param><value><int>1</int></value></param>
    <param><value><string>$ODOO_PASSWORD</string></value></param>
    <param><value><string>sale.order</string></value></param>
    <param><value><string>fields_get</string></value></param>
    <param><value><array><data>
      <value><string>warehouse_id</string></value>
      <value><string>platform_name</string></value>
      <value><string>partner_id</string></value>
      <value><string>state</string></value>
      <value><string>order_line</string></value>
      <value><string>client_order_ref</string></value>
      <value><string>note</string></value>
    </data></array></value></param>
    <param><value><array><data>
      <value><string>name</string></value>
      <value><string>type</string></value>
      <value><string>required</string></value>
      <value><string>help</string></value>
    </data></array></value></param>
  </params>
</methodCall>" \
  --silent --show-error | xmllint --format -

echo ""
echo ""

# Test 4: Try to create a simple sale order
echo "🔍 Test 4: Try to create a simple sale order..."
curl -X POST "$ODOO_URL/xmlrpc/2/object" \
  -H "Content-Type: text/xml" \
  -d "<?xml version='1.0'?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>$ODOO_DB</string></value></param>
    <param><value><int>1</int></value></param>
    <param><value><string>$ODOO_PASSWORD</string></value></param>
    <param><value><string>sale.order</string></value></param>
    <param><value><string>create</string></value></param>
    <param><value><array><data>
      <value><struct>
        <member><name>partner_id</name><value><int>1</int></value></member>
        <member><name>state</name><value><string>draft</string></value></member>
        <member><name>client_order_ref</name><value><string>TEST_ORDER_123</string></value></member>
      </struct></value>
    </data></array></value></param>
  </params>
</methodCall>" \
  --silent --show-error

echo ""
echo "================================"
echo "✅ Test completed!"
echo ""
echo "💡 Results:"
echo "✅ If you see field definitions above → sale.order model is accessible"
echo "❌ If you see errors → Check Odoo connection and credentials"
echo ""
echo "📋 Expected valid fields:"
echo "  - partner_id (many2one, REQUIRED)"
echo "  - state (selection, REQUIRED)" 
echo "  - warehouse_id (many2one)"
echo "  - client_order_ref (char) ← Your new field!"
echo "  - note (text)"
echo "  - order_line (one2many, REQUIRED)"
echo ""
echo "❌ Expected invalid fields:"
echo "  - platform_name (custom field - NOT FOUND)"
echo "  - storeName (custom field - NOT FOUND)"
