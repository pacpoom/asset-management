-- ============================================================
-- Migration: เพิ่มตาราง advance_transaction_items
-- รองรับการเลือก Product หลายรายการต่อ 1 Transaction
-- วันที่: 2026-05-21
-- ============================================================

CREATE TABLE IF NOT EXISTS `advance_transaction_items` (
  `id`                       int          NOT NULL AUTO_INCREMENT,
  `advance_transaction_id`   int          NOT NULL                   COMMENT 'อ้างอิง advance_transactions.id',
  `product_id`               int UNSIGNED DEFAULT NULL               COMMENT 'อ้างอิง products.id (nullable เผื่อลบ product ในอนาคต)',
  `product_name`             varchar(255) NOT NULL                   COMMENT 'snapshot ชื่อสินค้า ณ เวลาบันทึก',
  `description`              varchar(500) DEFAULT NULL               COMMENT 'snapshot description ของสินค้า',
  `qty`                      decimal(15,4) NOT NULL DEFAULT 1.0000   COMMENT 'จำนวน',
  `price`                    decimal(15,4) NOT NULL DEFAULT 0.0000   COMMENT 'ราคาต่อหน่วย (บาท)',
  `amount`                   decimal(15,2) NOT NULL DEFAULT 0.00     COMMENT 'qty × price',
  `created_at`               timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_adv_txn_item_txn` (`advance_transaction_id`),
  KEY `idx_adv_txn_item_product` (`product_id`),
  CONSTRAINT `fk_adv_txn_item_txn`
    FOREIGN KEY (`advance_transaction_id`)
    REFERENCES `advance_transactions` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='รายการสินค้า/บริการต่อ Advance Transaction';
