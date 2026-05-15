-- Manual: set a Purchase Requisition (PR) back to Draft.
-- Run in MySQL / MariaDB after choosing ONE targeting style below (uncomment the UPDATE you need).

-- ---------------------------------------------------------------------------
-- Option A — by PR primary key (id จาก URL /purchase-documents/{id})
-- ---------------------------------------------------------------------------
-- UPDATE purchase_documents
-- SET status = 'Draft'
-- WHERE document_type = 'PR'
--   AND id = 123;   -- <<< เปลี่ยนเป็น id จริง

-- ---------------------------------------------------------------------------
-- Option B — by PR document number
-- ---------------------------------------------------------------------------
-- UPDATE purchase_documents
-- SET status = 'Draft'
-- WHERE document_type = 'PR'
--   AND document_number = 'PR-202605-0012';   -- <<< เปลี่ยนเป็นเลข PR จริง

-- ---------------------------------------------------------------------------
-- Option C — PR ที่ยังเป็น Complete แต่ไม่มี PO ที่ยังไม่ Void อ้างอิงเลข PR นั้น
--    (ใช้เมื่อลบ PO แล้วแต่ PR ค้าง Complete; ตรวจด้วย SELECT ก่อนแล้วค่อย UPDATE)
-- ---------------------------------------------------------------------------
/*
UPDATE purchase_documents pd
SET pd.status = 'Draft'
WHERE pd.document_type = 'PR'
  AND pd.status = 'Complete'
  AND NOT EXISTS (
    SELECT 1
    FROM purchase_documents po
    WHERE po.document_type = 'PO'
      AND COALESCE(LOWER(po.status), '') <> 'void'
      AND (
        po.source_pr_id = pd.id
        OR po.reference_doc LIKE CONCAT('%', pd.document_number, '%')
      )
  );
*/

-- แนะนำ: รัน SELECT ตรวจก่อน UPDATE เสมอ
-- SELECT id, document_number, status, document_date
-- FROM purchase_documents
-- WHERE document_type = 'PR'
--   AND document_number = 'PR-202605-0012';
