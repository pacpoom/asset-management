CREATE TABLE IF NOT EXISTS document_master_list (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    doc_code VARCHAR(100) NOT NULL COMMENT 'Document code e.g. QP-IT-01',
    doc_name VARCHAR(255) NOT NULL COMMENT 'Document name',
    doc_type VARCHAR(50) NOT NULL COMMENT 'Document type: QM, QP, WI, STD, EIS, FM, SD, ED',
    department_id INT UNSIGNED NOT NULL COMMENT 'Department/Section ID',
    current_revision VARCHAR(10) NOT NULL DEFAULT '00' COMMENT 'Current revision e.g. 00, 01, 02',
    effective_date DATE NOT NULL COMMENT 'Effective date',
    status ENUM('active', 'inactive', 'draft', 'obsolete', 'superseded') NOT NULL DEFAULT 'active',
    description TEXT COMMENT 'Document description',
    attached_file_original_name VARCHAR(255) NULL COMMENT 'Original filename',
    attached_file_system_name VARCHAR(255) NULL COMMENT 'Stored under uploads/isodocs/document-master',
    created_by BIGINT UNSIGNED COMMENT 'Created by user ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_doc_code (doc_code),
    UNIQUE KEY uq_doc_code_revision (doc_code, current_revision),
    INDEX idx_department (department_id),
    INDEX idx_doc_type (doc_type),
    INDEX idx_status (status),
    
    CONSTRAINT fk_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Master list of ISO documents';

INSERT IGNORE INTO document_master_list (doc_code, doc_name, doc_type, department_id, current_revision, effective_date, status, description)
VALUES
('QP-IT-01', 'IT Security', 'QP', 11, '04', '2025-05-01', 'active', 'Quality procedure for IT Security'),
('QP-IT-02', 'IT Data backup', 'QP', 11, '01', '2025-05-31', 'active', 'Quality procedure for data backup'),
('WI-IT-01-01', 'System Access Control', 'WI', 11, '01', '2025-04-15', 'active', 'Work instruction for system access'),
('STD-IT-01-01-01-01', 'Server Maintenance', 'STD', 11, '00', '2025-03-01', 'active', 'Standardized work for server maintenance'),
('FM-IT-01-01', 'IT Request Form', 'FM', 11, '02', '2025-04-20', 'active', 'Form for IT requests'),
('QP-HR-01', 'HR Policy', 'QP', 4, '02', '2025-03-15', 'active', 'Quality procedure for HR'),
('QP-QM-01', 'Quality Management', 'QP', 1, '03', '2025-05-10', 'active', 'Quality procedure for QM'),
('FM-GA-01-02', 'General Approval Form', 'FM', 5, '01', '2025-02-01', 'active', 'General approval form');
