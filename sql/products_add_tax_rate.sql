-- Add tax_rate column to products table (percentage, e.g. 7.00 = 7% VAT)
-- Note: MySQL 8 doesn't support `ADD COLUMN IF NOT EXISTS`; the migration
-- runner treats ER_DUP_FIELDNAME / ER_DUP_KEYNAME as "already applied".

ALTER TABLE products
    ADD COLUMN tax_rate DECIMAL(6,3) NULL DEFAULT NULL
    AFTER selling_price;

ALTER TABLE products
    ADD COLUMN barcode VARCHAR(64) NULL DEFAULT NULL
    AFTER sku;

CREATE INDEX idx_products_barcode ON products (barcode);
CREATE INDEX idx_products_is_active ON products (is_active);
CREATE INDEX idx_products_category_id ON products (category_id);
CREATE INDEX idx_products_product_type ON products (product_type);
