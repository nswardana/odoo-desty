// scripts/initMappingEngine.js
// Initialize Mapping Engine database tables

require('dotenv').config();
const Shop = require('../models/Shop');

async function initialize() {
  try {
    console.log('🚀 Initializing Mapping Engine database...');
    
    // Test database connection
    await Shop.initializeTable();
    
    console.log('✅ Mapping Engine initialization completed successfully!');
    console.log('');
    console.log('📊 Available tables:');
    console.log('  - marketplace_shops');
    console.log('');
    console.log('🔧 Environment variables used:');
    console.log(`  PG_HOST: ${process.env.PG_HOST}`);
    console.log(`  PG_DB: ${process.env.PG_DB}`);
    console.log(`  PG_USER: ${process.env.PG_USER}`);
    console.log('');
    console.log('📋 Table structure:');
    console.log('  - id: Primary key');
    console.log('  - marketplace: shopee/tokopedia/lazada/tiktok');
    console.log('  - shop_id: Marketplace shop identifier');
    console.log('  - shop_name: Shop display name');
    console.log('  - company_id: Odoo company ID');
    console.log('  - warehouse_id: Odoo warehouse ID');
    console.log('  - pricelist_id: Odoo pricelist ID (optional)');
    console.log('  - journal_id: Odoo journal ID (optional)');
    console.log('  - active: Shop mapping status');
    console.log('  - sync_settings: JSON configuration');
    console.log('  - webhook_url: Webhook endpoint URL');
    console.log('  - webhook_secret: Webhook secret key');
    
  } catch (error) {
    console.error('❌ Initialization failed:', error.message);
    process.exit(1);
  }
}

// Run initialization
initialize();
