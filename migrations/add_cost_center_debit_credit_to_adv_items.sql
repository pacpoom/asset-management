-- Migration: เพิ่ม cost_center_code และ debit_credit ใน advance_transaction_items
-- วันที่: 2026-05-22

ALTER TABLE `advance_transaction_items`
  ADD COLUMN `cost_center_code` VARCHAR(50) NULL DEFAULT NULL COMMENT 'Cost center code' AFTER `amount`,
  ADD COLUMN `debit_credit` ENUM('Debit','Credit') NOT NULL DEFAULT 'Debit' COMMENT 'Debit or Credit entry' AFTER `cost_center_code`;
