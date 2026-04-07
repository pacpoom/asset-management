-- Reference masters for Document Code Generator page (AA = document type, BB = department/process code).
-- Run once on the same database as the app.

CREATE TABLE IF NOT EXISTS document_aa_types (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	code VARCHAR(50) NOT NULL COMMENT 'AA e.g. QM, QP',
	name_th VARCHAR(200) NOT NULL,
	name_en VARCHAR(200) NOT NULL,
	format VARCHAR(150) NOT NULL COMMENT 'e.g. AA(QP)-BB-GG',
	display_order INT NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_document_aa_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_bb_processes (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	code VARCHAR(50) NOT NULL COMMENT 'BB e.g. HR, IT',
	name_th VARCHAR(200) NOT NULL,
	name_en VARCHAR(200) NOT NULL,
	display_order INT NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_document_bb_processes_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO document_aa_types (code, name_th, name_en, format, display_order) VALUES
	('QM', 'คู่มือคุณภาพ', 'Quality Manual', 'AA(QM)-GG', 1),
	('QP', 'ระเบียบปฏิบัติ', 'Quality Procedures', 'AA(QP)-BB-GG', 2),
	('WI', 'วิธีปฏิบัติงาน', 'Work Instruction', 'AA(WI)-BB-CC-GG', 3),
	('STD', 'มาตรฐานการทำงาน', 'Standardized Work', 'AA(STD)-BB-CC-EE-FF-GG', 4),
	('EIS', 'เอกสาร Instruction Sheet', 'Element Instruction Sheet', 'AA(EIS)-BB-CC-EE-FF-GG', 5),
	('FM', 'แบบฟอร์ม', 'Form', 'AA(FM)-BB-CC-GG', 6),
	('SD', 'เอกสารสนับสนุน', 'Support Document', 'AA(SD)-BB-GG', 7),
	('ED', 'เอกสารภายนอก', 'External Document', 'AA(ED)-BB-GG', 8)
ON DUPLICATE KEY UPDATE
	name_th = VALUES(name_th),
	name_en = VALUES(name_en),
	format = VALUES(format),
	display_order = VALUES(display_order);

INSERT INTO document_bb_processes (code, name_th, name_en, display_order) VALUES
	('QM', 'การจัดการคุณภาพ', 'Quality Management / ISO Center', 1),
	('BD', 'พัฒนาธุรกิจ', 'Business Development', 2),
	('IE', 'นำเข้าและส่งออก', 'Import and Export', 3),
	('HR', 'บุคคล', 'Human Resources', 4),
	('GA', 'ธุรการ', 'General Affair', 5),
	('PU', 'จัดซื้อ', 'Purchase', 6),
	('TR', 'ขนส่ง', 'Transportation', 7),
	('FV', 'ศูนย์รถใหม่และงานซ่อมหลังส่งมอบ', 'Finish Vehicle', 8),
	('IH', 'การซ่อมรถใหม่ภายในก่อนส่งมอบ', 'In House', 9),
	('AF', 'ศูนย์กระจายอะไหล่', 'After Sale', 10),
	('IT', 'เทคโนโลยีสารสนเทศ', 'Information Technology', 11),
	('MT', 'ซ่อมบำรุง', 'Maintenance', 12),
	('ST', 'ความปลอดภัย', 'Safety', 13),
	('QC', 'ควบคุมปฏิบัติการ', 'Operation Control', 14)
ON DUPLICATE KEY UPDATE
	name_th = VALUES(name_th),
	name_en = VALUES(name_en),
	display_order = VALUES(display_order);

-- CC / EE / FF / GG: optional reference rows (ลำดับเอกสาร, พื้นที่ทำงาน, ลำดับกระบวนการ, เลข running/คำอธิบาย)
CREATE TABLE IF NOT EXISTS document_cc_reference (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	code VARCHAR(50) NOT NULL,
	name_th VARCHAR(200) NOT NULL,
	name_en VARCHAR(200) NOT NULL,
	display_order INT NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_document_cc_reference_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_ee_reference (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	code VARCHAR(50) NOT NULL,
	name_th VARCHAR(200) NOT NULL,
	name_en VARCHAR(200) NOT NULL,
	display_order INT NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_document_ee_reference_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_ff_reference (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	code VARCHAR(50) NOT NULL,
	name_th VARCHAR(200) NOT NULL,
	name_en VARCHAR(200) NOT NULL,
	display_order INT NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_document_ff_reference_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_gg_reference (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	code VARCHAR(50) NOT NULL,
	name_th VARCHAR(200) NOT NULL,
	name_en VARCHAR(200) NOT NULL,
	display_order INT NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_document_gg_reference_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- เลขรันล่าสุดต่อ segment (CC / EE / FF) ต่อคู่ AA + BB (เก็บค่าล่าสุดเท่านั้น; ค่าเริ่ม 0 = แสดง 00)
CREATE TABLE IF NOT EXISTS document_iso_segment_running (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	segment ENUM('cc', 'ee', 'ff') NOT NULL,
	doc_type VARCHAR(50) NOT NULL COMMENT 'AA',
	department_code VARCHAR(50) NOT NULL COMMENT 'BB',
	last_running_no INT NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_iso_segment_running (segment, doc_type, department_code),
	KEY idx_iso_seg_run_bb (department_code),
	KEY idx_iso_seg_run_aa (doc_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Latest running counter per CC/EE/FF segment for AA×BB';
