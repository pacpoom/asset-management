-- Migration: สร้างตาราง job_containers สำหรับเก็บข้อมูลตู้คอนเทนเนอร์ของแต่ละ Job
CREATE TABLE IF NOT EXISTS `job_containers` (
  `id`               INT            NOT NULL AUTO_INCREMENT,
  `job_order_id`     INT            NOT NULL,
  `container_size`   ENUM('20','40') NOT NULL,
  `container_number` VARCHAR(20)    NULL DEFAULT NULL COMMENT 'เบอร์ตู้ เช่น ABCU1234567',
  `seal_number`      VARCHAR(50)    NULL DEFAULT NULL COMMENT 'เบอร์ซีล',
  `remarks`          VARCHAR(255)   NULL DEFAULT NULL,
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_containers_job_order_id` (`job_order_id`),
  CONSTRAINT `fk_job_containers_job_order`
    FOREIGN KEY (`job_order_id`) REFERENCES `job_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
