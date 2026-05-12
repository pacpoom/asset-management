-- Stock movement history for products
-- Records every change to products.quantity_on_hand with reason + actor

CREATE TABLE IF NOT EXISTS product_stock_movements (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id INT UNSIGNED NOT NULL,
    movement_type ENUM(
        'adjustment',     -- manual stock adjustment
        'purchase',       -- received from purchase order
        'sale',           -- sold via sales doc
        'return_in',      -- customer return
        'return_out',     -- return to vendor
        'transfer_in',    -- transferred in (warehouse)
        'transfer_out',   -- transferred out (warehouse)
        'opening',        -- opening balance
        'count',          -- physical count correction
        'other'
    ) NOT NULL DEFAULT 'adjustment',
    qty_change DECIMAL(18,4) NOT NULL,           -- positive: in, negative: out
    qty_before DECIMAL(18,4) NOT NULL DEFAULT 0,
    qty_after  DECIMAL(18,4) NOT NULL DEFAULT 0,
    reference_type VARCHAR(64) NULL,             -- e.g. 'purchase_order', 'sales_document'
    reference_id BIGINT UNSIGNED NULL,           -- id in reference table
    notes TEXT NULL,
    user_id BIGINT UNSIGNED NULL,                -- who recorded it (matches users.id)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_psm_product (product_id),
    KEY idx_psm_type (movement_type),
    KEY idx_psm_created (created_at),
    CONSTRAINT fk_psm_product FOREIGN KEY (product_id)
        REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_psm_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
