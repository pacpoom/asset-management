-- Advance Expense System Tables
-- advance_applications ถูกสร้างไว้แล้ว, เพิ่ม advance_transactions

CREATE TABLE IF NOT EXISTS `advance_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `advance_application_id` int NOT NULL COMMENT 'อ้างอิง advance_applications.id',
  `job_order_id` bigint DEFAULT NULL COMMENT 'อ้างอิง job_orders.id',
  `transaction_date` date NOT NULL COMMENT 'วันที่ใช้จ่าย',
  `description` varchar(500) DEFAULT NULL COMMENT 'รายละเอียดค่าใช้จ่าย',
  `amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'จำนวนเงิน (บวก=เบิก, ลบ=คืน)',
  `type` enum('expense','refund') NOT NULL DEFAULT 'expense' COMMENT 'expense=ใช้จ่าย, refund=คืนเงิน',
  `invoice_image` varchar(500) DEFAULT NULL COMMENT 'path รูปใบ Invoice',
  `slip_image` varchar(500) DEFAULT NULL COMMENT 'path รูปสลิปโอนเงิน',
  `remark` text COMMENT 'หมายเหตุ',
  `created_by` int DEFAULT NULL COMMENT 'รหัสผู้บันทึก (null = จากมือถือ)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_advance_txn_app` (`advance_application_id`),
  KEY `idx_advance_txn_job` (`job_order_id`),
  CONSTRAINT `fk_advance_txn_app` FOREIGN KEY (`advance_application_id`) REFERENCES `advance_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ตาราง Transaction ค่าใช้จ่ายเงินทดรองจ่าย';

-- เพิ่ม index สำหรับ advance_applications ถ้ายังไม่มี
ALTER TABLE `advance_applications`
  MODIFY COLUMN `status` enum('Pending','Approved','Rejected','Completed') NOT NULL DEFAULT 'Pending';
