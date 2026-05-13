-- Fix: "Data truncated for column 'status' at row 1" when creating PO from PR
-- (app sets PR to status 'Complete' after insert; ENUM/VARCHAR on DB may be too strict.)
--
-- Run once on the target database (backup recommended).
-- Then retry creating the PO.

ALTER TABLE purchase_documents
	MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'Draft';
