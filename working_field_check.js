#!/usr/bin/env node

// Working field check with proper Odoo XML-RPC calls
// Usage: node working_field_check.js

const https = require('https');

console.log('🔍 Working Odoo Field Check');
console.log('==========================');

require('dotenv').config();

const ODOO_URL = process.env.ODOO_URL || 'http://localhost:8069';
const ODOO_DB = process.env.ODOO_DB || 'your_database_name';
const ODOO_USER = process.env.ODOO_USERNAME || 'your_username';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || 'your_password';

console.log(`📋 URL: ${ODOO_URL}`);
console.log(`📋 DB: ${ODOO_DB}`);
console.log(`📋 User: ${ODOO_USER}`);
console.log('');

function makeRequest(url, xmlData) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : require('http');
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(xmlData),
        'User-Agent': 'Odoo-Field-Checker/1.0'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.write(xmlData);
    req.end();
  });
}

function createXMLRPC(method, params) {
  return `<?xml version='1.0'?>
<methodCall>
  <methodName>${method}</methodName>
  <params>
    ${params.map(param => `<param><value>${param}</value></param>`).join('')}
  </params>
</methodCall>`;
}

async function checkFields() {
  try {
    console.log('🔍 Step 1: Authenticate...');
    
    // Get user ID
    const authXML = createXMLRPC('login', [
      `<string>${ODOO_DB}</string>`,
      `<string>${ODOO_USER}</string>`,
      `<string>${ODOO_PASSWORD}</string>`
    ]);

    const authResponse = await makeRequest(`${ODOO_URL}/xmlrpc/2/common`, authXML);
    
    if (authResponse.includes('<fault>')) {
      console.log('❌ Authentication failed');
      console.log(authResponse);
      return;
    }

    const userIdMatch = authResponse.match(/<value><int>(\d+)<\/int><\/value>/);
    if (!userIdMatch) {
      console.log('❌ Could not extract user ID');
      return;
    }

    const userId = userIdMatch[1];
    console.log(`✅ Authenticated! User ID: ${userId}`);
    console.log('');

    console.log('🔍 Step 2: Get sale.order fields...');
    
    // Get fields with proper syntax
    const fieldsXML = createXMLRPC('execute_kw', [
      `<string>${ODOO_DB}</string>`,
      `<int>${userId}</int>`,
      `<string>${ODOO_PASSWORD}</string>`,
      `<string>sale.order</string>`,
      `<string>fields_get</string>`,
      `<array><data></data></array>`
    ]);

    const fieldsResponse = await makeRequest(`${ODOO_URL}/xmlrpc/2/object`, fieldsXML);
    
    console.log('📊 Fields Response Status:', fieldsResponse.includes('<fault>') ? 'ERROR' : 'SUCCESS');
    
    if (fieldsResponse.includes('<fault>')) {
      console.log('❌ Error getting fields:');
      console.log(fieldsResponse);
      return;
    }

    console.log('✅ Fields retrieved successfully!');
    console.log('');

    // Check for specific fields
    const criticalFields = [
      'partner_id',
      'state',
      'warehouse_id',
      'order_line',
      'client_order_ref',
      'note',
      'platform_name',
      'storeName'
    ];

    console.log('🔍 Field Analysis:');
    console.log('==================');
    
    criticalFields.forEach(fieldName => {
      if (fieldsResponse.includes(`<member><name>${fieldName}</name>`)) {
        console.log(`✅ ${fieldName}: FOUND`);
        
        // Extract field type if possible
        const typeMatch = fieldsResponse.match(new RegExp(`<member><name>${fieldName}</name>.*?<value><string>([^<]+)</string>`));
        if (typeMatch) {
          console.log(`   Type: ${typeMatch[1]}`);
        }
      } else {
        console.log(`❌ ${fieldName}: NOT FOUND`);
      }
    });

    console.log('');
    console.log('🔍 Step 3: Test creating a simple order...');
    
    // Test create with valid fields only
    const createXML = createXMLRPC('execute_kw', [
      `<string>${ODOO_DB}</string>`,
      `<int>${userId}</int>`,
      `<string>${ODOO_PASSWORD}</string>`,
      `<string>sale.order</string>`,
      `<string>create</string>`,
      `<array><data>
        <value><struct>
          <member><name>partner_id</name><value><int>1</int></value></member>
          <member><name>state</name><value><string>draft</string></value></member>
          <member><name>client_order_ref</name><value><string>TEST_ORDER_${Date.now()}</string></value></member>
        </struct></value>
      </data></array>`
    ]);

    const createResponse = await makeRequest(`${ODOO_URL}/xmlrpc/2/object`, createXML);
    
    if (createResponse.includes('<fault>')) {
      console.log('❌ Error creating test order:');
      console.log(createResponse);
    } else {
      const orderIdMatch = createResponse.match(/<value><int>(\d+)<\/int><\/value>/);
      if (orderIdMatch) {
        console.log(`✅ Test order created: ID ${orderIdMatch[1]}`);
        
        // Clean up - delete test order
        const deleteXML = createXMLRPC('execute_kw', [
          `<string>${ODOO_DB}</string>`,
          `<int>${userId}</int>`,
          `<string>${ODOO_PASSWORD}</string>`,
          `<string>sale.order</string>`,
          `<string>unlink</string>`,
          `<array><data><value><array><data><value><int>${orderIdMatch[1]}</int></value></data></array></value></data></array>`
        ]);

        await makeRequest(`${ODOO_URL}/xmlrpc/2/object`, deleteXML);
        console.log('🗑️ Test order deleted');
      }
    }

    console.log('');
    console.log('💡 Summary:');
    console.log('==========');
    console.log('✅ Authentication: Working');
    console.log('✅ Connection: Working');
    console.log('✅ Field Access: Working');
    console.log('');
    console.log('📝 Recommended code:');
    console.log('===================');
    console.log('// Valid fields for sale.order:');
    console.log('partner_id (required)');
    console.log('state (required)');
    console.log('warehouse_id');
    console.log('client_order_ref ← Use this for external references!');
    console.log('note ← Use this for platform/store info');
    console.log('');
    console.log('// Example:');
    console.log('const orderData = {');
    console.log('  partner_id: customerId,');
    console.log('  state: "draft",');
    console.log('  client_order_ref: orderSn,');
    console.log('  note: `Platform: ${platformName}\\nStore: ${storeName}`');
    console.log('};');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkFields();
