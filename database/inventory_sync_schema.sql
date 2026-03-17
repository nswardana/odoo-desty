-- Database schema for inventory synchronization
-- Run this in your PostgreSQL database

-- Product mapping table
CREATE TABLE IF NOT EXISTS product_mapping (
  id SERIAL PRIMARY KEY,
  odoo_product_id INTEGER NOT NULL,
  odoo_sku VARCHAR(100) NOT NULL,
  desty_item_id VARCHAR(100) NOT NULL,
  desty_external_code VARCHAR(100) NOT NULL,
  desty_shop_id VARCHAR(100) NOT NULL,
  desty_warehouse_id VARCHAR(100),
  last_sync TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(odoo_product_id),
  UNIQUE(desty_item_id, desty_shop_id)
);

-- Inventory sync log table
CREATE TABLE IF NOT EXISTS inventory_sync_log (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100),
  source VARCHAR(20) NOT NULL, -- 'odoo' or 'desty'
  target VARCHAR(20) NOT NULL, -- 'odoo' or 'desty'
  old_stock INTEGER,
  new_stock INTEGER NOT NULL,
  sync_time TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) NOT NULL, -- 'success', 'failed', 'pending'
  error_message TEXT,
  api_response TEXT,
  retry_count INTEGER DEFAULT 0,
  INDEX(sku),
  INDEX(sync_time),
  INDEX(status),
  INDEX(source, target)
);

-- Manual review queue table
CREATE TABLE IF NOT EXISTS manual_review_queue (
  id SERIAL PRIMARY KEY,
  identifier VARCHAR(100) NOT NULL, -- SKU or product ID
  source VARCHAR(20) NOT NULL,
  target VARCHAR(20) NOT NULL,
  stock INTEGER,
  error_message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by VARCHAR(100),
  review_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  review_notes TEXT,
  INDEX(review_status),
  INDEX(created_at)
);

-- Sync configuration table
CREATE TABLE IF NOT EXISTS sync_configuration (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(100)
);

-- Insert default sync configuration
INSERT INTO sync_configuration (key, value, description) VALUES
('sync_enabled', 'true', 'Enable/disable inventory synchronization'),
('sync_interval_minutes', '60', 'Interval in minutes for scheduled sync'),
('max_retry_attempts', '3', 'Maximum retry attempts for failed sync'),
('sync_batch_size', '50', 'Number of products to sync in each batch'),
('stock_tolerance', '1', 'Tolerance for stock differences'),
('auto_approve_threshold', '10', 'Auto-approve sync for differences below this threshold'),
('notification_email', '', 'Email for sync notifications'),
('slack_webhook', '', 'Slack webhook for notifications')
ON CONFLICT (key) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_mapping_odoo_sku ON product_mapping(odoo_sku);
CREATE INDEX IF NOT EXISTS idx_product_mapping_desty_code ON product_mapping(desty_external_code);
CREATE INDEX IF NOT EXISTS idx_product_mapping_shop_id ON product_mapping(desty_shop_id);
CREATE INDEX IF NOT EXISTS idx_product_mapping_active ON product_mapping(is_active);
CREATE INDEX IF NOT EXISTS idx_product_mapping_last_sync ON product_mapping(last_sync);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for product_mapping table
CREATE TRIGGER update_product_mapping_updated_at 
    BEFORE UPDATE ON product_mapping 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for sync_configuration table
CREATE TRIGGER update_sync_configuration_updated_at 
    BEFORE UPDATE ON sync_configuration 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- View for active mappings with latest sync status
CREATE OR REPLACE VIEW active_mappings_with_status AS
SELECT 
    pm.id,
    pm.odoo_product_id,
    pm.odoo_sku,
    pm.desty_item_id,
    pm.desty_external_code,
    pm.desty_shop_id,
    pm.desty_warehouse_id,
    pm.last_sync,
    pm.is_active,
    pm.created_at,
    pm.updated_at,
    COALESCE(latest_sync.status, 'never_synced') as latest_sync_status,
    latest_sync.sync_time as latest_sync_time,
    latest_sync.error_message as latest_error
