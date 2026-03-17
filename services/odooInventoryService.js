// services/odooInventoryService.js
// Odoo ERP integration for inventory operations

const odooIntegrationService = require('./odooIntegrationService');

class OdooInventoryService {
  constructor() {
    this.odooService = odooIntegrationService;
  }

  // Get current stock for a product
  async getCurrentStock(productId, warehouseId = null) {
    console.log(`📋 Getting Odoo stock: Product ${productId}, Warehouse: ${warehouseId || 'all'}`);
    
    try {
      let domain = [['product_id', '=', productId], ['location_id.usage', '=', 'internal']];
      
      if (warehouseId) {
        // Filter by specific warehouse
        domain.push(['location_id.warehouse_id', '=', warehouseId]);
      }

      const quants = await this.odooService.execute('stock.quant', 'search_read', [
        domain,
        ['quantity', 'location_id', 'product_id']
      ]);

      const totalStock = quants.reduce((total, quant) => total + quant.quantity, 0);
      
      console.log(`📊 Odoo stock retrieved: ${productId} -> ${totalStock}`);
      return totalStock;
      
    } catch (error) {
      console.error(`❌ Failed to get Odoo stock for product ${productId}:`, error.message);
      throw error;
    }
  }

  // Adjust stock for a product
  async adjustStock(productId, newStock, warehouseId = null, reason = 'Inventory Sync') {
    console.log(`🔧 Adjusting Odoo stock: Product ${productId}, New Stock: ${newStock}`);
    
    try {
      const currentStock = await this.getCurrentStock(productId, warehouseId);
      const adjustment = newStock - currentStock;
      
      if (adjustment === 0) {
        console.log(`ℹ️ No stock adjustment needed for product ${productId}`);
        return { success: true, adjustment: 0 };
      }

      // Get default stock location
      const stockLocationId = await this.getStockLocationId(warehouseId);
      
      // Create inventory adjustment
      const inventoryData = {
        name: `Inventory Sync - ${reason}`,
        filter: 'product',
        product_ids: [productId],
        location_id: stockLocationId,
        line_ids: [[0, 0, {
          product_id: productId,
          product_qty: newStock,
          location_id: stockLocationId
        }]]
      };

      const inventory = await this.odooService.execute('stock.inventory', 'create', [inventoryData]);
      
      // Validate and apply the adjustment
      await this.odooService.execute('stock.inventory', 'action_validate', [[inventory.id]]);
      
      console.log(`✅ Odoo stock adjusted: ${productId} ${currentStock} -> ${newStock} (${adjustment > 0 ? '+' : ''}${adjustment})`);
      
      return { 
        success: true, 
        adjustment,
        inventoryId: inventory.id,
        previousStock: currentStock,
        newStock
      };
      
    } catch (error) {
      console.error(`❌ Failed to adjust Odoo stock for product ${productId}:`, error.message);
      throw error;
    }
  }

  // Get stock location ID
  async getStockLocationId(warehouseId = null) {
    try {
      if (warehouseId) {
        // Get specific warehouse stock location
        const warehouse = await this.odooService.execute('stock.warehouse', 'read', [
          [warehouseId],
          ['lot_stock_id']
        ]);
        
        if (warehouse.length > 0) {
          return warehouse[0].lot_stock_id[0];
        }
      }
      
      // Get default stock location
      const locations = await this.odooService.execute('stock.location', 'search', [
        [['usage', '=', 'internal'], ['company_id', '=', this.odooService.companyId]]
      ]);
      
      return locations.length > 0 ? locations[0] : 8; // Default location ID
      
    } catch (error) {
      console.error('❌ Failed to get stock location ID:', error.message);
      return 8; // Default fallback
    }
  }

