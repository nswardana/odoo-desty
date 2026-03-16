#!/usr/bin/env node

// Test script to verify branch mapping
const destyOrderController = require('./controllers/destyOrderController');

console.log('🧪 Testing Branch Mapping');
console.log('==========================');

// Test cases
const testOrders = [
  {
    orderSn: 'TEST001',
    storeName: 'Pet Care Petshop Makassar',
    storeId: '995802019',
    orderCreateTime: Date.now()
  },
  {
    orderSn: 'TEST002', 
    storeName: 'BTPet Shop Makassar',
    storeId: '995199616',
    orderCreateTime: Date.now()
  },
  {
    orderSn: 'TEST003',
    storeName: 'Gowa Petstore',
    storeId: '1139494264',
    orderCreateTime: Date.now()
  },
  {
    orderSn: 'TEST004',
    storeName: 'Unknown Store',
    storeId: '999999999',
    orderCreateTime: Date.now()
  }
];

testOrders.forEach(order => {
  const standardized = destyOrderController.standardizeOrder(order);
  console.log(`📋 Order: ${order.orderSn}`);
  console.log(`   Store: ${order.storeName}`);
  console.log(`   Branch: ${standardized.branch}`);
  console.log('');
});

console.log('✅ Branch mapping test completed!');
