#!/usr/bin/env node

// Test script to verify order data extraction
const destyOrderController = require('./controllers/destyOrderController');

console.log('🧪 Testing Order Data Extraction');
console.log('===============================');

// Mock complete order data from Desty API (based on the worker output)
const mockCompleteOrder = {
  orderId: '2033420833333362690',
  orderSn: '2603168UP3XCGU',
  storeId: '995802019',
  storeName: 'Pet Care Petshop Makassar',
  platformName: 'shopee',
  orderCreateTime: 1773605411000,
  hasPaid: true,
  totalPrice: 576405,
  paymentMethod: 'SPayLater',
  buyerNotes: '',
  trackingNumberList: [],
  customerInfo: {
    name: 'Test Customer',
    phone: '08123456789',
    email: 'test@example.com',
    receiverAddress: {
      fullAddress: 'Jl. Test Address No. 123',
      city: 'Makassar',
      province: 'Sulawesi Selatan',
      postalCode: '90123',
      country: 'Indonesia'
    }
  },
  itemList: [
    {
      itemName: 'Test Product 1',
      itemSku: 'TEST001',
      itemQuantity: 2,
      itemPrice: 250000,
      weight: 1000
    },
    {
      itemName: 'Test Product 2', 
      itemSku: 'TEST002',
      itemQuantity: 1,
      itemPrice: 76405,
      weight: 500
    }
  ]
};

try {
  const standardized = destyOrderController.standardizeOrder(mockCompleteOrder);
  
  console.log('📋 Standardized Order:');
  console.log(`   Order SN: ${standardized.order_sn}`);
  console.log(`   Customer: ${standardized.buyer_username}`);
  console.log(`   Phone: ${standardized.buyer_phone}`);
  console.log(`   Email: ${standardized.buyer_email}`);
  console.log(`   Branch: ${standardized.branch}`);
  console.log(`   Store: ${standardized.store_name}`);
  console.log(`   Payment Status: ${standardized.payment_status}`);
  console.log(`   Total Amount: ${standardized.total_amount}`);
  console.log(`   Items Count: ${standardized.items.length}`);
  
  console.log('\n📦 Items:');
  standardized.items.forEach((item, index) => {
    console.log(`   ${index + 1}. ${item.name} (${item.sku}) - Qty: ${item.qty} - Price: ${item.price}`);
  });
  
  console.log('\n🏠 Shipping Address:');
  if (standardized.shipping_address) {
    console.log(`   Name: ${standardized.shipping_address.name}`);
    console.log(`   Phone: ${standardized.shipping_address.phone}`);
    console.log(`   Address: ${standardized.shipping_address.address}`);
    console.log(`   City: ${standardized.shipping_address.city}`);
    console.log(`   Province: ${standardized.shipping_address.province}`);
    console.log(`   Postal Code: ${standardized.shipping_address.postal_code}`);
  } else {
    console.log('   ❌ No shipping address found');
  }
  
  console.log('\n✅ Order extraction test completed successfully!');
  
} catch (error) {
  console.error('❌ Error during order extraction:', error.message);
}