  // Get recent stock moves
  async getRecentStockMoves(productId, hours = 1) {
    console.log(`📋 Getting recent Odoo stock moves: Product ${productId}, Last ${hours} hours`);
    
    try {
      const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      const moves = await this.odooService.execute('stock.move', 'search_read', [
        [
          ['product_id', '=', productId],
          ['state', '=', 'done'],
          ['date', '>=', fromDate.toISOString().split('T')[0]]
        ],
        ['product_id', 'product_qty', 'location_id', 'location_dest_id', 'date', 'reference']
      ]);

      console.log(`📊 Recent stock moves retrieved: ${moves.length} moves`);
      return moves;
      
    } catch (error) {
      console.error(`❌ Failed to get recent stock moves for product ${productId}:`, error.message);
      throw error;
    }
  }

  // Create stock move
  async createStockMove(productId, quantity, fromLocationId, toLocationId, reference = 'Inventory Sync') {
    console.log(`📦 Creating Odoo stock move: Product ${productId}, Qty: ${quantity}`);
    
    try {
      const moveData = {
        name: reference,
        product_id: productId,
        product_uom_qty: quantity,
        product_uom: 1, // Default UOM
        location_id: fromLocationId,
        location_dest_id: toLocationId,
        reference: reference
      };

      const move = await this.odooService.execute('stock.move', 'create', [moveData]);
      
      // Confirm the move
      await this.odooService.execute('stock.move', 'action_confirm', [[move.id]]);
      
      console.log(`✅ Stock move created: ${move.id}`);
      return move;
      
    } catch (error) {
      console.error(`❌ Failed to create stock move:`, error.message);
      throw error;
    }
  }

  // Get product variants with stock
  async getProductsWithStock(warehouseId = null, limit = 100) {
    console.log(`📦 Getting Odoo products with stock: Warehouse ${warehouseId || 'all'}, Limit: ${limit}`);
    
    try {
      let domain = [['sale_ok', '=', true]];
      
      const products = await this.odooService.execute('product.product', 'search_read', [
        domain,
        ['id', 'name', 'default_code', 'type'],
        { limit }
      ]);

      const productsWithStock = [];
      
      for (const product of products) {
        try {
          const stock = await this.getCurrentStock(product.id, warehouseId);
          productsWithStock.push({
            ...product,
            stock
          });
        } catch (error) {
          console.warn(`⚠️ Could not get stock for product ${product.id}:`, error.message);
          productsWithStock.push({
            ...product,
            stock: 0
          });
        }
      }

      console.log(`📊 Products with stock retrieved: ${productsWithStock.length} products`);
      return productsWithStock;
      
    } catch (error) {
      console.error(`❌ Failed to get products with stock:`, error.message);
      throw error;
    }
  }

  // Get warehouse information
  async getWarehouses() {
    console.log(`🏪 Getting Odoo warehouses`);
    
    try {
      const warehouses = await this.odooService.execute('stock.warehouse', 'search_read', [
        [],
        ['id', 'name', 'code', 'lot_stock_id']
      ]);

      console.log(`📦 Warehouses retrieved: ${warehouses.length} warehouses`);
      return warehouses;
      
    } catch (error) {
      console.error(`❌ Failed to get Odoo warehouses:`, error.message);
      throw error;
    }
  }

  // Get stock location information
  async getLocations(warehouseId = null) {
    console.log(`📍 Getting Odoo locations: Warehouse ${warehouseId || 'all'}`);
    
    try {
      let domain = [['usage', '=', 'internal']];
      
      if (warehouseId) {
        domain.push(['warehouse_id', '=', warehouseId]);
      }

      const locations = await this.odooService.execute('stock.location', 'search_read', [
        domain,
        ['id', 'name', 'usage', 'warehouse_id']
      ]);

      console.log(`📍 Locations retrieved: ${locations.length} locations`);
      return locations;
      
    } catch (error) {
      console.error(`❌ Failed to get Odoo locations:`, error.message);
      throw error;
    }
  }

