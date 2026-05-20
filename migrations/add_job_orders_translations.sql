-- =============================================================
-- Migration: Add missing translation keys for freight-forwarder
--            job_orders pages (list, detail, dashboard)
-- Run with:  mysql -u root -p bizcore < this_file.sql
-- =============================================================

SET NAMES utf8mb4;

-- ── Group 1: Missing $t() keys used in job-orders LIST page ──
INSERT IGNORE INTO `system_translations` (`translation_key`, `en_text`, `th_text`) VALUES
('Manage Freight Forwarder Jobs',               'Manage Freight Forwarder Jobs',              'จัดการรายการงานขนส่ง'),
('Search Job, Customer, Vendor...',             'Search Job, Customer, Vendor...',            'ค้นหา Job, ลูกค้า, Vendor...'),
('Export',                                      'Export',                                     'ส่งออก'),
('New Job',                                     'New Job',                                    'สร้างงานใหม่'),
('New',                                         'New',                                        'ใหม่'),
('Job No. / Date',                              'Job No. / Date',                             'เลขที่งาน / วันที่'),
('Type / Service',                              'Type / Service',                             'ประเภท / บริการ'),
('Customer / Vendor',                           'Customer / Vendor',                          'ลูกค้า / Vendor'),
('Action',                                      'Action',                                     'การดำเนินการ'),
('Created By',                                  'Created By',                                 'สร้างโดย'),
('Not specified',                               'Not specified',                              'ไม่ระบุ'),
('to',                                          'to',                                         'ถึง'),
('of',                                          'of',                                         'จาก'),
('No Job Orders found or search did not match any data',
                                                'No Job Orders found',                        'ไม่พบรายการ Job Order หรือข้อมูลไม่ตรงกับเงื่อนไขการค้นหา'),
('Are you sure you want to delete job',         'Are you sure you want to delete job',        'คุณแน่ใจหรือไม่ว่าต้องการลบใบงาน'),
('This action',                                 'This action',                                'การดำเนินการนี้'),
('cannot be undone',                            'cannot be undone',                           'ไม่สามารถย้อนกลับได้'),
('Deleting...',                                 'Deleting...',                                'กำลังลบ...');

-- ── Group 2: Static bilingual in container alert section ──
INSERT IGNORE INTO `system_translations` (`translation_key`, `en_text`, `th_text`) VALUES
('Container Alert Header',  'Alert: Containers pending checkout near free time expiry', 'แจ้งเตือน: ตู้ที่ยังไม่ Checkout และใกล้หมด Free Time'),
('Due today!',              'Due today!',       'ครบวันนี้!'),
('Container Pending Label', 'Pending:',         'ตู้รอออก:'),
('Container Pending Short', 'Pending',          'ตู้รอออก'),
('Container Unit',          'unit(s)',           'ตู้'),
('ETA today',               'ETA today',        'ETA วันนี้'),
('items',                   'items',             'รายการ'),
('DUE TODAY',               'DUE TODAY',        'ครบวันนี้'),
('Pending Checkout Header', 'Pending Checkout', 'ตู้รอ Checkout'),
('Expiring',                'Expiring',         'หมดอายุ');

-- ── Group 3: Freight-forwarder semantic label keys ──
--   ff.day     — day abbreviation; EN='d' (no space), TH=' วัน' (leading space)
--   ff.day_compact — compact chip variant; TH='วัน' (no leading space)
INSERT IGNORE INTO `system_translations` (`translation_key`, `en_text`, `th_text`) VALUES
('ff.overdue_label',  'Overdue',                   'เกิน'),
('ff.day',            'd',                          ' วัน'),
('ff.day_compact',    'd',                          'วัน'),
('ff.demurrage_label','Demurrage',                  'ค่าภาระท่า (Demurrage)'),
('ff.storage_label',  'Storage',                    'ค่าฝากตู้ (Storage)'),
('ff.detention_label','Detention',                  'ค่าเช่าตู้ (Detention)'),
('ff.demurrage_short','Demurrage',                  'ภาระท่า'),
('ff.storage_short',  'Storage',                    'ฝากตู้'),
('ff.detention_short','Detention',                  'เช่าตู้');

-- ── Group 4: Detail page & checkout modal static labels ──
INSERT IGNORE INTO `system_translations` (`translation_key`, `en_text`, `th_text`) VALUES
('Confirm Checkout',     'Confirm Checkout',                                          'ยืนยัน Checkout'),
('Checkout Record Hint', 'click "Container List" to record checkout date',            'กดปุ่ม "รายการตู้" เพื่อบันทึกวันออกตู้'),
('Container List →',     'Container List →',                                          'รายการตู้ →'),
('Back to Job Orders',   'Back to Job Orders',                                        'กลับหน้ารายการ Job Orders'),
('Back',                 'Back',                                                      'กลับ'),
('Job Order',            'Job Order',                                                 'ใบสั่งงาน'),
('Ref Invoice',          'Ref Invoice',                                               'เลขที่ใบแจ้งหนี้'),
('Today!',               'Today!',                                                    'วันนี้!');
