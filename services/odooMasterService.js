// services/odooMasterService.js
// Interface to Odoo Master system (Stock, Pricelist, Product)

const { execute } = require("./odooService");

class OdooMasterService {
  
  // === PRODUCT OPERATIONS ===
  
  async getAllProducts() {
    try {
      const result = await execute("product.product", "search", [[]]);
      const products = await execute("product.product", "read", [
        result,
        ["id", "name", "default_code", "list_price", "type", "qty_available"]
      ]);
      return products;
    } catch (error) {
      console.error("❌ Error getting all products:", error.message);
      throw error;
    }
  }

  async getProductBySku(sku) {
    try {
      const result = await execute("product.product", "search", [
        [["default_code", "=", sku]],
        0,
        1
      ]);
      
      if (result.length === 0) {
        return null;
      }

      const products = await execute("product.product", "read", [
        result,
        ["id", "name", "default_code", "list_price", "type", "qty_available"]
      ]);
      
      return products[0];
    } catch (error) {
      console.error("❌ Error getting product by SKU:", error.message);
      throw error;
    }
  }

  async updateProductStock(productId, quantity) {
    try {
      await execute("product.product", "write", [
        [productId],
        { qty_available: quantity }
      ]);
      console.log(`✅ Updated stock for product ${productId}: ${quantity}`);
      return true;
    } catch (error) {
      console.error("❌ Error updating product stock:", error.message);
      throw error;
    }
  }

  // === STOCK OPERATIONS ===
  
  async getStockByWarehouse(warehouseId) {
    try {
      const result = await execute("stock.quant", "search", [
        [["location_id.usage", "=", "internal"], ["warehouse_id", "=", warehouseId]]
      ]);
      
      const stockQuants = await execute("stock.quant", "read", [
        result,
        ["product_id", "quantity", "location_id", "lot_id"]
      ]);
      
      return stockQuants;
    } catch (error) {
      console.error("❌ Error getting stock by warehouse:", error.message);
      throw error;
    }
  }

  async checkProductAvailability(productId, warehouseId, requiredQty) {
    try {
      const stockQuants = await this.getStockByWarehouse(warehouseId);
      const availableStock = stockQuants
        .filter(quant => quant.product_id[0] === productId)
        .reduce((total, quant) => total + quant.quantity, 0);
      
      return {
        available: availableStock,
        required: requiredQty,
        isAvailable: availableStock >= requiredQty
      };
    } catch (error) {
      console.error("❌ Error checking product availability:", error.message);
      throw error;
    }
  }

  // === PRICELIST OPERATIONS ===
  
  async getAllPricelists() {
    try {
      const result = await execute("product.pricelist", "search", [[]]);
      const pricelists = await execute("product.pricelist", "read", [
        result,
        ["id", "name", "currency_id", "active"]
      ]);
      return pricelists;
    } catch (error) {
      console.error("❌ Error getting pricelists:", error.message);
      throw error;
    }
  }

  async getProductPrice(productId, pricelistId = null, quantity = 1) {
    try {
      // If no pricelist specified, get default price
      if (!pricelistId) {
        const product = await execute("product.product", "read", [
          [productId],
          ["list_price"]
        ]);
        return product[0]?.list_price || 0;
      }

      // Get price from specific pricelist
      const price = await execute("product.pricelist", "price_get", [
        [pricelistId],
        [productId],
        quantity
      ]);
      
      return price[productId] || 0;
    } catch (error) {
      console.error("❌ Error getting product price:", error.message);
      throw error;
    }
  }

  // === WAREHOUSE OPERATIONS ===
  
  async getAllWarehouses() {
    try {
      const result = await execute("stock.warehouse", "search", [[]]);
      const warehouses = await execute("stock.warehouse", "read", [
        result,
        ["id", "name", "code", "lot_stock_id", "company_id"]
      ]);
      return warehouses;
    } catch (error) {
      console.error("❌ Error getting warehouses:", error.message);
      throw error;
    }
  }

  // === REPORTING ===
  
  async getSalesSummary(dateFrom, dateTo, warehouseId = null) {
    try {
      const domain = [
        ["state", "in", ["sale", "done"]],
        ["date_order", ">=", dateFrom],
        ["date_order", "<=", dateTo]
      ];
      
      if (warehouseId) {
        domain.push(["warehouse_id", "=", warehouseId]);
      }

      const result = await execute("sale.order", "search", [domain]);
      const orders = await execute("sale.order", "read", [
        result,
        ["id", "name", "origin", "amount_total", "date_order", "warehouse_id", "partner_id"]
      ]);
      
      return orders;
    } catch (error) {
      console.error("❌ Error getting sales summary:", error.message);
      throw error;
    }
  }
}

module.exports = new OdooMasterService();
