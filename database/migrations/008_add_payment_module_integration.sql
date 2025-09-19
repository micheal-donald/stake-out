-- Migration: Add Payment Module Integration Support
-- Description: Creates tables and indices to support integration with the standalone payment module
-- Author: StakeOut Development Team
-- Date: 2024-12-18

-- Create legacy payment mapping table for backward compatibility
CREATE TABLE IF NOT EXISTS legacy_payment_mapping (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    checkout_request_id VARCHAR(255) NOT NULL UNIQUE,
    payment_module_transaction_id VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    callback_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indices for better query performance
CREATE INDEX IF NOT EXISTS idx_legacy_payment_mapping_user_id
ON legacy_payment_mapping(user_id);

CREATE INDEX IF NOT EXISTS idx_legacy_payment_mapping_checkout_request
ON legacy_payment_mapping(checkout_request_id);

CREATE INDEX IF NOT EXISTS idx_legacy_payment_mapping_payment_module_transaction
ON legacy_payment_mapping(payment_module_transaction_id);

CREATE INDEX IF NOT EXISTS idx_legacy_payment_mapping_created_at
ON legacy_payment_mapping(created_at);

-- Create payment module configuration table
CREATE TABLE IF NOT EXISTS payment_module_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default configuration values
INSERT INTO payment_module_config (config_key, config_value, description) VALUES
('payment_module_enabled', 'true', 'Enable standalone payment module integration'),
('payment_module_url', 'http://localhost:3001', 'Payment module base URL'),
('fallback_to_legacy', 'true', 'Fall back to legacy M-Pesa service if payment module is unavailable'),
('payment_module_timeout', '30000', 'Request timeout for payment module in milliseconds'),
('payment_module_retries', '3', 'Number of retries for failed payment module requests')
ON CONFLICT (config_key) DO NOTHING;

-- Create payment service health monitoring table
CREATE TABLE IF NOT EXISTS payment_service_health (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'healthy', 'unhealthy', 'unknown'
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for health monitoring
CREATE INDEX IF NOT EXISTS idx_payment_service_health_service_name
ON payment_service_health(service_name);

CREATE INDEX IF NOT EXISTS idx_payment_service_health_checked_at
ON payment_service_health(checked_at);

-- Create updated_at trigger for legacy_payment_mapping
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to legacy_payment_mapping table
DROP TRIGGER IF EXISTS update_legacy_payment_mapping_updated_at ON legacy_payment_mapping;
CREATE TRIGGER update_legacy_payment_mapping_updated_at
    BEFORE UPDATE ON legacy_payment_mapping
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to payment_module_config table
DROP TRIGGER IF EXISTS update_payment_module_config_updated_at ON payment_module_config;
CREATE TRIGGER update_payment_module_config_updated_at
    BEFORE UPDATE ON payment_module_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add constraints for data integrity
ALTER TABLE legacy_payment_mapping
ADD CONSTRAINT chk_legacy_payment_mapping_amount_positive
CHECK (amount > 0);

ALTER TABLE legacy_payment_mapping
ADD CONSTRAINT chk_legacy_payment_mapping_phone_format
CHECK (phone_number ~ '^(\+254|254|0)[0-9]{9}$');

-- Add comments for documentation
COMMENT ON TABLE legacy_payment_mapping IS 'Maps legacy M-Pesa transactions to payment module transactions for backward compatibility';
COMMENT ON TABLE payment_module_config IS 'Configuration settings for payment module integration';
COMMENT ON TABLE payment_service_health IS 'Health monitoring data for payment services';

COMMENT ON COLUMN legacy_payment_mapping.checkout_request_id IS 'M-Pesa checkout request ID from legacy system';
COMMENT ON COLUMN legacy_payment_mapping.payment_module_transaction_id IS 'Transaction ID from standalone payment module';
COMMENT ON COLUMN legacy_payment_mapping.callback_data IS 'Raw M-Pesa callback data in JSON format';

-- Create view for payment service status
CREATE OR REPLACE VIEW payment_service_status AS
SELECT
    service_name,
    status,
    response_time_ms,
    error_message,
    checked_at,
    ROW_NUMBER() OVER (PARTITION BY service_name ORDER BY checked_at DESC) as rn
FROM payment_service_health;

-- Create view for recent payment service health (last check per service)
CREATE OR REPLACE VIEW recent_payment_service_health AS
SELECT
    service_name,
    status,
    response_time_ms,
    error_message,
    checked_at
FROM payment_service_status
WHERE rn = 1;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON legacy_payment_mapping TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON payment_module_config TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON payment_service_health TO your_app_user;
-- GRANT SELECT ON payment_service_status TO your_app_user;
-- GRANT SELECT ON recent_payment_service_health TO your_app_user;

-- Log migration completion
-- INSERT INTO migrations (filename, applied_at)
-- VALUES ('008_add_payment_module_integration.sql', CURRENT_TIMESTAMP)
-- ON CONFLICT (filename) DO UPDATE SET applied_at = CURRENT_TIMESTAMP;

-- ROLLBACK:
-- Remove payment module integration support

-- Drop views
DROP VIEW IF EXISTS recent_payment_service_health;
DROP VIEW IF EXISTS payment_service_status;

-- Drop triggers
DROP TRIGGER IF EXISTS update_payment_module_config_updated_at ON payment_module_config;
DROP TRIGGER IF EXISTS update_legacy_payment_mapping_updated_at ON legacy_payment_mapping;

-- Drop function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop tables (in reverse order of creation due to dependencies)
DROP TABLE IF EXISTS payment_service_health;
DROP TABLE IF EXISTS payment_module_config;
DROP TABLE IF EXISTS legacy_payment_mapping;