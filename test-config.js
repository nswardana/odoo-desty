#!/usr/bin/env node

// Test script to verify config.js is working
const { STORE_BRANCH_MAPPING, DEFAULT_BRANCH, DESTY_CONFIG } = require('./config');

console.log('🧪 Testing Configuration');
console.log('=======================');

console.log('\n📋 Store Branch Mapping:');
Object.entries(STORE_BRANCH_MAPPING).forEach(([store, branch]) => {
  console.log(`   ${store} → ${branch}`);
});

console.log(`\n🏢 Default Branch: ${DEFAULT_BRANCH}`);

console.log('\n⚙️ Desty Configuration:');
console.log(`   Base URL: ${DESTY_CONFIG.BASE_URL}`);
console.log(`   Order Endpoint: ${DESTY_CONFIG.ORDER_ENDPOINT}`);
console.log(`   Detail Endpoint: ${DESTY_CONFIG.ORDER_DETAIL_ENDPOINT}`);
console.log(`   Default Platform: ${DESTY_CONFIG.DEFAULT_PLATFORM}`);
console.log(`   Default Status: ${DESTY_CONFIG.DEFAULT_STATUS}`);
console.log(`   Default Page Size: ${DESTY_CONFIG.DEFAULT_PAGE_SIZE}`);

// Test branch mapping
const destyOrderController = require('./controllers/destyOrderController');

console.log('\n🧪 Testing Branch Mapping with Controller:');
const testStores = [
  'Pet Care Petshop Makassar',
  'BTPet Shop Makassar', 
  'Gowa Petstore',
  'Unknown Store'
];

testStores.forEach(store => {
  const branch = destyOrderController.getDefaultBranch(store);
  console.log(`   ${store} → ${branch}`);
});

console.log('\n✅ Configuration test completed successfully!');
