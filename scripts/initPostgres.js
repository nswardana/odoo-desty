// scripts/initPostgres.js
// Initialize PostgreSQL tables for marketplace middleware

require('dotenv').config();
const Account = require('../models/Account');

async function initialize() {
  try {
    console.log('🚀 Initializing PostgreSQL database...');
    
    // Test database connection
    await Account.initializeTable();
    
    console.log('✅ PostgreSQL initialization completed successfully!');
    console.log('');
    console.log('📊 Available tables:');
    console.log('  - marketplace_accounts');
    console.log('');
    console.log('🔧 Environment variables used:');
    console.log(`  PG_HOST: ${process.env.PG_HOST}`);
    console.log(`  PG_DB: ${process.env.PG_DB}`);
    console.log(`  PG_USER: ${process.env.PG_USER}`);
    
  } catch (error) {
    console.error('❌ Initialization failed:', error.message);
    process.exit(1);
  }
}

// Run initialization
initialize();
