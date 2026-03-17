// Configuration file for Desty-Odoo integration

// Store to Branch Mapping Configuration
const STORE_BRANCH_MAPPING = {
  'Gowa Petstore': 'GOWA'
};

// Default branch if store not found
const DEFAULT_BRANCH = 'KEDURUS';

// Desty API Configuration
const DESTY_CONFIG = {
  BASE_URL: process.env.DESTY_API_BASE_URL || 'https://api.desty.app',
  ORDER_ENDPOINT: '/api/order/page',
  ORDER_DETAIL_ENDPOINT: '/api/order/detail',
  DEFAULT_PLATFORM: 'shopee',
  DEFAULT_STATUS: 'Ready_To_Ship',
  DEFAULT_PAGE_SIZE: 2
};

// Order Processing Configuration
const ORDER_CONFIG = {
  DEFAULT_PRIORITY: 5,
  PAID_ORDER_PRIORITY: 1,
  PENDING_ORDER_PRIORITY: 3,
  HIGH_VALUE_THRESHOLD: 1000000, // 1 million in local currency
  HIGH_VALUE_PRIORITY: 1
};

// Validation Configuration
const VALIDATION_CONFIG = {
  MIN_ADDRESS_LENGTH: 5,
  REQUIRED_ORDER_FIELDS: ['order_sn', 'buyer_username', 'branch', 'items'],
  REQUIRED_ITEM_FIELDS: ['name', 'sku', 'qty', 'price']
};

module.exports = {
  STORE_BRANCH_MAPPING,
  DEFAULT_BRANCH,
  DESTY_CONFIG,
  ORDER_CONFIG,
  VALIDATION_CONFIG
};
