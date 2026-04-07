-- Migration: ISO Section master (BB reference)
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS iso_sections (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL,
    name_th VARCHAR(255) NULL,
    name_en VARCHAR(255) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_iso_sections_code (code)
);

INSERT INTO iso_sections (code, name_th, name_en) VALUES
    ('QM', 'การจัดการคุณภาพ', 'Quality Management / ISO Center'),
    ('BD', 'พัฒนาธุรกิจ', 'Business Development'),
    ('IE', 'นำเข้าและส่งออก', 'Import and Export'),
    ('HR', 'บุคคล', 'Human Resources'),
    ('GA', 'ธุรการ', 'General Affair'),
    ('PU', 'จัดซื้อ', 'Purchase'),
    ('TR', 'ขนส่ง', 'Transportation'),
    ('FV', 'ศูนย์รถใหม่และงานซ่อมพ่นหลังส่งมอบ', 'Finish Vehicle'),
    ('IH', 'การซ่อมรถใหม่ภายในก่อนส่งมอบ', 'In House'),
    ('AF', 'ศูนย์กระจายอะไหล่', 'After Sale'),
    ('IT', 'เทคโนโลยีสารสนเทศ', 'Information Technology'),
    ('MT', 'ซ่อมบำรุง', 'Maintenance'),
    ('ST', 'ความปลอดภัย', 'Safety'),
    ('QC', 'ควบคุมปฏิบัติการ', 'Operation Control')
ON DUPLICATE KEY UPDATE
    name_th = VALUES(name_th),
    name_en = VALUES(name_en);
