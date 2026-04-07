-- DAR tables. FK ไป document_master_list อยู่ใน isodocs_dar_fk_document_master.sql
-- (รันหลัง document_master_list.sql เพื่อหลีกเลี่ยง error 1824)

CREATE TABLE IF NOT EXISTS dar_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dar_no VARCHAR(50) NOT NULL UNIQUE,
    request_type ENUM('new_document', 'revise_document', 'cancel_document', 'request_copy') NOT NULL,
    document_type_scope JSON NULL COMMENT 'Selected document categories e.g. QM,QP,WI',
    requester_user_id BIGINT UNSIGNED NULL,
    requester_name VARCHAR(255) NULL,
    requester_position VARCHAR(255) NULL,
    requester_department VARCHAR(255) NULL,
    request_date DATE NOT NULL,
    remark TEXT NULL,
    reviewer_comment TEXT NULL,
    reviewer_approve TINYINT(1) NULL,
    reviewer_name VARCHAR(255) NULL,
    reviewer_position VARCHAR(255) NULL,
    reviewer_date DATETIME NULL,
    approver_comment TEXT NULL,
    approver_approve TINYINT(1) NULL,
    approver_name VARCHAR(255) NULL,
    approver_position VARCHAR(255) NULL,
    approver_date DATETIME NULL,
    document_controller_comment TEXT NULL,
    register_name VARCHAR(255) NULL,
    register_position VARCHAR(255) NULL,
    register_date DATETIME NULL,
    status ENUM('submitted', 'reviewed', 'approved', 'rejected', 'registered') NOT NULL DEFAULT 'submitted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    KEY idx_dar_requests_date (request_date),
    KEY idx_dar_requests_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Document Action Request (DAR) header';

CREATE TABLE IF NOT EXISTS dar_request_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dar_request_id BIGINT UNSIGNED NOT NULL,
    line_no INT NOT NULL,
    document_master_id BIGINT UNSIGNED NULL,
    document_code VARCHAR(100) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    revision VARCHAR(10) NOT NULL,
    effective_date DATE NULL,
    request_reason VARCHAR(500) NULL,
    copies_requested INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    KEY idx_dar_request_items_request (dar_request_id),
    KEY idx_dar_request_items_doc_code (document_code),
    CONSTRAINT fk_dar_request_items_request FOREIGN KEY (dar_request_id)
        REFERENCES dar_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Document rows in DAR';

CREATE TABLE IF NOT EXISTS dar_request_item_attachments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dar_request_item_id BIGINT UNSIGNED NOT NULL,
    file_original_name VARCHAR(255) NOT NULL,
    file_system_name VARCHAR(255) NOT NULL,
    file_mime_type VARCHAR(150) NULL,
    file_size_bytes BIGINT NULL,
    uploaded_by_user_id BIGINT UNSIGNED NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    KEY idx_dar_item_attachments_item (dar_request_item_id),
    CONSTRAINT fk_dar_item_attachments_item FOREIGN KEY (dar_request_item_id)
        REFERENCES dar_request_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='File attachments per DAR item';
