CREATE TABLE IF NOT EXISTS document_running_masters (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    doc_type VARCHAR(50) NOT NULL COMMENT 'AA เช่น QP, WI, FM',
    department_code VARCHAR(50) NOT NULL COMMENT 'BB เช่น IT, HR, QA',
    last_running_no INT NOT NULL DEFAULT 0 COMMENT 'เลขล่าสุดของชุด AA-BB',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_document_running_master (doc_type, department_code),
    KEY idx_document_running_master_dept (department_code),
    KEY idx_document_running_master_type (doc_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Master running number per document type (AA) and department code (BB)';
