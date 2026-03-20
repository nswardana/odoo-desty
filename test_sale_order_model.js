#!/usr/bin/env node

// Test script untuk mengecek model 'sale.order' di Odoo
// Usage: node test_sale_order_model.js

require('dotenv').config();
const xmlrpc = require('xmlrpc');

// Odoo Configuration
const config = {
  url: process.env.ODOO_URL || 'http://localhost:8069',
  db: process.env.ODOO_DB || 'your_database_name',
  username: process.env.ODOO_USER || 'your_username',
  password: process.env.ODOO_PASSWORD || 'your_password'
};

console.log('🔍 Testing Odoo sale.order model...');
console.log('================================');
console.log(`📋 URL: ${config.url}`);
console.log(`📋 DB: ${config.db}`);
console.log(`📋 User: ${config.username}`);
console.log('');

// Create XML-RPC client
const client = xmlrpc.createClient(`${config.url}/xmlrpc/2/object`);

// Helper function to execute Odoo method
async function execute(model, method, params = []) {
  return new Promise((resolve, reject) => {
    client.methodCall('execute_kw', [
      config.db,
      1, // uid (will be authenticated)
      config.password,
      model,
      method,
      params
    ], (error, value) => {
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    });
  });
}

// Test functions
async function testModel() {
  try {
    // Test 1: Check if sale.order model exists
    console.log('🔍 Test 1: Check if sale.order model exists...');
    const modelExists = await execute('ir.model', 'search', [[['name', '=', 'sale.order']]]);
    console.log(`✅ Model exists: ${modelExists.length > 0 ? 'YES' : 'NO'}`);
    console.log('');

    // Test 2: Get all fields of sale.order
    console.log('🔍 Test 2: Get all fields of sale.order...');
    const allFields = await execute('sale.order', 'fields_get', []);
    const fieldNames = Object.keys(allFields);
    console.log(`✅ Total fields: ${fieldNames.length}`);
    console.log('📋 Field names:');
    fieldNames.slice(0, 20).forEach(field => {
      const fieldInfo = allFields[field];
      console.log(`  - ${field}: ${fieldInfo.type} (${fieldInfo.string || fieldInfo.help || 'No description'})`);
    });
    if (fieldNames.length > 20) {
      console.log(`  ... and ${fieldNames.length - 20} more fields`);
    }
    console.log('');

    // Test 3: Check specific fields
    console.log('🔍 Test 3: Check specific fields...');
    const specificFields = ['warehouse_id', 'platform_name', 'partner_id', 'state', 'order_line', 'storeName'];
    const fieldData = await execute('sale.order', 'fields_get', [specificFields]);
    
    specificFields.forEach(field => {
      if (fieldData[field]) {
        console.log(`✅ ${field}: ${fieldData[field].type} - ${fieldData[field].string}`);
      } else {
        console.log(`❌ ${field}: FIELD NOT FOUND`);
      }
    });
    console.log('');

    // Test 4: Get warehouse options
    console.log('🔍 Test 4: Get warehouse options...');
    try {
      const warehouses = await execute('stock.warehouse', 'search_read', [
        ['active', '=', true]
      ], ['id', 'name', 'code']);
      console.log(`✅ Found ${warehouses.length} warehouses:`);
      warehouses.forEach(wh => {
        console.log(`  - ID: ${wh.id}, Name: ${wh.name}, Code: ${wh.code || 'N/A'}`);
      });
    } catch (error) {
      console.log(`❌ Error getting warehouses: ${error.message}`);
    }
    console.log('');

    // Test 5: Get partner options
    console.log('🔍 Test 5: Get partner options...');
    try {
      const partners = await execute('res.partner', 'search_read', [
        ['is_company', '=', false],
        ['customer', '=', true]
      ], ['id', 'name', 'email'], {limit: 5});
      console.log(`✅ Found ${partners.length} customers (showing first 5):`);
      partners.forEach(partner => {
        console.log(`  - ID: ${partner.id}, Name: ${partner.name}, Email: ${partner.email || 'N/A'}`);
      });
    } catch (error) {
      console.log(`❌ Error getting partners: ${error.message}`);
    }
    console.log('');

    // Test 6: Try to create a test sale order
    console.log('🔍 Test 6: Try to create a test sale order...');
    try {
      const testOrderData = {
        partner_id: 1, // Assuming partner with ID 1 exists
        state: 'draft',
        note: 'Test order from Node.js script'
      };
      
      // Only include fields that exist
      const validOrderData = {};
      
      if (fieldData.partner_id) validOrderData.partner_id = testOrderData.partner_id;
      if (fieldData.state) validOrderData.state = testOrderData.state;
      if (fieldData.note) validOrderData.note = testOrderData.note;
      if (fieldData.warehouse_id) validOrderData.warehouse_id = 1;

      console.log('📋 Order data to create:', JSON.stringify(validOrderData, null, 2));
      
      const orderId = await execute('sale.order', 'create', [validOrderData]);
      console.log(`✅ Test order created: ID ${orderId}`);
      
      // Clean up - delete test order
      await execute('sale.order', 'unlink', [[orderId]]);
      console.log(`🗑️ Test order deleted: ID ${orderId}`);
      
    } catch (error) {
      console.log(`❌ Error creating test order: ${error.message}`);
      console.log('💡 This might be due to missing required fields or invalid data');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('');
    console.log('💡 Troubleshooting:');
    console.log('1. Check if Odoo is running at the specified URL');
    console.log('2. Verify database name, username, and password');
    console.log('3. Ensure user has permissions for sale.order model');
    console.log('4. Check if sale.order module is installed');
  }
}

// Run tests
testModel().then(() => {
  console.log('================================');
  console.log('✅ All tests completed!');
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
