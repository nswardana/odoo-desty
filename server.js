require("dotenv").config();
const express = require("express");
const session = require('express-session');
const { orderQueue } = require("./queue");
const tokenService = require("./services/tokenService");

// Import webhook controllers
const destyController = require("./controllers/webhookDesty");

// Import Desty OAuth controller
const destyAuthController = require("./controllers/destyAuthController");

// Import Desty Product controller
const destyProductController = require("./controllers/destyProductController");

// Import Desty Order controller
const destyOrderController = require("./controllers/destyOrderController");

// Import auth controller
const authController = require("./controllers/authController");

// Import mapping controller
const mappingController = require("./controllers/mappingController");

// Import Odoo controller
const odooController = require("./controllers/odooController");

// Import sync controller
const syncController = require("./controllers/syncController");

// Import token management controller
const tokenManagementController = require("./controllers/tokenManagementController");

// Import error management controller
const errorManagementController = require("./controllers/errorManagementController");

const app = express();
app.use(express.json());

// Session configuration for OAuth state management
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 10 * 60 * 1000 // 10 minutes
  }
}));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    supportedMarketplaces: ["desty"],
    tokensConfigured: tokenService.getMarketplacesWithTokens()
  });
});

// === WEBHOOK ENDPOINTS ===


// Desty webhooks
app.post("/webhook/desty", destyController.handleWebhook.bind(destyController));
app.post("/webhook/desty/sync", destyController.syncProducts.bind(destyController));
app.get("/webhook/desty/mappings", destyController.getMappings.bind(destyController));
app.get("/webhook/desty/test", destyController.testWebhook.bind(destyController));
app.get("/webhook/desty/health", destyController.healthCheck.bind(destyController));


// === DESTY OAUTH ENDPOINTS ===

// Desty OAuth flow
app.get("/desty/authorize", destyAuthController.authorize.bind(destyAuthController));
app.get("/desty/callback", destyAuthController.callback.bind(destyAuthController));
app.post("/desty/token", destyAuthController.refreshToken.bind(destyAuthController));

// Desty auth management
app.get("/desty/status", destyAuthController.getAuthStatus.bind(destyAuthController));
app.post("/desty/revoke", destyAuthController.revokeToken.bind(destyAuthController));

// Desty API endpoints
app.get("/desty/stores", destyAuthController.getStores.bind(destyAuthController));
app.post("/desty/api-key", destyAuthController.generateApiKey.bind(destyAuthController));

// === DESTY PRODUCT ENDPOINTS ===

// Desty Product CRUD operations
app.get("/desty/products", destyProductController.getProducts.bind(destyProductController));
app.get("/desty/products/:productId", destyProductController.getProduct.bind(destyProductController));
app.post("/desty/products", destyProductController.createProduct.bind(destyProductController));
app.put("/desty/products/:productId", destyProductController.updateProduct.bind(destyProductController));
app.delete("/desty/products/:productId", destyProductController.deleteProduct.bind(destyProductController));

// Desty Product utilities
app.post("/desty/products/sync", destyProductController.syncProducts.bind(destyProductController));
app.get("/desty/products/search", destyProductController.searchProducts.bind(destyProductController));
app.get("/desty/products/categories", destyProductController.getCategories.bind(destyProductController));

// === DESTY ORDER ENDPOINTS ===

// Desty Order CRUD operations
app.get("/desty/orders", destyOrderController.getOrders.bind(destyOrderController));
app.get("/desty/orders/:orderId", destyOrderController.getOrder.bind(destyOrderController));
app.post("/desty/orders", destyOrderController.createOrder.bind(destyOrderController));
app.put("/desty/orders/:orderId", destyOrderController.updateOrder.bind(destyOrderController));

// Desty Order actions
app.post("/desty/orders/:orderId/confirm", destyOrderController.confirmOrder.bind(destyOrderController));
app.post("/desty/orders/:orderId/cancel", destyOrderController.cancelOrder.bind(destyOrderController));
app.post("/desty/orders/:orderId/ship", destyOrderController.shipOrder.bind(destyOrderController));

// Desty Order utilities
app.get("/desty/orders/search", destyOrderController.searchOrders.bind(destyOrderController));
app.get("/desty/orders/stats", destyOrderController.getOrderStats.bind(destyOrderController));

// === TOKEN MANAGEMENT ENDPOINTS ===

