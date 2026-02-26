require("dotenv").config();
const { getAllWarehouses } = require("./services/orderService");

async function testWarehouses() {
  try {
    console.log("🔍 Mengambil daftar semua warehouse...");
    
    const warehouses = await getAllWarehouses();
    
    console.log("\n📦 Daftar Warehouse di Odoo:");
    console.log("================================");
    
    warehouses.forEach((wh, index) => {
      console.log(`${index + 1}. ID: ${wh.id}`);
      console.log(`   Name: ${wh.name}`);
      console.log(`   Code: ${wh.code}`);
      console.log(`   Location ID: ${wh.lot_stock_id}`);
      console.log("");
    });
    
    console.log(`\nTotal warehouse: ${warehouses.length}`);
    
    // Cek mapping yang ada
    console.log("\n🗺️  Mapping Branch → Warehouse Code:");
    console.log("=====================================");
    const { getWarehouseCodeByBranch } = require("./services/mappingService");
    
    const branches = ["KEDURUS", "GUBENG", "PUCANG"];
    branches.forEach(branch => {
      try {
        const code = getWarehouseCodeByBranch(branch);
        const warehouse = warehouses.find(wh => wh.code === code);
        if (warehouse) {
          console.log(`${branch} → ${code} ✅ (${warehouse.name})`);
        } else {
          console.log(`${branch} → ${code} ❌ (Warehouse tidak ditemukan)`);
        }
      } catch (error) {
        console.log(`${branch} → ❌ ${error.message}`);
      }
    });
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testWarehouses();
