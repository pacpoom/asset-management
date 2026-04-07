-- Add 'inactive' to document_master_list.status (run once on existing databases)
ALTER TABLE document_master_list
MODIFY COLUMN status ENUM('active', 'inactive', 'draft', 'obsolete', 'superseded') NOT NULL DEFAULT 'active';
