const mysql = require('../node_modules/mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.111.57', port: 3306, user: 'root', password: 'Anji@12345', database: 'bizcore'
  });

  try {
    // ===== 1. SYNC MENUS =====
    console.log('=== Syncing Menus ===');

    // Remove the incorrectly inserted menu (wrong id auto-assigned) and insert the correct ones from menus.sql
    // First check what exists
    const [existing] = await conn.execute("SELECT id, title, route FROM menus WHERE route = '/advance-expense' OR title = 'Advance Expense'");
    console.log('Existing Advance Expense menus:', existing.map(m => `id=${m.id} ${m.title} ${m.route}`).join(', '));

    // Delete any existing Advance Expense menu entries to re-insert cleanly
    for (const m of existing) {
      await conn.execute('DELETE FROM menus WHERE id = ?', [m.id]);
      console.log('Deleted menu id:', m.id);
    }

    // Insert Advance Expense menu (from menus.sql id=127)
    // Use INSERT with specific ID to match menus.sql
    await conn.execute(`
      INSERT INTO menus (id, title, icon, route, parent_id, permission_name, \`order\`, order_index)
      VALUES (127, 'Advance Expense', 'payments', '/advance-expense', NULL, 'view advance expense', 99, 0)
      ON DUPLICATE KEY UPDATE
        title = 'Advance Expense',
        icon = 'payments',
        route = '/advance-expense',
        parent_id = NULL,
        permission_name = 'view advance expense',
        \`order\` = 99
    `);
    console.log('Inserted/updated menu: Advance Expense (id=127)');

    // ===== 2. INSERT TRANSLATIONS =====
    console.log('\n=== Adding Translations ===');

    const translations = [
      // Menu titles
      ['Advance Expense',              'Advance Expense',              'เงินทดรองจ่าย'],
      ['Advance Control',              'Advance Control',              'ควบคุมเงินทดรองจ่าย'],

      // Page headings
      ['adv.page_title',               'Advance Expense',              'เงินทดรองจ่าย'],
      ['adv.page_desc',                'Manage advance expense documents', 'จัดการเอกสารขอเบิกเงินทดรองจ่าย'],
      ['adv.create_new',               'Create New Document',           'สร้างเอกสารใหม่'],
      ['adv.search_placeholder',       'Search doc no., title, creator...', 'ค้นหาเลขเอกสาร, ชื่อ, ผู้สร้าง...'],
      ['adv.all_status',               'All Statuses',                  'ทุกสถานะ'],
      ['adv.search',                   'Search',                        'ค้นหา'],
      ['adv.clear',                    'Clear',                         'ล้าง'],
      ['adv.no_records',               'No documents found',            'ยังไม่มีเอกสาร'],

      // Table headers
      ['adv.doc_number',               'Document No.',                  'เลขเอกสาร'],
      ['adv.doc_date',                 'Date',                          'วันที่'],
      ['adv.title',                    'Title',                         'หัวข้อ'],
      ['adv.advance_amount',           'Advance Amount',                'ยอดขอเบิก'],
      ['adv.used_amount',              'Used',                          'ใช้ไปแล้ว'],
      ['adv.balance',                  'Balance',                       'คงเหลือ'],
      ['adv.created_by',               'Created By',                    'ผู้สร้าง'],
      ['adv.actions',                  'Actions',                       'จัดการ'],

      // Status labels
      ['adv.status_pending',           'Pending',                       'รอดำเนินการ'],
      ['adv.status_approved',          'Approved',                      'อนุมัติแล้ว'],
      ['adv.status_rejected',          'Rejected',                      'ปฏิเสธ'],
      ['adv.status_completed',         'Completed',                     'เสร็จสิ้น'],

      // Form - create document
      ['adv.create_modal_title',       'Create Advance Expense Document', 'สร้างเอกสารขอเบิกเงินทดรองจ่าย'],
      ['adv.document_date',            'Document Date',                 'วันที่เอกสาร'],
      ['adv.application_title',        'Application Title',             'หัวข้อการขอเบิก'],
      ['adv.application_placeholder',  'e.g. Travel expenses April 2026', 'เช่น ค่าใช้จ่ายเดินทาง เมษายน 2026'],
      ['adv.bank',                     'Bank',                          'ธนาคาร'],
      ['adv.select_bank',              '-- Select Bank --',             '-- เลือกธนาคาร --'],
      ['adv.reason',                   'Reason',                        'เหตุผลการขอเบิก'],
      ['adv.reason_placeholder',       'Explain the purpose of this advance...', 'อธิบายเหตุผลการขอเบิกเงิน...'],
      ['adv.amount_thb',               'Amount (THB)',                  'จำนวนเงิน (บาท)'],
      ['adv.remark',                   'Remark',                        'หมายเหตุ'],
      ['adv.remark_placeholder',       'Additional notes (optional)',   'หมายเหตุเพิ่มเติม (ถ้ามี)'],
      ['adv.save',                     'Save',                          'บันทึก'],
      ['adv.saving',                   'Saving...',                     'กำลังบันทึก...'],
      ['adv.cancel',                   'Cancel',                        'ยกเลิก'],
      ['adv.delete',                   'Delete',                        'ลบ'],

      // Detail page
      ['adv.back_to_list',             'Advance Expense',               'Advance Expense'],
      ['adv.print_doc',                'Print Document + QR',           'พิมพ์เอกสาร + QR'],
      ['adv.add_transaction',          'Add Expense',                   'เพิ่มรายจ่าย'],
      ['adv.bank_label',               'Bank',                          'ธนาคาร'],
      ['adv.creator_label',            'Created By',                    'ผู้สร้างเอกสาร'],
      ['adv.reason_label',             'Reason',                        'เหตุผล'],

      // Balance cards
      ['adv.balance_advance',          'Advance Amount',                'ยอดขอเบิก'],
      ['adv.balance_used',             'Total Used',                    'ใช้ไปแล้ว'],
      ['adv.balance_refund',           'Refunded',                      'คืนเงิน'],
      ['adv.balance_remaining',        'Remaining',                     'คงเหลือ'],

      // QR section
      ['adv.qr_title',                 'Scan QR to Record Expenses',    'สแกน QR เพื่อบันทึกค่าใช้จ่าย'],
      ['adv.qr_desc',                  'Scan this QR with your phone to open the expense form. You can select a Job Order, fill in details, and capture Invoice/Slip photos directly from your phone.', 'สแกน QR Code นี้ด้วยกล้องมือถือ เพื่อเปิดแบบฟอร์มบันทึกค่าใช้จ่าย สามารถเลือก Job Order, กรอกรายละเอียด และถ่ายรูป Invoice / สลิปโอนเงินได้โดยตรงจากมือถือ'],

      // Transactions table
      ['adv.transactions_title',       'Transactions',                  'รายการธุรกรรม'],
      ['adv.tx_date',                  'Date',                          'วันที่'],
      ['adv.tx_job_order',             'Job Order',                     'Job Order'],
      ['adv.tx_customer',              'Customer',                      'ลูกค้า'],
      ['adv.tx_description',           'Description',                   'รายละเอียด'],
      ['adv.tx_type',                  'Type',                          'ประเภท'],
      ['adv.tx_amount',                'Amount',                        'จำนวนเงิน'],
      ['adv.tx_running_balance',       'Running Balance',               'คงเหลือสะสม'],
      ['adv.tx_documents',             'Documents',                     'เอกสาร'],
      ['adv.tx_expense',               'Expense',                       'จ่าย'],
      ['adv.tx_refund',                'Refund',                        'คืน'],
      ['adv.no_transactions',          'No transactions yet',           'ยังไม่มีรายการธุรกรรม'],

      // Add transaction modal
      ['adv.add_tx_title',             'Add Transaction',               'เพิ่มรายการธุรกรรม'],
      ['adv.tx_type_label',            'Type',                          'ประเภท'],
      ['adv.tx_expense_label',         'Expense (Out)',                  'จ่ายออก (Expense)'],
      ['adv.tx_refund_label',          'Refund (In)',                    'คืนเงิน (Refund)'],
      ['adv.job_order_label',          'Job Order No.',                 'Job Order No.'],
      ['adv.no_job_order',             '-- No Job Order --',            '-- ไม่ระบุ Job Order --'],
      ['adv.customer_auto',            'Customer',                      'ลูกค้า (Customer)'],
      ['adv.description_label',        'Description',                   'รายละเอียด'],
      ['adv.description_placeholder',  'e.g. freight, overtime...',     'เช่น ค่าขนส่ง, ค่าล่วงเวลา...'],
      ['adv.invoice_image',            'Invoice Photo',                 'รูปใบ Invoice'],
      ['adv.slip_image',               'Transfer Slip',                 'รูปสลิปโอนเงิน'],

      // Delete confirm
      ['adv.confirm_delete_title',     'Confirm Delete',                'ยืนยันการลบ'],
      ['adv.confirm_delete_doc',       'Are you sure you want to delete document {0}? This action cannot be undone.', 'ต้องการลบเอกสาร {0} ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้'],
      ['adv.confirm_delete_tx',        'Are you sure you want to delete this transaction?', 'ต้องการลบรายการธุรกรรมนี้ใช่หรือไม่?'],

      // Change status modal
      ['adv.change_status_title',      'Change Status',                 'เปลี่ยนสถานะ'],
      ['adv.document_label',           'Document',                      'เอกสาร'],

      // Mobile form (apply page)
      ['adv.mobile_appbar',            'Advance Expense',               'Advance Expense'],
      ['adv.success_title',            'Saved Successfully!',           'บันทึกสำเร็จ!'],
      ['adv.success_message',          'Thank you for submitting the expense.', 'ขอบคุณสำหรับการกรอกข้อมูลค่าใช้จ่าย'],
      ['adv.add_more',                 'Add Another',                   'เพิ่มรายการอีกครั้ง'],
      ['adv.type_expense',             'Expense Out',                   'จ่ายออก'],
      ['adv.type_refund',              'Refund In',                     'คืนเงิน'],
      ['adv.basic_info',               'Transaction Details',            'ข้อมูลรายการ'],
      ['adv.take_invoice',             'Take Photo / Upload Invoice',    'ถ่ายรูป / อัปโหลด Invoice'],
      ['adv.tap_to_change',            'Tap to change',                 'แตะเพื่อเปลี่ยนรูป'],
      ['adv.tap_camera',               'Tap to open camera or select file', 'แตะเพื่อเปิดกล้องหรือเลือกไฟล์'],
      ['adv.take_slip',                'Take Photo / Upload Transfer Slip', 'ถ่ายรูป / อัปโหลดสลิปโอนเงิน'],
      ['adv.submit_btn',               'Save Transaction',               'บันทึกรายการ'],
      ['adv.submitting',               'Saving...',                      'กำลังบันทึก...'],
      ['adv.rejected_notice',          'This document has been rejected. Cannot add transactions.', 'เอกสารนี้ถูกปฏิเสธ ไม่สามารถเพิ่มรายการได้'],

      // Print document
      ['adv.print_control_title',      'Advance Control Document',       'ใบควบคุมเงินทดรองจ่าย'],
      ['adv.print_btn',                'Print',                          'พิมพ์'],
      ['adv.sig_creator',              'Creator',                        'ผู้สร้างเอกสาร'],
      ['adv.sig_checker',              'Reviewer',                       'ผู้ตรวจสอบ'],
      ['adv.sig_approver',             'Approver',                       'ผู้อนุมัติ'],

      // Validation messages
      ['adv.required_fields',          'Please fill in all required fields', 'กรุณากรอกข้อมูลให้ครบถ้วน'],
      ['adv.invalid_amount',           'Please enter a valid date and amount', 'กรุณากรอกวันที่และจำนวนเงินให้ถูกต้อง'],
    ];

    let inserted = 0, updated = 0;
    for (const [key, en, th] of translations) {
      const [existing] = await conn.execute(
        'SELECT id FROM system_translations WHERE translation_key = ?', [key]
      );
      if (existing.length > 0) {
        await conn.execute(
          'UPDATE system_translations SET en_text = ?, th_text = ? WHERE translation_key = ?',
          [en, th, key]
        );
        updated++;
      } else {
        await conn.execute(
          'INSERT INTO system_translations (translation_key, en_text, th_text) VALUES (?, ?, ?)',
          [key, en, th]
        );
        inserted++;
      }
    }

    console.log(`Translations: ${inserted} inserted, ${updated} updated`);
    console.log('\nAll done!');

  } finally {
    await conn.end();
  }
})();
