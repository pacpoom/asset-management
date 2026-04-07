-- Optional file per document master row (run on existing DBs)
ALTER TABLE document_master_list
ADD COLUMN attached_file_original_name VARCHAR(255) NULL COMMENT 'Original filename' AFTER description,
ADD COLUMN attached_file_system_name VARCHAR(255) NULL COMMENT 'Stored under uploads/isodocs/document-master' AFTER attached_file_original_name;
