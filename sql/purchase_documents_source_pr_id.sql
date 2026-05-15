-- PO → BizCore PR mapping (ไม่พึ่ง OA ใน reference_doc)
-- รันครั้งเดียวบน MySQL/MariaDB

ALTER TABLE purchase_documents
	ADD COLUMN source_pr_id INT NULL DEFAULT NULL
		COMMENT 'purchase_documents.id ของ PR ใน BizCore ที่ PO นี้ออกจาก PR นั้น'
		AFTER reference_doc;

CREATE INDEX idx_purchase_documents_source_pr_id ON purchase_documents (source_pr_id);

-- ถ้าต้องการ FK (เลือกใช้ได้ — ลบ PR ที่ยังมี PO อ้างจะถูกบล็อกหรือต้อง SET NULL ก่อน)
-- ALTER TABLE purchase_documents
--   ADD CONSTRAINT fk_purchase_documents_source_pr
--   FOREIGN KEY (source_pr_id) REFERENCES purchase_documents (id)
--   ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill ตัวอย่าง (แก้เลขเอกสารให้ตรงกับระบบจริง — PO เก่าที่ยังไม่มี source_pr_id)
-- ---------------------------------------------------------------------------
-- UPDATE purchase_documents po
-- SET po.source_pr_id = (
--   SELECT id FROM purchase_documents pr
--   WHERE pr.document_type = 'PR' AND pr.document_number = 'PR-202605-0012'
--   LIMIT 1
-- )
-- WHERE po.document_type = 'PO' AND po.document_number = 'PO-202605-0028';
