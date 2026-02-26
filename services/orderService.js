// services/orderService.js

const { execute, findOrCreatePartner } = require("./odooService");
const { findOrCreateProduct } = require("./productService");
const { getWarehouseCodeByBranch } = require("./mappingService");

async function orderExists(origin) {
  const existing = await execute("sale.order", "search", [
    [["origin", "=", origin]],
    0,
    1
  ]);
  return existing.length > 0;
}

async function getWarehouseByCode(code) {
  const result = await execute("stock.warehouse", "search", [
    [["code", "=", code]],
    0,
    1
  ]);

  return result.length ? result[0] : null;
}

async function getAllWarehouses() {
  const result = await execute("stock.warehouse", "search", [[]]);
  const warehouses = await execute("stock.warehouse", "read", [
    result,
    ["id", "name", "code", "lot_stock_id"]
  ]);
  return warehouses;
}

async function processMarketplaceOrder(source, order) {
  try {
    if (!order?.order_sn) {
      throw new Error("order_sn is required");
    }

    if (!order?.branch) {
      throw new Error("branch is required (KEDURUS/GUBENG/PUCANG)");
    }

    if (!order?.items || !order.items.length) {
      throw new Error("Order items cannot be empty");
    }

    const origin = `${source}-${order.order_sn}`;
    console.log("🔎 Checking existing order:", origin);

    if (await orderExists(origin)) {
      console.log("⚠️ Order already exists. Skipping.");
      return;
    }

    const partnerId = await findOrCreatePartner(order);

    // 🔥 Warehouse by Branch
    const warehouseCode = getWarehouseCodeByBranch(order.branch);
    const warehouseId = await getWarehouseByCode(warehouseCode);

    if (!warehouseId) {
      throw new Error(
        `Warehouse not found for branch ${order.branch} (code: ${warehouseCode})`
      );
    }

    const orderLines = [];

    for (const item of order.items) {
      const productId = await findOrCreateProduct(item);

      orderLines.push([
        0,
        0,
        {
          product_id: productId,
          product_uom_qty: item.qty || 1,
          price_unit: item.price || 0
        }
      ]);
    }

    const saleId = await execute("sale.order", "create", [
      {
        partner_id: partnerId,
        origin: origin,
        warehouse_id: warehouseId,
        order_line: orderLines
      }
    ]);

    await execute("sale.order", "action_confirm", [[saleId]]);

    console.log("✅ FULL ORDER PROCESSED:", saleId);
  } catch (error) {
    console.error("❌ processMarketplaceOrder Error:", error.message);
    throw error;
  }
}

module.exports = { processMarketplaceOrder, getAllWarehouses };