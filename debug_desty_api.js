#!/usr/bin/env node

// Debug Desty API connection issues
// Usage: node debug_desty_api.js

const https = require('https');
const { execSync } = require('child_process');

console.log('🔍 Desty API Debug Tool');
console.log('========================');

require('dotenv').config();

const DESTY_API_BASE_URL = process.env.DESTY_API_BASE_URL || 'https://api.desty.app';
const DESTY_TOKEN = process.env.DESTY_TOKEN;

console.log(`📋 API URL: ${DESTY_API_BASE_URL}`);
console.log(`📋 Token: ${DESTY_TOKEN ? '***' + DESTY_TOKEN.slice(-4) : 'NOT SET'}`);
console.log('');

async function testDestyAPI() {
  try {
    console.log('🔍 Step 1: Testing API connectivity...');
    
    // Test 1: Simple ping to API
    const testUrl = `${DESTY_API_BASE_URL}/api/health`;
    console.log(`📡 Testing: ${testUrl}`);
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Desty-Debug/1.0',
        'Authorization': `Bearer ${DESTY_TOKEN}`
      }
    });
    
    console.log(`📊 Status: ${response.status}`);
    console.log(`📊 Status Text: ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.text();
      console.log(`✅ API Response: ${data}`);
    } else {
      const errorData = await response.text();
      console.log(`❌ API Error: ${errorData}`);
    }
    
    console.log('');
    console.log('🔍 Step 2: Testing order endpoint...');
    
    // Test 2: Order endpoint
    const orderUrl = `${DESTY_API_BASE_URL}/api/order/page`;
    const orderPayload = {
      platform: 'shopee',
      startDate: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
      endDate: Math.floor(Date.now() / 1000),
      status: 'Ready_To_Ship',
      pageNumber: 1,
      pageSize: 1
    };
    
    console.log(`📡 Testing: ${orderUrl}`);
    console.log(`📋 Payload:`, JSON.stringify(orderPayload, null, 2));
    
    const orderResponse = await fetch(orderUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Desty-Debug/1.0',
        'Authorization': `Bearer ${DESTY_TOKEN}`
      },
      body: JSON.stringify(orderPayload)
    });
    
    console.log(`📊 Status: ${orderResponse.status}`);
    console.log(`📊 Status Text: ${orderResponse.statusText}`);
    
    if (orderResponse.ok) {
      const orderData = await orderResponse.text();
      console.log(`✅ Order Response: ${orderData}`);
    } else {
      const orderError = await orderResponse.text();
      console.log(`❌ Order Error: ${orderError}`);
      
      // Try to parse error details
      try {
        const errorJson = JSON.parse(orderError);
        console.log(`📋 Error Details:`, JSON.stringify(errorJson, null, 2));
      } catch (e) {
        console.log(`📋 Raw Error: ${orderError}`);
      }
    }
    
    console.log('');
    console.log('🔍 Step 3: Checking network connectivity...');
    
    // Test 3: Network connectivity
    const { execSync } = require('child_process');
    
    try {
      const pingResult = execSync('ping -c 3 api.desty.app', { encoding: 'utf8' });
      console.log(`📡 Ping Result: ${pingResult}`);
    } catch (pingError) {
      console.log(`❌ Ping failed: ${pingError.message}`);
    }
    
    console.log('');
    console.log('💡 Troubleshooting Tips:');
    console.log('=====================');
    console.log('1. Check if Desty API is down: https://status.desty.app');
    console.log('2. Verify token is valid and not expired');
    console.log('3. Check network connectivity and firewall');
    console.log('4. Try different endpoint or smaller payload');
    console.log('5. Check rate limits and API quotas');
    
  } catch (error) {
    console.error('❌ Debug script error:', error.message);
  }
}

// Polyfill fetch if not available
if (typeof fetch === 'undefined') {
  global.fetch = async (url, options) => {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : require('http');
      
      const req = client.request({
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            text: () => Promise.resolve(data)
          });
        });
      });
      
      req.on('error', reject);
      
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  };
}

testDestyAPI();
