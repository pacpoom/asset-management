SET @seed_user_id := (SELECT id FROM users ORDER BY id ASC LIMIT 1);

INSERT INTO iso_documents (doc_no, title, description, file_path, version, status, created_by)
SELECT
	'ISO-001',
	'Quality Manual',
	'Core quality management guideline for demo flow.',
	NULL,
	'1.0',
	'draft',
	@seed_user_id
WHERE @seed_user_id IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM iso_documents WHERE doc_no = 'ISO-001');

INSERT INTO iso_documents (doc_no, title, description, file_path, version, status, created_by)
SELECT
	'ISO-002',
	'Supplier Evaluation Procedure',
	'Procedure for supplier qualification and periodic evaluation.',
	NULL,
	'1.1',
	'pending',
	@seed_user_id
WHERE @seed_user_id IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM iso_documents WHERE doc_no = 'ISO-002');

INSERT INTO iso_documents (doc_no, title, description, file_path, version, status, created_by, approved_by, approved_at)
SELECT
	'ISO-003',
	'Document Control Policy',
	'Policy for controlling and distributing controlled documents.',
	NULL,
	'2.0',
	'approved',
	@seed_user_id,
	@seed_user_id,
	NOW()
WHERE @seed_user_id IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM iso_documents WHERE doc_no = 'ISO-003');

INSERT INTO iso_document_audit_logs (iso_document_id, user_id, action, remark)
SELECT d.id, @seed_user_id, 'create', CONCAT('Seeded document ', d.doc_no)
FROM iso_documents d
WHERE d.doc_no IN ('ISO-001', 'ISO-002', 'ISO-003')
	AND @seed_user_id IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM iso_document_audit_logs l
		WHERE l.iso_document_id = d.id AND l.action = 'create' AND l.remark = CONCAT('Seeded document ', d.doc_no)
	);

INSERT INTO iso_document_audit_logs (iso_document_id, user_id, action, remark)
SELECT d.id, @seed_user_id, 'submit', 'Seeded pending state'
FROM iso_documents d
WHERE d.doc_no = 'ISO-002'
	AND @seed_user_id IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM iso_document_audit_logs l
		WHERE l.iso_document_id = d.id AND l.action = 'submit' AND l.remark = 'Seeded pending state'
	);

INSERT INTO iso_document_audit_logs (iso_document_id, user_id, action, remark)
SELECT d.id, @seed_user_id, 'approve', 'Seeded approved state'
FROM iso_documents d
WHERE d.doc_no = 'ISO-003'
	AND @seed_user_id IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM iso_document_audit_logs l
		WHERE l.iso_document_id = d.id AND l.action = 'approve' AND l.remark = 'Seeded approved state'
	);
