// Configuration file for Desty-Odoo integration

// Store to Branch Mapping Configuration
const STORE_BRANCH_MAPPING = {
  'Gowa Petstore': 'GOWA',
  'Sudiang Pet Store': 'SUDIANG',
  'Petmart Makassar': 'MAKASSAR',
  'DIAZ PETSHOP KEDURUS': 'KEDURUS',
  'Diaz Petshop Surabaya': 'PUCANG',
  'Diaz Petshop Gubeng': 'SUMATRA',
  'DIAZ PETSHOP KEDURUS (MASTRIP)':"KEDURUS",
  'PusatgrosirPET':'PUCANG',
  'Java_Petshop':'PUCANG',
  'Diaz Petshop Gubeng':'SUMATRA',
  'Durian_Petshop':'SUMATRA',
  'FLYNN PET (Petshop Surabaya)':'KEDURUS',
  'Pao Petshop':'KEDURUS',
  'diazpetshop_surabaya':'PUCANG',
  'Diaz Petshop':'PUCANG',
  'Diazpetshop Gubeng':'SUMATRA',
  'diazpetshop kedurus':'KEDURUS',
  'BABAH PETSHOP SURABAYA':'PUCANG',
  'Babah Petshop Surabaya':'PUCANG',
  'Babah Petshop Surabaya Pusat':'PUCANG'
};

// Default branch if store not found
const DEFAULT_BRANCH = 'KEDURUS';

// Branch to Warehouse Mapping Configuration
const BRANCH_WAREHOUSE_MAPPING = {
  'GOWA': 57, // GOWA -> Warehouse (ID: 57)
  'SUDIANG': 44, // SUDIANG Branch -> Warehouse 44
  'MAKASSAR': 37, // MAKASSAR Branch -> Warehouse 37
  'PUCANG': 58, // PuPUCANGcang Branch -> Stock Location 58
  'KEDURUS': 59, // KEDURUS Branch -> Stock Location 59
  'SUMATRA': 60 // SUMATRA Branch -> Stock Location 60

};

// Branch to Stock Location Mapping Configuration
const BRANCH_STOCK_LOCATION_MAPPING = {
  'GOWA': 8, // Gowa Petstore -> Stock Location 8
  'MAKASSAR': 9, // Makassar Branch -> Stock Location 9
  'JAKARTA': 10, // Jakarta Branch -> Stock Location 10
  'SURABAYA1': 58, // Pucang Branch -> Stock Location 59
  'SURABAYA2': 59, // Kedurus Branch -> Stock Location 58
  'SURABAYA3': 60 // Gubeng Branch -> Stock Location 
};

// Odoo Default Values Configuration
const ODOO_DEFAULTS = {
  FISCAL_POSITION_ID: 1,    // Default tax position
  SALES_TEAM_ID: 1,         // Default sales team
  WAREHOUSE_ID: 1,           // Default warehouse
  STOCK_LOCATION_ID: 8,        // Default stock location
  PAYMENT_TERM_ID: 1,         // Default payment term
  PRICELIST_ID: 1,           // Default pricelist
  COMPANY_ID: 1               // Default company
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
  ALLOW_NEGATIVE_STOCK: false,
  
  // Step Processing Configuration
  ENABLE_ORDER_CONFIRMATION: false,  // Step 5: Handle order confirmation
  ENABLE_SHIPMENT_CREATION: false   // Step 6: Create shipment
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
  DEFAULT_PLATFORM: '', //jika di kosongkan semuanya : shopee
  DEFAULT_STATUS: 'Ready_To_Ship',
  DEFAULT_PAGE_SIZE: 1
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
  // Store and Branch Configuration
  STORE_BRANCH_MAPPING,
  DEFAULT_BRANCH,
  BRANCH_WAREHOUSE_MAPPING,
  BRANCH_STOCK_LOCATION_MAPPING,
  
  // Order Configuration
  ORDER_STATE_CONFIG,
  ORDER_PROCESSING_CONFIG,
  PAYMENT_METHOD_MAPPING,
  TAX_CONFIG,
  
  // Odoo Default Values
  ODOO_DEFAULTS,
  
  // Desty API Configuration
  DESTY_CONFIG,
  
  // Order Processing Configuration
  ORDER_CONFIG,
  VALIDATION_CONFIG
};

/*
You are now connected to database "RAP" as user "postgres".
RAP=# SELECT id, name, code FROM stock_warehouse;
 id |             name              | code  
----+-------------------------------+-------
 46 | BeePetmart MU 2               | MU-2
  1 | Gudang ED                     | WHED
 57 | Beepetmart Hasanuddin Gowa    | GOWA
 50 | Gudang Daeng Ramang           | DRG
 37 | BeePetmart Makassar           | MKS
 48 | Gudang Penyesuaian            | WHPEN
 39 | BeePetmart BTP                | BTP
 56 | Beepetmart Perintis NTI       | NTI
 40 | BeePetmart Goaria             | GRA
 54 | Beepetmart Panaikang          | PNK
 44 | BeePetmart Sudiang            | SDNG
 38 | BeePetmart Daya               | DAYA
 49 | Gudang MES                    | WHMES
 41 | BeePetmart Paccerakkang       | PCR
 45 | Transit Transfer              | T-TRS
 59 | Beepetmart DZ Petshop Kedurus | SKDR
 58 | Beepetmart DZ Petshop Pucang  | SPCG
 60 | Beepetmart DZ Petshop Gubeng  | GBG
 55 | BeePetMart Royal BTP          | ROYAL
 51 | Beepetmart Mandai             | MDI
 52 | Beepetmart CageStore          | CGS
 47 | Beepetmart Abdesir            | ADS
 53 | RAP Utama                     | RAPU
 43 | BeePetmart MU                 | MU
 42 | BeePetmart Antang             | ATG
 36 | BeePetmart Daengta            | DT
(26 rows)

RAP=# 

*/