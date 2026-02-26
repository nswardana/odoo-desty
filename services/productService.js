// services/productService.js

const { execute } = require("./odooService");

async function findOrCreateProduct(item) {
  try {
    const sku = item.sku || item.model_id || item.item_sku;
    const name = item.name || item.item_name;

    if (!sku) {
      throw new Error("Product SKU required from marketplace");
    }

    const existing = await execute("product.product", "search", [
      [["default_code", "=", sku]],
      0,
      1
    ]);

    if (existing.length > 0) {
      return existing[0];
    }

    // Product creation disabled - return error if product not found
    throw new Error(`Product with SKU ${sku} not found in Odoo. Please create the product first.`);

    // const productId = await execute("product.product", "create", [
    //   {
    //     name: name,
    //     default_code: sku,
    //     list_price: item.price || 0,
    //     type: "product"
    //   }
    // ]);

    // console.log("🆕 Product created:", productId);

    // return productId;
  } catch (error) {
    console.error("❌ findOrCreateProduct Error:", error.message);
    throw error;
  }
}

module.exports = { findOrCreateProduct };