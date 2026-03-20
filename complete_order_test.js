#!/usr/bin/env node

// Complete order test with all required fields
// Usage: node complete_order_test.js

const https = require('https');

console.log('🔍 Complete Order Test');
console.log('=====================');

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

async function completeTest() {
  try {
    // Get user ID
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

    // Test different order field combinations
    const testCases = [
      {
        name: 'Minimal Order',
        fields: {
          partner_id: 1
        }
      },
      {
        name: 'Order with client_order_ref',
        fields: {
          partner_id: 1,
          client_order_ref: 'TEST_ORDER_123'
        }
      },
      {
        name: 'Order with note',
        fields: {
          partner_id: 1,
          note: 'Test order note'
        }
      },
      {
        name: 'Order with warehouse',
        fields: {
          partner_id: 1,
          warehouse_id: 1
        }
      },
      {
        name: 'Complete Order (Your Code)',
        fields: {
          partner_id: 1,
          client_order_ref: 'TEST_COMPLETE_456',
          note: 'Platform: shopee\nStore: Gowa Petstore',
          warehouse_id: 1
        }
      }
    ];

    for (const testCase of testCases) {
      console.log(`🔍 Testing: ${testCase.name}`);
      
      // Build XML struct
      let structContent = '';
      for (const [fieldName, fieldValue] of Object.entries(testCase.fields)) {
        const valueType = typeof fieldValue === 'string' ? 'string' : 'int';
        structContent += `<member><name>${fieldName}</name><value><${valueType}>${fieldValue}</${valueType}></value></member>`;
      }
      
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
      <value><struct>${structContent}</struct></value>
    </data></array></value></param>
  </params>
</methodCall>`;

      try {
        const response = await makeRequest(`${ODOO_URL}/xmlrpc/2/object`, orderXML);
        
        if (response.includes('<fault>')) {
          console.log(`❌ ${testCase.name}: FAILED`);
          
          // Extract error message
          const faultMatch = response.match(/<value><string>([^<]+)<\/string><\/value>/);
          if (faultMatch) {
            console.log(`   Error: ${faultMatch[1]}`);
          }
        } else {
          const orderIdMatch = response.match(/<value><int>(\d+)<\/int><\/value>/);
          if (orderIdMatch) {
            console.log(`✅ ${testCase.name}: SUCCESS (Order ID: ${orderIdMatch[1]})`);
            
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
        console.log(`❌ ${testCase.name}: CONNECTION ERROR`);
      }
      
      console.log('');
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('🎉 All tests completed!');
    console.log('');
    console.log('💡 Final Recommendations:');
    console.log('========================');
    console.log('✅ Based on test results, update your odooIntegrationService.js:');
    console.log('');
    console.log('const saleOrderValues = {');
    console.log('  partner_id: partner_id,');
    console.log('  client_order_ref: order_sn,  // ✅ This works!');
    console.log('  note: `Platform: ${platform_name}\\nStore: ${storeName}`,  // ✅ This works!');
    console.log('  warehouse_id: 1,  // ✅ This works!');
    console.log('  // Remove these invalid fields:');
    console.log('  // platform_name: platform_name,  // ❌ Invalid');
    console.log('  // storeName: storeName,  // ❌ Invalid');
    console.log('  // buyerNotes: buyerNotes,  // ❌ Invalid');
    console.log('};');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

completeTest();
