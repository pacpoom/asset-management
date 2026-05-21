-- ============================================================
-- Migration: เพิ่ม Translation Keys สำหรับ Product Line Items
-- ใน Add Transaction modal (advance-expense)
-- วันที่: 2026-05-21
-- ============================================================

INSERT INTO `system_translations` (`id`, `translation_key`, `en_text`, `th_text`) VALUES
(3106, 'adv.items_label',      'Product / Service Items',                    'รายการสินค้า / บริการ'),
(3107, 'adv.add_item',         'Add Item',                                   'เพิ่มรายการ'),
(3108, 'adv.search_product',   'Search product / service...',                'ค้นหาสินค้า / บริการ...'),
(3109, 'adv.no_products',      'No products found',                          'ไม่พบสินค้า'),
(3110, 'adv.item_qty',         'Qty',                                        'จำนวน'),
(3111, 'adv.item_price',       'Price / Unit',                               'ราคา / หน่วย'),
(3112, 'adv.item_total',       'Total (฿)',                                  'รวม (฿)'),
(3113, 'adv.items_grand_total','Grand Total',                                'ยอดรวมทั้งหมด'),
(3114, 'adv.no_items_hint',    'Click \"Add Item\" to add products/services','กดปุ่ม "เพิ่มรายการ" เพื่อเพิ่มสินค้า/บริการ'),
(3115, 'adv.remove_item',      'Remove item',                                'ลบรายการ')
ON DUPLICATE KEY UPDATE
  en_text = VALUES(en_text),
  th_text = VALUES(th_text);