FROM product_mapping pm
LEFT JOIN LATERAL (
    SELECT 
        sl.status,
        sl.sync_time,
        sl.error_message
    FROM inventory_sync_log sl
    WHERE sl.sku = pm.odoo_sku
    ORDER BY sl.sync_time DESC
    LIMIT 1
) latest_sync ON true
WHERE pm.is_active = TRUE;

-- View for sync statistics
CREATE OR REPLACE VIEW sync_statistics AS
SELECT 
    DATE_TRUNC('hour', sync_time) as hour,
    source,
    target,
    status,
    COUNT(*) as sync_count,
    AVG(CASE WHEN status = 'success' THEN 1 ELSE 0 END) * 100 as success_rate
FROM inventory_sync_log
WHERE sync_time >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', sync_time), source, target, status
ORDER BY hour DESC;

-- View for failed syncs
CREATE OR REPLACE VIEW failed_syncs AS
SELECT 
    sl.*,
    pm.odoo_sku,
    pm.desty_external_code,
    pm.desty_shop_id
FROM inventory_sync_log sl
LEFT JOIN product_mapping pm ON sl.sku = pm.odoo_sku
WHERE sl.status = 'failed'
AND sl.sync_time >= NOW() - INTERVAL '24 hours'
ORDER BY sl.sync_time DESC;

-- Function to clean up old sync logs
CREATE OR REPLACE FUNCTION cleanup_old_sync_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM inventory_sync_log
    WHERE sync_time < NOW() - INTERVAL '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get sync health status
CREATE OR REPLACE FUNCTION get_sync_health_status()
RETURNS TABLE(
    metric TEXT,
    value NUMERIC,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    -- Success rate in last 24 hours
    SELECT 
        'success_rate_24h'::TEXT,
        COALESCE(AVG(CASE WHEN status = 'success' THEN 1 ELSE 0 END) * 100, 0)::NUMERIC,
        CASE 
            WHEN AVG(CASE WHEN status = 'success' THEN 1 ELSE 0 END) * 100 >= 95 THEN 'good'
            WHEN AVG(CASE WHEN status = 'success' THEN 1 ELSE 0 END) * 100 >= 80 THEN 'warning'
            ELSE 'critical'
        END::TEXT
    FROM inventory_sync_log
    WHERE sync_time >= NOW() - INTERVAL '24 hours'
    
    UNION ALL
    
    -- Failed syncs in last 24 hours
    SELECT 
        'failed_syncs_24h'::TEXT,
        COUNT(*)::NUMERIC,
        CASE 
            WHEN COUNT(*) <= 10 THEN 'good'
            WHEN COUNT(*) <= 50 THEN 'warning'
            ELSE 'critical'
        END::TEXT
    FROM inventory_sync_log
    WHERE status = 'failed'
    AND sync_time >= NOW() - INTERVAL '24 hours'
    
    UNION ALL
    
    -- Active mappings count
    SELECT 
        'active_mappings'::TEXT,
        COUNT(*)::NUMERIC,
        CASE 
            WHEN COUNT(*) > 0 THEN 'good'
            ELSE 'warning'
        END::TEXT
    FROM product_mapping
    WHERE is_active = TRUE
    
    UNION ALL
    
    -- Mappings needing sync
    SELECT 
        'mappings_needing_sync'::TEXT,
        COUNT(*)::NUMERIC,
        CASE 
            WHEN COUNT(*) <= 10 THEN 'good'
            WHEN COUNT(*) <= 50 THEN 'warning'
            ELSE 'critical'
        END::TEXT
    FROM product_mapping
    WHERE is_active = TRUE
    AND (last_sync IS NULL OR last_sync < NOW() - INTERVAL '1 hour');
END;
$$ LANGUAGE plpgsql;

-- Sample data for testing (optional)
-- INSERT INTO product_mapping (odoo_product_id, odoo_sku, desty_item_id, desty_external_code, desty_shop_id)
-- VALUES 
-- (1234, 'TEST-SKU-001', 'desty-123', 'TEST-SKU-001', 'shop-001'),
-- (1235, 'TEST-SKU-002', 'desty-124', 'TEST-SKU-002', 'shop-001');

COMMIT;
