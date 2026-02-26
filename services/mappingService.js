// services/mappingService.js

const shopMap = {
  SHOPEE_KDR_01: { branch: "KEDURUS", channel: "shopee" },
  SHOPEE_KDR_02: { branch: "KEDURUS", channel: "shopee" },

  TOKO_KDR_01: { branch: "KEDURUS", channel: "tokopedia" },

  SHOPEE_GBG_01: { branch: "GUBENG", channel: "shopee" },

  SHOPEE_PCG_01: { branch: "PUCANG", channel: "shopee" }
};

const branchWarehouseMap = {
  KEDURUS: "SKDR",    // Beepetmart DZ Petshop Kedurus
  GUBENG: "GBG",      // Beepetmart DZ Petshop Gubeng  
  PUCANG: "SPCG"      // Beepetmart DZ Petshop Pucang
};

function getShopConfig(shopId) {
  const config = shopMap[shopId];
  if (!config) {
    throw new Error(`Shop mapping not found for ${shopId}`);
  }
  return config;
}

function getWarehouseCodeByBranch(branch) {
  const code = branchWarehouseMap[branch];
  if (!code) {
    throw new Error(`Warehouse not found for branch ${branch}`);
  }
  return code;
}

module.exports = { getShopConfig, getWarehouseCodeByBranch };