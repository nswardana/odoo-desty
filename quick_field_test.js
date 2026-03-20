#!/usr/bin/env node

// Quick and simple field test
// Usage: node quick_field_test.js

const https = require('https');

console.log('🔍 Quick Odoo Field Test');
console.log('========================');

require('dotenv').config();

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_USERNAME;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;

function makeRequest(url, xmlData) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : require('http');
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(xmlData)
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

async function quickTest() {
  try {
    // Get user ID first
    const authXML = `<?xml version='1.0'?>
<methodCall>
  <methodName>login</methodName>
  <params>
    <param><value><string>${ODOO_DB}</string></value></param>
    <param><value><string>${ODOO_USER}</string></value></param>
    <param><value><string>${ODOO_PASSWORD}</string></value></param>
  </params>
</methodCall>`;

    const authResponse = await makeRequest(`${ODOO_URL}/xmlrpc/2/common`, authXML);
    const userIdMatch = authResponse.match(/<value><int>(\d+)<\/int><\/value>/);
    
    if (!userIdMatch) {
      console.log('❌ Authentication failed');
      return;
    }

    const userId = userIdMatch[1];
    console.log(`✅ Authenticated! User ID: ${userId}`);
    console.log('');

    // Test creating order with different fields
    console.log('🔍 Testing order creation with different fields...');
    
    const testFields = [
      { name: 'partner_id', value: 1, required: true },
      { name: 'state', value: 'draft', required: true },
      { name: 'client_order_ref', value: 'TEST_123', required: false },
      { name: 'note', value: 'Test note', required: false },
      { name: 'platform_name', value: 'test', required: false },
      { name: 'storeName', value: 'test', required: false },
      { name: 'warehouse_id', value: 1, required: false }
    ];

    for (const field of testFields) {
      console.log(`🔍 Testing field: ${field.name}`);
      
      const orderXML = `<?xml version='1.0'?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${ODOO_DB}</string></value></param>
    <param><value><int>${userId}</int></value></param>
    <param><value><string>${ODOO_PASSWORD}</string></value></param>
    <param><value><string>sale.order</string></value></param>
    <param><value><string>create</string></value></param>
    <param><value><array><data>
      <value><struct>
        <member><name>${field.name}</name><value><${typeof field.value === 'string' ? 'string' : 'int'}>${field.value}</${typeof field.value === 'string' ? 'string' : 'int'}></value></member>
      </struct></value>
    </data></array></value></param>
  </params>
</methodCall>`;

      try {
        const response = await makeRequest(`${ODOO_URL}/xmlrpc/2/object`, orderXML);
        
        if (response.includes('<fault>')) {
          if (response.includes('Unknown field')) {
            console.log(`❌ ${field.name}: UNKNOWN FIELD`);
          } else if (response.includes('required') && field.required) {
            console.log(`❌ ${field.name}: REQUIRED but missing other fields`);
          } else {
            console.log(`❌ ${field.name}: ERROR - ${response.substring(0, 100)}...`);
          }
        } else {
          const orderIdMatch = response.match(/<value><int>(\d+)<\/int><\/value>/);
          if (orderIdMatch) {
            console.log(`✅ ${field.name}: VALID (Order ID: ${orderIdMatch[1]})`);
            
            // Clean up
            const deleteXML = `<?xml version='1.0'?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${ODOO_DB}</string></value></param>
    <param><value><int>${userId}</int></value></param>
    <param><value><string>${ODOO_PASSWORD}</string></value></param>
    <param><value><string>sale.order</string></value></param>
    <param><value><string>unlink</string></value></param>
    <param><value><array><data><value><array><data><value><int>${orderIdMatch[1]}</int></value></data></array></value></data></array></value></param>
  </params>
</methodCall>`;
            
            await makeRequest(`${ODOO_URL}/xmlrpc/2/object`, deleteXML);
          }
        }
      } catch (error) {
        console.log(`❌ ${field.name}: CONNECTION ERROR`);
      }
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('');
    console.log('🎉 Test completed!');
    console.log('');
    console.log('💡 Summary:');
    console.log('==========');
    console.log('✅ Fields marked VALID can be used in your code');
    console.log('❌ Fields marked UNKNOWN do not exist in Odoo');
    console.log('');
    console.log('📝 Recommended Implementation:');
    console.log('============================');
    console.log('// Use these fields in odooIntegrationService.js:');
    console.log('const saleOrderValues = {');
    console.log('  partner_id: partner_id, // Required');
    console.log('  state: "draft", // Required');
    console.log('  client_order_ref: order_sn, // External reference');
    console.log('  note: `Platform: ${platform_name}`, // Platform info');
    console.log('  warehouse_id: 1 // Warehouse');
    console.log('};');
    console.log('');
    console.log('// AVOID these fields:');
    console.log('// platform_name - does not exist');
    console.log('// storeName - does not exist');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

quickTest();
