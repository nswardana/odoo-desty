#!/usr/bin/env node

// Simple script to check sale.order fields in Odoo
// Usage: node check_odoo_fields.js

const { execSync } = require('child_process');

console.log('🔍 Checking Odoo sale.order model fields...');
console.log('================================');

// Check if .env exists and load it
const fs = require('fs');
if (!fs.existsSync('.env')) {
  console.log('❌ .env file not found!');
  console.log('');
  console.log('📝 .env file should contain:');
  console.log('ODOO_URL=https://rap.beepetmart.com');
  console.log('ODOO_DB=RAP');
  console.log('ODOO_USERNAME=bintangtimurjaya.cv@gmail.com');
  console.log('ODOO_PASSWORD=b33p3t103d');
  console.log('');
  console.log('Please create .env file with your Odoo credentials');
  process.exit(1);
}

require('dotenv').config();

// Use existing environment variables
const ODOO_URL = process.env.ODOO_URL || 'http://localhost:8069';
const ODOO_DB = process.env.ODOO_DB || 'your_database_name';
const ODOO_USER = process.env.ODOO_USERNAME || 'your_username';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || 'your_password';

console.log(`📋 URL: ${ODOO_URL}`);
console.log(`📋 DB: ${ODOO_DB}`);
console.log(`📋 User: ${ODOO_USER}`);
console.log('✅ Using configuration from .env');
console.log('');

// Install xmlrpc if needed
try {
  require('xmlrpc');
} catch (error) {
  console.log('📦 Installing xmlrpc package...');
  execSync('npm install xmlrpc', { stdio: 'inherit' });
  console.log('✅ xmlrpc installed');
  console.log('');
}

const xmlrpc = require('xmlrpc');

// Function to check fields
async function checkFields() {
  // Handle HTTPS URLs
  let clientUrl = ODOO_URL;
  if (ODOO_URL.startsWith('https://')) {
    // For HTTPS, we need to use https module and custom client
    console.log('🔧 Configuring HTTPS client...');
    const https = require('https');
    const clientOptions = {
      url: ODOO_URL,
      headers: {
        'User-Agent': 'Odoo-Field-Checker/1.0'
      }
    };
    
    // Create HTTPS client
    const client = xmlrpc.createClient({
      url: `${ODOO_URL}/xmlrpc/2/object`,
      headers: {
        'User-Agent': 'Odoo-Field-Checker/1.0'
      }
    });
    
    // Override the request method for HTTPS
    client._request = function(method, params, callback) {
      const xml = require('xmlrpc').serialize(method, params);
      const options = {
        hostname: new URL(ODOO_URL).hostname,
        port: new URL(ODOO_URL).port || 443,
        path: '/xmlrpc/2/object',
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          'Content-Length': Buffer.byteLength(xml),
          'User-Agent': 'Odoo-Field-Checker/1.0'
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = require('xmlrpc').deserialize(data);
            callback(null, result);
          } catch (e) {
            callback(e);
          }
        });
      });
      
      req.on('error', callback);
      req.write(xml);
      req.end();
    };
    
    return checkFieldsWithClient(client);
  } else {
    // HTTP - use standard client
    const client = xmlrpc.createClient(`${ODOO_URL}/xmlrpc/2/object`);
    return checkFieldsWithClient(client);
  }
}

async function checkFieldsWithClient(client) {
  
  try {
    console.log('🔍 Connecting to Odoo...');
    
    // Test connection and get fields
    const fields = await new Promise((resolve, reject) => {
      client.methodCall('execute_kw', [
        ODOO_DB,
        1,
        ODOO_PASSWORD,
        'sale.order',
        'fields_get',
        []
      ], (error, value) => {
        if (error) reject(error);
        else resolve(value);
      });
    });

    const fieldNames = Object.keys(fields);
    console.log('✅ Connected successfully!');
    console.log(`📊 Found ${fieldNames.length} fields in sale.order`);
    console.log('');

    // Check specific fields that we're using
    const criticalFields = [
      'partner_id',
      'state', 
      'warehouse_id',
      'order_line',
      'client_order_ref', 
      'note',
      'date_order',
      'company_id',
      'pricelist_id',
      'platform_name', 
      'storeName' 
    ];

    console.log('🔍 Critical Field Check:');
    console.log('========================');
    
    let allValid = true;
    criticalFields.forEach(fieldName => {
      if (fields[fieldName]) {
        const field = fields[fieldName];
        const required = field.required ? ' (REQUIRED)' : '';
        const readonly = field.readonly ? ' (READONLY)' : '';
        const custom = fieldName.includes('platform') || fieldName.includes('store') ? ' (CUSTOM)' : '';
        console.log(`✅ ${fieldName}: ${field.type}${required}${readonly}${custom}`);
        console.log(`   ${field.string || 'No description'}`);
      } else {
        console.log(`❌ ${fieldName}: NOT FOUND - This will cause errors!`);
        allValid = false;
      }
      console.log('');
    });

    if (allValid) {
      console.log('🎉 All critical fields are available!');
    } else {
      console.log('⚠️ Some fields are missing - check your code for invalid field names');
    }

    // Show sample valid fields for missing ones
    console.log('');
    console.log('💡 Recommendations for missing fields:');
    console.log('=====================================');
    
    if (!fields.platform_name) {
      console.log('❌ platform_name → Use note field or create x_platform_name custom field');
      console.log('   Example: saleOrderValues.note = `Platform: ${platform_name}`');
    }
    
    if (!fields.storeName) {
      console.log('❌ storeName → Use note field or create x_store_name custom field');
      console.log('   Example: saleOrderValues.note += `\\nStore: ${storeName}`');
    }

    if (fields.client_order_ref) {
      console.log('✅ client_order_ref → Perfect for external order references!');
      console.log('   Example: saleOrderValues.client_order_ref = order_sn');
    }

    // Show some useful alternative fields
    console.log('');
    console.log('🔍 Other useful fields:');
    console.log('======================');
    const usefulFields = ['origin', 'client_order_ref', 'note', 'x_studio_field'];
    usefulFields.forEach(fieldName => {
      if (fields[fieldName]) {
        const field = fields[fieldName];
        console.log(`✅ ${fieldName}: ${field.type} - ${field.string || 'No description'}`);
      }
    });

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.log('');
    console.log('💡 Troubleshooting:');
    console.log('1. Check if Odoo is running at:', ODOO_URL);
    console.log('2. Verify database name:', ODOO_DB);
    console.log('3. Check username and password');
    console.log('4. Ensure sale.order module is installed');
    console.log('5. Check network connectivity');
    console.log('6. Verify user has permissions for sale.order model');
    console.log('7. For HTTPS: Check if SSL certificate is valid');
  }
}

// Run the check
checkFields();
