-- Link delivery_addresses to departments for default Ship To (per PR creator department).
-- Run once before deploying code that reads/writes delivery_addresses.department_id.

ALTER TABLE delivery_addresses
	ADD COLUMN department_id INT UNSIGNED NULL
		COMMENT 'Optional: department this site belongs to; used for default Ship To selection'
		AFTER contact_phone;
