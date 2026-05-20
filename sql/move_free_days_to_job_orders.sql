-- ย้าย Free Days จาก job_containers → job_orders (ระดับงาน ไม่ใช่ระดับตู้)
-- รันใน DBeaver / MySQL ก่อน deploy โค้ดใหม่

-- 1) เพิ่มคอลัมน์บน job_orders — แนะนำรัน: node migrations/move_free_days_to_job_orders.cjs
-- (สคริปต์ตรวจว่ามีคอลัมน์แล้วหรือยังก่อน ADD)

-- 2) คัดลอกจาก job_containers (ค่าต่อ job — ใช้ MAX กรณีหลายตู้ค่าเดียวกัน)
UPDATE job_orders j
INNER JOIN (
  SELECT job_order_id,
         MAX(storage_days)   AS storage_days,
         MAX(demurrage_days) AS demurrage_days,
         MAX(detention_days) AS detention_days
  FROM job_containers
  WHERE storage_days IS NOT NULL
     OR demurrage_days IS NOT NULL
     OR detention_days IS NOT NULL
  GROUP BY job_order_id
) jc ON jc.job_order_id = j.id
SET j.storage_days   = COALESCE(j.storage_days,   jc.storage_days),
    j.demurrage_days = COALESCE(j.demurrage_days, jc.demurrage_days),
    j.detention_days = COALESCE(j.detention_days, jc.detention_days);

-- 3) เติมจาก vessel_master ถ้ายังว่างและมี vessel_master_id
UPDATE job_orders j
INNER JOIN vessel_master vm ON j.vessel_master_id = vm.id
SET j.storage_days   = COALESCE(j.storage_days,   vm.storage_days),
    j.demurrage_days = COALESCE(j.demurrage_days, vm.demurrage_days),
    j.detention_days = COALESCE(j.detention_days, vm.detention_days)
WHERE j.vessel_master_id IS NOT NULL;

-- 4) ลบคอลัมน์ออกจาก job_containers
ALTER TABLE job_containers
  DROP COLUMN storage_days,
  DROP COLUMN demurrage_days,
  DROP COLUMN detention_days;
