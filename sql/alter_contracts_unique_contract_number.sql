-- เพิ่ม UNIQUE constraint บน contract_number เพื่อป้องกันเลขที่สัญญาซ้ำ
-- หมายเหตุ: ก่อนรัน ควรตรวจสอบว่าไม่มีข้อมูลซ้ำในฐานข้อมูลก่อน
-- ใช้คำสั่งนี้ตรวจสอบ:
--   SELECT contract_number, COUNT(*) as cnt FROM contracts WHERE contract_number IS NOT NULL GROUP BY contract_number HAVING cnt > 1;

ALTER TABLE contracts
ADD UNIQUE INDEX uq_contracts_contract_number (contract_number);
