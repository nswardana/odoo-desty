#!/usr/bin/env node

// Debug Odoo connection and authentication
// Usage: node debug_odoo_connection.js

const https = require('https');

console.log('🔍 Odoo Connection Debug Tool');
console.log('============================');

require('dotenv').config();

const ODOO_URL = process.env.ODOO_URL || 'http://localhost:8069';
const ODOO_DB = process.env.ODOO_DB || 'your_database_name';
const ODOO_USER = process.env.ODOO_USERNAME || 'your_username';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || 'your_password';

console.log(`📋 URL: ${ODOO_URL}`);
console.log(`📋 DB: ${ODOO_DB}`);
console.log(`📋 User: ${ODOO_USER}`);
console.log(`📋 Password: ${ODOO_PASSWORD ? '***' : 'NOT SET'}`);
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
        'User-Agent': 'Odoo-Debug/1.0'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });

    req.on('error', reject);
    req.write(xmlData);
    req.end();
  });
}

function createAuthXML(db, login, password) {
  return `<?xml version='1.0'?>
<methodCall>
  <methodName>login</methodName>
  <params>
    <param><value><string>${db}</string></value></param>
    <param><value><string>${login}</string></value></param>
    <param><value><string>${password}</string></value></param>
  </params>
</methodCall>`;
}

async function debugConnection() {
  try {
    console.log('🔍 Step 1: Testing basic connectivity...');
    
    // Test 1: Basic connectivity
    const testUrl = `${ODOO_URL}/xmlrpc/2/common`;
    console.log(`📡 Connecting to: ${testUrl}`);
    
    const testXML = createAuthXML(ODOO_DB, ODOO_USER, ODOO_PASSWORD);
    const authResponse = await makeRequest(testUrl, testXML);
    
    console.log(`📊 Status Code: ${authResponse.status}`);
    console.log(`📊 Response Length: ${authResponse.data.length} chars`);
    console.log('');
    
    console.log('🔍 Step 2: Analyzing response...');
    console.log('Raw Response:');
    console.log('=============');
    console.log(authResponse.data);
    console.log('');
    
    // Parse response
    if (authResponse.data.includes('<fault>')) {
      console.log('❌ Authentication FAILED!');
      console.log('');
      console.log('🔍 Fault Analysis:');
      
      if (authResponse.data.includes('Access Denied')) {
        console.log('❌ Error: Access Denied');
        console.log('');
        console.log('💡 Possible Causes:');
        console.log('1. Wrong database name');
        console.log('2. Wrong username or password');
        console.log('3. User does not exist in database');
        console.log('4. User account is inactive');
        console.log('5. Insufficient permissions');
        console.log('');
        console.log('🔧 Solutions:');
        console.log('1. Verify database name in Odoo');
        console.log('2. Check user credentials in Odoo');
        console.log('3. Ensure user is active and has permissions');
        console.log('4. Try with admin user to test');
      } else if (authResponse.data.includes('Database not found')) {
        console.log('❌ Error: Database not found');
        console.log(`💡 Database "${ODOO_DB}" does not exist`);
      } else if (authResponse.data.includes('wrong login or password')) {
        console.log('❌ Error: Wrong login or password');
        console.log('💡 Username or password is incorrect');
      } else {
        console.log('❌ Unknown error in response');
      }
    } else if (authResponse.data.includes('<params>')) {
      console.log('✅ Authentication SUCCESSFUL!');
      
      // Extract user ID
      const userIdMatch = authResponse.data.match(/<value><int>(\d+)<\/int><\/value>/);
      if (userIdMatch) {
        console.log(`👤 User ID: ${userIdMatch[1]}`);
        console.log('');
        console.log('✅ Connection is working!');
        console.log('');
        console.log('🔍 Step 3: Testing sale.order access...');
        
        // Test sale.order access
        const testAccessXML = `<?xml version='1.0'?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${ODOO_DB}</string></value></param>
    <param><value><int>${userIdMatch[1]}</int></value></param>
    <param><value><string>${ODOO_PASSWORD}</string></value></param>
    <param><value><string>sale.order</string></value></param>
    <param><value><string>search</string></value></param>
    <param><value><array><data></data></array></value></param>
  </params>
</methodCall>`;
        
        const accessResponse = await makeRequest(`${ODOO_URL}/xmlrpc/2/object`, testAccessXML);
        console.log(`📊 Access Status: ${accessResponse.status}`);
        console.log('Access Response:');
        console.log('================');
        console.log(accessResponse.data);
        
        if (accessResponse.data.includes('<fault>')) {
          console.log('❌ User does not have access to sale.order model');
          console.log('💡 User needs permissions for Sales module');
        } else {
          console.log('✅ User has access to sale.order model');
        }
      }
    } else {
      console.log('❓ Unexpected response format');
    }
    
  } catch (error) {
    console.error('❌ Connection Error:', error.message);
    console.log('');
    console.log('💡 Network Issues:');
    console.log('1. Check if URL is correct:', ODOO_URL);
    console.log('2. Check network connectivity');
    console.log('3. Check firewall settings');
    console.log('4. Verify SSL certificate for HTTPS');
  }
}

debugConnection();
