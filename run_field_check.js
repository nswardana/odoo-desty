#!/usr/bin/env node

// Quick field check for Odoo sale.order model
// Usage: node run_field_check.js

console.log('🔍 Quick Odoo Field Check');
console.log('========================');

// Check environment
const fs = require('fs');
if (!fs.existsSync('.env')) {
  console.log('❌ .env file not found!');
  console.log('');
  console.log('📝 Create .env file with:');
  console.log('ODOO_URL=http://localhost:8069');
  console.log('ODOO_DB=your_database_name');
  console.log('ODOO_USER=your_username');
  console.log('ODOO_PASSWORD=your_password');
  console.log('');
  console.log('Then run: node run_field_check.js');
  process.exit(1);
}

require('dotenv').config();

const config = {
  url: process.env.ODOO_URL || 'http://localhost:8069',
  db: process.env.ODOO_DB,
  user: process.env.ODOO_USER,
  password: process.env.ODOO_PASSWORD
};

if (!config.db || !config.user || !config.password) {
  console.log('❌ Missing configuration in .env file!');
  console.log('Please set ODOO_DB, ODOO_USER, and ODOO_PASSWORD');
  process.exit(1);
}

console.log(`📋 URL: ${config.url}`);
console.log(`📋 DB: ${config.db}`);
console.log(`📋 User: ${config.user}`);
console.log('');

// Install xmlrpc if needed
try {
  require('xmlrpc');
} catch (error) {
  console.log('📦 Installing xmlrpc package...');
  require('child_process').execSync('npm install xmlrpc', { stdio: 'inherit' });
  console.log('✅ xmlrpc installed');
  console.log('');
}

const xmlrpc = require('xmlrpc');

async function checkFields() {
  const client = xmlrpc.createClient(`${config.url}/xmlrpc/2/object`);
  
  try {
    console.log('🔍 Connecting to Odoo...');
    
    // Test connection and get fields
    const fields = await new Promise((resolve, reject) => {
      client.methodCall('execute_kw', [
        config.db,
        1,
        config.password,
        'sale.order',
        'fields_get',
        []
      ], (error, value) => {
        if (error) reject(error);
        else resolve(value);
      });
    });

    console.log('✅ Connected successfully!');
    console.log(`📊 Found ${Object.keys(fields).length} fields in sale.order`);
    console.log('');

    // Check important fields
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

    console.log('🔍 Critical Field Check:');
    console.log('========================');
    
    let allValid = true;
    criticalFields.forEach(fieldName => {
      if (fields[fieldName]) {
        const field = fields[fieldName];
        const required = field.required ? ' (REQUIRED)' : '';
        const readonly = field.readonly ? ' (READONLY)' : '';
        console.log(`✅ ${fieldName}: ${field.type}${required}${readonly}`);
        console.log(`   ${field.string || 'No description'}`);
      } else {
        console.log(`❌ ${fieldName}: NOT FOUND`);
        allValid = false;
      }
      console.log('');
    });

    if (allValid) {
      console.log('🎉 All critical fields are available!');
    } else {
      console.log('⚠️ Some fields are missing - check your code for invalid field names');
    }

    // Show sample valid fields
    console.log('');
    console.log('💡 Valid Alternative Fields:');
    console.log('=============================');
    const alternatives = {
      'platform_name': 'Use note field or create x_platform_name custom field',
      'storeName': 'Use note field or create x_store_name custom field',
      'buyerNotes': 'Use note field (already exists)'
    };
    
    Object.entries(alternatives).forEach(([invalid, suggestion]) => {
      if (!fields[invalid]) {
        console.log(`❌ ${invalid} → ${suggestion}`);
      }
    });

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.log('');
    console.log('💡 Troubleshooting:');
    console.log('1. Check if Odoo is running at:', config.url);
    console.log('2. Verify database name:', config.db);
    console.log('3. Check username and password');
    console.log('4. Ensure sale.order module is installed');
    console.log('5. Check network connectivity');
  }
}

checkFields();
