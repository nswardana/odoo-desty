// Configuration file for Desty-Odoo integration

// Store to Branch Mapping Configuration
const STORE_BRANCH_MAPPING = {
  'Gowa Petstore': 'GOWA'
};

// Default branch if store not found
const DEFAULT_BRANCH = 'KEDURUS';

// Branch to Warehouse Mapping Configuration
const BRANCH_WAREHOUSE_MAPPING = {
  'GOWA': 1, // Gowa Petstore -> Main Warehouse (ID: 1)
  'MAKASSAR': 2, // Makassar Branch -> Warehouse 2
  'JAKARTA': 3, // Jakarta Branch -> Warehouse 3
  'SURABAYA': 4, // Surabaya Branch -> Warehouse 4
  'BANDUNG': 5 // Bandung Branch -> Warehouse 5
};

// Branch to Stock Location Mapping Configuration
const BRANCH_STOCK_LOCATION_MAPPING = {
  'GOWA': 8, // Gowa Petstore -> Stock Location 8
  'MAKASSAR': 9, // Makassar Branch -> Stock Location 9
  'JAKARTA': 10, // Jakarta Branch -> Stock Location 10
  'SURABAYA': 11, // Surabaya Branch -> Stock Location 11
  'BANDUNG': 12 // Bandung Branch -> Stock Location 12
};

// Order State Configuration
const ORDER_STATE_CONFIG = {
  DEFAULT_ORDER_STATE: 'draft',
  CONFIRMED_ORDER_STATE: 'sale',
  CANCELLED_ORDER_STATE: 'cancel',
  DONE_ORDER_STATE: 'done'
};

// Order Processing Configuration
const ORDER_PROCESSING_CONFIG = {
  AUTO_CONFIRM_PAID_ORDERS: true,
  AUTO_CREATE_SHIPMENT: true,
  VALIDATE_STOCK: true,
  ALLOW_NEGATIVE_STOCK: false
};

// Payment Method Mapping Configuration
const PAYMENT_METHOD_MAPPING = {
  // E-wallet methods
  'ShopeePay Balance': 'e_wallet',
  'ShopeePay': 'e_wallet',
  'GoPay': 'e_wallet',
  'OVO': 'e_wallet',
  'DANA': 'e_wallet',
  'LinkAja': 'e_wallet',
  'Online Payment': 'e_wallet',
  
  // Cash on delivery
  'Cash on Delivery': 'cash_on_delivery',
  'COD': 'cash_on_delivery',
  'Bayar di Tempat': 'cash_on_delivery',
  
  // Bank transfer
  'Bank Transfer': 'bank_transfer',
  'Transfer Bank': 'bank_transfer',
  'Virtual Account': 'bank_transfer',
  'VA': 'bank_transfer',
  
  // Credit card
  'Credit Card': 'credit_card',
  'Debit Card': 'credit_card',
  'Kartu Kredit': 'credit_card',
  'Kartu Debit': 'credit_card',
  
  // Other methods
  'Transfer': 'transfer',
  'Cash': 'cash'
};

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

// Tax Configuration
const TAX_CONFIG = {
  DEFAULT_TAX_ID: false, // Set to false for no tax, or specific tax ID
  APPLY_TAX_PER_ORDER_LINE: true, // Apply tax per order line
  TAX_EXEMPT_CUSTOMERS: [], // Customer IDs that are tax exempt
  TAX_RATE_MAPPING: {
    'PPN': 11, // 11% PPN
    'PPN 11%': 11,
    'VAT': 11,
    'NO_TAX': false
  }
};

module.exports = {
  STORE_BRANCH_MAPPING,
  DEFAULT_BRANCH,
  BRANCH_WAREHOUSE_MAPPING,
  BRANCH_STOCK_LOCATION_MAPPING,
  ORDER_STATE_CONFIG,
  ORDER_PROCESSING_CONFIG,
  PAYMENT_METHOD_MAPPING,
  DESTY_CONFIG,
  ORDER_CONFIG,
  VALIDATION_CONFIG,
  TAX_CONFIG
};
