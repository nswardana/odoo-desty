#!/usr/bin/env node

// Simple HTTPS-compatible field check for Odoo
// Usage: node simple_field_check.js

const https = require('https');
const http = require('http');

console.log('🔍 Simple Odoo Field Check (HTTPS Compatible)');
console.log('==========================================');

// Load .env
require('dotenv').config();

const ODOO_URL = process.env.ODOO_URL || 'http://localhost:8069';
const ODOO_DB = process.env.ODOO_DB || 'your_database_name';
const ODOO_USER = process.env.ODOO_USERNAME || 'your_username';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || 'your_password';

console.log(`📋 URL: ${ODOO_URL}`);
console.log(`📋 DB: ${ODOO_DB}`);
console.log(`📋 User: ${ODOO_USER}`);
console.log('');

// Helper function to make HTTP/HTTPS request
function makeRequest(url, xmlData) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
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
      res.on('end', () => {
        try {
          resolve(data);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(xmlData);
    req.end();
  });
}

// Function to create XML-RPC request
function createXMLRPC(method, params) {
  return `<?xml version='1.0'?>
<methodCall>
  <methodName>${method}</methodName>
  <params>
    ${params.map(param => `<param><value>${param}</value></param>`).join('')}
  </params>
</methodCall>`;
}

// Function to parse XML-RPC response (simple)
function parseXMLResponse(xmlString) {
  // Simple XML parsing - look for value tags
  const valueMatch = xmlString.match(/<value><(?:struct|array)>.*?<\/(?:struct|array)><\/value>/s);
  if (valueMatch) {
    return valueMatch[0];
  }
  return xmlString;
}

// Main check function
async function checkFields() {
  try {
    console.log('🔍 Testing connection to Odoo...');
    
    // Test 1: Simple authentication test
    const authXML = createXMLRPC('execute_kw', [
      `<string>${ODOO_DB}</string>`,
      `<int>1</int>`,
      `<string>${ODOO_PASSWORD}</string>`,
      `<string>res.users</string>`,
      `<string>search</string>`,
      `<array><data></data></array>`
    ]);

    const authResponse = await makeRequest(`${ODOO_URL}/xmlrpc/2/common`, authXML);
    console.log('✅ Authentication successful!');
    console.log('');

    // Test 2: Get sale.order fields
    console.log('🔍 Getting sale.order fields...');
    
    const fieldsXML = createXMLRPC('execute_kw', [
      `<string>${ODOO_DB}</string>`,
      `<int>1</int>`,
      `<string>${ODOO_PASSWORD}</string>`,
      `<string>sale.order</string>`,
      `<string>fields_get</string>`,
      `<array><data></data></array>`
    ]);

    const fieldsResponse = await makeRequest(`${ODOO_URL}/xmlrpc/2/object`, fieldsXML);
    
    // Simple field detection
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

    console.log('🔍 Field Check Results:');
    console.log('======================');
    
    criticalFields.forEach(fieldName => {
      if (fieldsResponse.includes(`<member><name>${fieldName}</name>`)) {
        console.log(`✅ ${fieldName}: FOUND`);
      } else {
        console.log(`❌ ${fieldName}: NOT FOUND`);
      }
    });

    console.log('');
    console.log('🔍 Raw Response Preview:');
    console.log('========================');
    console.log(fieldsResponse.substring(0, 1000) + '...');
    console.log('');

    console.log('💡 Recommendations:');
    console.log('==================');
    console.log('✅ Use client_order_ref for external order references');
    console.log('✅ Use note field for platform/store information');
    console.log('❌ Avoid platform_name and storeName (custom fields)');
    console.log('');
    console.log('📝 Example code:');
    console.log('saleOrderValues.client_order_ref = order_sn;');
    console.log('saleOrderValues.note = `Platform: ${platform_name}\\nStore: ${storeName}`;');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('💡 Troubleshooting:');
    console.log('1. Check if Odoo URL is correct:', ODOO_URL);
    console.log('2. Verify database name:', ODOO_DB);
    console.log('3. Check username and password');
    console.log('4. Ensure sale.order module is installed');
    console.log('5. Check network connectivity and firewall');
    console.log('6. Verify SSL certificate for HTTPS');
  }
}

// Run the check
checkFields();