// Set token for marketplace
app.post("/api/tokens/:marketplace", async (req, res) => {
  try {
    const { marketplace } = req.params;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    if (!tokenService.validateTokenFormat(marketplace, token)) {
      return res.status(400).json({ 
        error: "Invalid token format for marketplace: " + marketplace 
      });
    }

    await tokenService.setToken(marketplace, token);
    
    res.json({ 
      status: "success", 
      message: `Token set for ${marketplace}`,
      info: tokenService.getTokenInfo(marketplace)
    });
  } catch (error) {
    console.error("❌ Error setting token:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get token for marketplace
app.get("/api/tokens/:marketplace", (req, res) => {
  try {
    const { marketplace } = req.params;
    const tokenInfo = tokenService.getTokenInfo(marketplace);
    
    if (!tokenInfo) {
      return res.status(404).json({ error: "Token not found" });
    }

    res.json({ 
      marketplace,
      tokenInfo,
      hasToken: tokenService.hasToken(marketplace)
    });
  } catch (error) {
    console.error("❌ Error getting token:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Remove token for marketplace
app.delete("/api/tokens/:marketplace", async (req, res) => {
  try {
    const { marketplace } = req.params;
    
    if (!tokenService.hasToken(marketplace)) {
      return res.status(404).json({ error: "Token not found" });
    }

    await tokenService.removeToken(marketplace);
    
    res.json({ 
      status: "success", 
      message: `Token removed for ${marketplace}`
    });
  } catch (error) {
    console.error("❌ Error removing token:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Generate new token for marketplace
app.post("/api/tokens/:marketplace/generate", async (req, res) => {
  try {
    const { marketplace } = req.params;
    const { environment = "prod" } = req.body;

    const newToken = await tokenService.refreshToken(marketplace, environment);
    
    res.json({ 
      status: "success", 
      token: newToken,
      info: tokenService.getTokenInfo(marketplace)
    });
  } catch (error) {
    console.error("❌ Error generating token:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get all tokens info
app.get("/api/tokens", (req, res) => {
  try {
    const marketplaces = ["desty"];
    const tokens = {};
    
    for (const marketplace of marketplaces) {
      tokens[marketplace] = {
        hasToken: tokenService.hasToken(marketplace),
        info: tokenService.getTokenInfo(marketplace)
      };
    }
    
    res.json({ tokens });
  } catch (error) {
    console.error("❌ Error getting tokens:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Export/Import tokens
app.get("/api/tokens/export", async (req, res) => {
  try {
    const exportData = await tokenService.exportTokens();
    res.json(exportData);
  } catch (error) {
    console.error("❌ Error exporting tokens:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tokens/import", async (req, res) => {
  try {
    const { exportData } = req.body;
    await tokenService.importTokens(exportData);
    res.json({ status: "success", message: "Tokens imported successfully" });
  } catch (error) {
    console.error("❌ Error importing tokens:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// === AUTHENTICATION ENDPOINTS ===

// Authenticate marketplace
app.post("/auth/marketplace", authController.authenticateMarketplace.bind(authController));

// Refresh access token
app.post("/auth/refresh", authController.refreshToken.bind(authController));

// Validate auth token
app.get("/auth/validate", authController.validateAuthToken.bind(authController));

// === ACCOUNT MANAGEMENT ENDPOINTS ===

// Create new account
app.post("/api/accounts", authController.createAccount.bind(authController));

// Update account
app.put("/api/accounts/:account_id", authController.updateAccount.bind(authController));

// Get account details
app.get("/api/accounts/:account_id", authController.getAccount.bind(authController));

// List all accounts
app.get("/api/accounts", authController.listAccounts.bind(authController));

// Deactivate account
app.delete("/api/accounts/:account_id", authController.deactivateAccount.bind(authController));

// Get account statistics
app.get("/api/accounts/stats", authController.getAccountStats.bind(authController));

// Get accounts needing token refresh
app.get("/api/accounts/refresh-needed", authController.getAccountsNeedingRefresh.bind(authController));

// Bulk create accounts
app.post("/api/accounts/bulk", authController.bulkCreateAccounts.bind(authController));

// === MAPPING ENGINE ENDPOINTS ===

// Create new shop mapping
app.post("/api/mappings/shops", mappingController.createShopMapping.bind(mappingController));

// Update shop mapping
app.put("/api/mappings/shops/:shop_id", mappingController.updateShopMapping.bind(mappingController));

// Get shop mapping by marketplace and shop
app.get("/api/mappings/shops/:marketplace/:shop_id", mappingController.getShopMapping.bind(mappingController));

// Get shop mapping by ID
app.get("/api/mappings/shops/:shop_id", mappingController.getShopMappingById.bind(mappingController));

// List all shop mappings
app.get("/api/mappings/shops", mappingController.listShopMappings.bind(mappingController));

// Deactivate shop mapping
app.delete("/api/mappings/shops/:shop_id", mappingController.deactivateShopMapping.bind(mappingController));

// Update sync settings
app.put("/api/mappings/shops/:shop_id/sync", mappingController.updateSyncSettings.bind(mappingController));

// Get default sync settings
app.get("/api/mappings/shops/:marketplace/default-sync", mappingController.getDefaultSyncSettings.bind(mappingController));

// Update webhook configuration
app.put("/api/mappings/shops/:shop_id/webhook", mappingController.updateWebhookConfig.bind(mappingController));

// Validate webhook configuration
app.get("/api/mappings/shops/:shop_id/webhook/validate", mappingController.validateWebhookConfig.bind(mappingController));

// Validate shop configuration
app.get("/api/mappings/shops/:shop_id/validate", mappingController.validateShopConfiguration.bind(mappingController));

// Validate Odoo entities
app.post("/api/mappings/validate-odoo", mappingController.validateOdooEntities.bind(mappingController));

// Get shops needing sync
app.get("/api/mappings/shops/sync-needed", mappingController.getShopsNeedingSync.bind(mappingController));

// Update last sync timestamp
app.put("/api/mappings/shops/:shop_id/sync", mappingController.updateLastSync.bind(mappingController));

// Bulk create shop mappings
app.post("/api/mappings/shops/bulk", mappingController.bulkCreateShopMappings.bind(mappingController));

// Get shop mapping statistics
app.get("/api/mappings/stats", mappingController.getShopMappingStats.bind(mappingController));

// Migrate from legacy mappings
app.post("/api/mappings/migrate", mappingController.migrateFromLegacyMappings.bind(mappingController));

// === ODOO INTEGRATION ENDPOINTS ===

// Order workflow endpoints
app.post("/api/odoo/orders/process", odooController.processOrder.bind(odooController));
app.put("/api/odoo/orders/:marketplace_order_id/status", odooController.updateOrderStatus.bind(odooController));
app.post("/api/odoo/orders/batch", odooController.batchProcessOrders.bind(odooController));

// Product workflow endpoints
app.post("/api/odoo/products/sync", odooController.syncProduct.bind(odooController));

// Stock workflow endpoints
app.post("/api/odoo/stock/sync", odooController.syncStock.bind(odooController));
app.post("/api/odoo/stock/batch", odooController.batchSyncStock.bind(odooController));

// Health check endpoints
app.get("/api/odoo/health", odooController.healthCheck.bind(odooController));
app.get("/api/odoo/test-connection", odooController.testConnection.bind(odooController));

// Utility endpoints
app.get("/api/odoo/products/:sku", odooController.checkProduct.bind(odooController));
app.post("/api/odoo/partners/check", odooController.checkPartner.bind(odooController));
app.post("/api/odoo/partners/create", odooController.createPartner.bind(odooController));
app.get("/api/odoo/status-mapping/:marketplace/:shop_id", odooController.getOrderStatusMapping.bind(odooController));

// === SYNC BACK TO MARKETPLACE ENDPOINTS ===

// Order sync endpoints
app.post("/api/sync/orders/status", syncController.syncOrderStatus.bind(syncController));
app.post("/api/sync/orders/tracking", syncController.syncTrackingNumber.bind(syncController));
app.put("/api/sync/pickings/:picking_id", syncController.syncOnPicking.bind(syncController));

// Batch sync endpoints
app.post("/api/sync/orders/batch", syncController.batchSyncOrders.bind(syncController));
app.post("/api/sync/tracking/batch", syncController.batchSyncTrackingNumbers.bind(syncController));

// Sync status endpoints
app.get("/api/sync/orders/:order_id/status", syncController.getSyncStatus.bind(syncController));

// Failed sync management
app.post("/api/sync/retry-failed", syncController.retryFailedSyncs.bind(syncController));
app.get("/api/sync/history", syncController.getSyncHistory.bind(syncController));
app.get("/api/sync/failed", syncController.getFailedSyncs.bind(syncController));

// Scheduled sync endpoints
app.post("/api/sync/scheduled", syncController.runScheduledSync.bind(syncController));

// Health check endpoints
app.get("/api/sync/health", syncController.healthCheck.bind(syncController));
app.get("/api/sync/marketplace-health", syncController.marketplaceHealthCheck.bind(syncController));

// Utility endpoints
app.post("/api/sync/test-connection", syncController.testMarketplaceConnection.bind(syncController));
app.get("/api/sync/configs", syncController.getMarketplaceConfigs.bind(syncController));

// === TOKEN MANAGEMENT ENDPOINTS ===

// Token health endpoints
app.get("/api/tokens/health", tokenManagementController.getTokenHealth.bind(tokenManagementController));
app.get("/api/tokens/expiry-alerts", tokenManagementController.getExpiryAlerts.bind(tokenManagementController));

// Token refresh endpoints
app.post("/api/tokens/:account_id/refresh", tokenManagementController.refreshToken.bind(tokenManagementController));
app.post("/api/tokens/refresh-all", tokenManagementController.refreshAllTokens.bind(tokenManagementController));
app.post("/api/tokens/marketplace/:marketplace/refresh", tokenManagementController.refreshTokensByMarketplace.bind(tokenManagementController));

// Token rotation endpoints
app.post("/api/tokens/:account_id/rotate", tokenManagementController.rotateToken.bind(tokenManagementController));

// Scheduled refresh endpoints
app.post("/api/tokens/:account_id/schedule-refresh", tokenManagementController.scheduleRefresh.bind(tokenManagementController));

// Cleanup endpoints
app.post("/api/tokens/cleanup-expired", tokenManagementController.cleanupExpiredTokens.bind(tokenManagementController));

// Cron job management
app.get("/api/tokens/refresh-job/status", tokenManagementController.getRefreshJobStatus.bind(tokenManagementController));
app.post("/api/tokens/refresh-job/run", tokenManagementController.runRefreshJobManually.bind(tokenManagementController));

// Token validation
app.post("/api/tokens/:account_id/validate", tokenManagementController.validateToken.bind(tokenManagementController));

// Token usage tracking
app.post("/api/tokens/:account_id/track-usage", tokenManagementController.trackTokenUsage.bind(tokenManagementController));

// Service management
app.post("/api/tokens/service/initialize", tokenManagementController.initializeService.bind(tokenManagementController));
app.get("/api/tokens/service/status", tokenManagementController.getServiceStatus.bind(tokenManagementController));
app.post("/api/tokens/service/stop", tokenManagementController.stopService.bind(tokenManagementController));

// Utility endpoints
app.post("/api/tokens/:account_id/test-refresh", tokenManagementController.testTokenRefresh.bind(tokenManagementController));

// === ERROR MANAGEMENT ENDPOINTS ===

// Error reporting and statistics
app.get("/api/errors/report", errorManagementController.getErrorReport.bind(errorManagementController));
app.get("/api/errors/stats", errorManagementController.getErrorStats.bind(errorManagementController));
app.get("/api/errors/pending", errorManagementController.getPendingErrors.bind(errorManagementController));
app.get("/api/errors/marketplace/:marketplace", errorManagementController.getErrorsByMarketplace.bind(errorManagementController));

// Error resolution
app.post("/api/errors/:error_id/resolve", errorManagementController.resolveError.bind(errorManagementController));
app.post("/api/errors/bulk-resolve", errorManagementController.bulkResolveErrors.bind(errorManagementController));

// Error search and retrieval
app.get("/api/errors/search", errorManagementController.searchErrors.bind(errorManagementController));
app.get("/api/errors/:error_id", errorManagementController.getErrorById.bind(errorManagementController));

// Log management
app.post("/api/errors/clear-logs", errorManagementController.clearOldLogs.bind(errorManagementController));
app.get("/api/errors/log-status", errorManagementController.getLogStatus.bind(errorManagementController));

// Dashboard
app.get("/api/errors/dashboard", errorManagementController.getDashboardData.bind(errorManagementController));

// Utility endpoints
app.post("/api/errors/test-logging", errorManagementController.testErrorLogging.bind(errorManagementController));

// Start server
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Desty Bridge API running on port " + (process.env.PORT || 3000));
  console.log("📊 Supported marketplaces: desty");
  console.log("🔐 Token management endpoints available at /api/tokens");
  console.log("🔄 Token Management Strategy with auto-refresh enabled");
  console.log("🚨 Error Management endpoints available at /api/errors");
  console.log("⚠️  AUTO-CREATE PRODUCT DISABLED - Orders fail if SKU not found");
  console.log("🔑 Authentication endpoints available at /auth");
  console.log("👥 Account management endpoints available at /api/accounts");
  console.log("🗺️ Mapping Engine endpoints available at /api/mappings");
  console.log("🔗 Odoo v15 Integration endpoints available at /api/odoo");
  console.log("🔄 Sync Back to Marketplace endpoints available at /api/sync");
  console.log("📥 Webhook endpoints:");
  console.log("   POST /webhook/desty");
});