  // Check for stock changes since last sync
  async getStockChanges(since, warehouseId = null) {
    console.log(`📋 Getting Odoo stock changes since: ${since}`);
    
    try {
      const fromDate = new Date(since);
      
      // Get stock moves since the specified date
      const moves = await this.odooService.execute('stock.move', 'search_read', [
        [
          ['state', '=', 'done'],
          ['date', '>=', fromDate.toISOString()]
        ],
        ['product_id', 'product_qty', 'location_id', 'location_dest_id', 'date']
      ]);

      // Group changes by product
      const changes = {};
      
      for (const move of moves) {
        const productId = move.product_id[0];
        
        if (!changes[productId]) {
          changes[productId] = {
            productId,
            moves: [],
            netChange: 0
          };
        }
        
        changes[productId].moves.push(move);
        
        // Calculate net change (positive = stock in, negative = stock out)
        const isStockIn = move.location_dest_id[1].includes('Stock') || 
                         !move.location_id[1].includes('Stock');
        
        changes[productId].netChange += isStockIn ? move.product_qty : -move.product_qty;
      }

      console.log(`📊 Stock changes retrieved: ${Object.keys(changes).length} products affected`);
      return Object.values(changes);
      
    } catch (error) {
      console.error(`❌ Failed to get stock changes:`, error.message);
      throw error;
    }
  }

  // Validate stock levels
  async validateStockLevels(productId, expectedStock, warehouseId = null) {
    console.log(`✅ Validating Odoo stock: Product ${productId}, Expected: ${expectedStock}`);
    
    try {
      const actualStock = await this.getCurrentStock(productId, warehouseId);
      const difference = actualStock - expectedStock;
      
      const isValid = Math.abs(difference) <= 1; // Allow 1 unit tolerance
      
      console.log(`📊 Stock validation: ${productId} - Actual: ${actualStock}, Expected: ${expectedStock}, Valid: ${isValid}`);
      
      return {
        productId,
        actualStock,
        expectedStock,
        difference,
        isValid
      };
      
    } catch (error) {
      console.error(`❌ Failed to validate stock levels:`, error.message);
      throw error;
    }
  }

  // Get low stock products
  async getLowStockProducts(threshold = 10, warehouseId = null) {
    console.log(`⚠️ Getting low stock products: Threshold ${threshold}`);
    
    try {
      const products = await this.getProductsWithStock(warehouseId);
      const lowStock = products.filter(product => product.stock <= threshold);
      
      console.log(`⚠️ Low stock products: ${lowStock.length} products below threshold`);
      return lowStock;
      
    } catch (error) {
      console.error(`❌ Failed to get low stock products:`, error.message);
      throw error;
    }
  }

  // Create stock forecast
  async getStockForecast(productId, days = 7, warehouseId = null) {
    console.log(`📈 Getting stock forecast: Product ${productId}, Days: ${days}`);
    
    try {
      const currentStock = await this.getCurrentStock(productId, warehouseId);
      const recentMoves = await this.getRecentStockMoves(productId, days * 24);
      
      // Calculate average daily consumption
      const totalOutgoing = recentMoves
        .filter(move => !move.location_dest_id[1].includes('Stock'))
        .reduce((total, move) => total + move.product_qty, 0);
      
      const avgDailyConsumption = totalOutgoing / days;
      const daysOfStock = avgDailyConsumption > 0 ? Math.floor(currentStock / avgDailyConsumption) : 999;
      
      const forecast = {
        productId,
        currentStock,
        avgDailyConsumption,
        daysOfStock,
        forecastedStock: Math.max(0, currentStock - (avgDailyConsumption * days)),
        recommendation: daysOfStock < 7 ? 'Reorder needed' : 'Stock sufficient'
      };
      
      console.log(`📈 Stock forecast: ${productId} - ${daysOfStock} days of stock`);
      return forecast;
      
    } catch (error) {
      console.error(`❌ Failed to get stock forecast:`, error.message);
      throw error;
    }
  }
}

module.exports = new OdooInventoryService();
