-- IsoDocs Control - Step 5 (Status Mapping into iso_documents.status)

-- 1) Extend iso_documents.status enum to include ISO doc control states
-- NOTE: keep legacy values in list for backward compatibility.
ALTER TABLE iso_documents
	MODIFY status ENUM(
		'draft',
		'pending',
		'approved',
		'rejected',
		'original_controlled',
		'distribution_controlled',
		'distribution_uncontrolled',
		'cancelled'
	) NOT NULL DEFAULT 'draft';

-- 2) Map legacy "approved" to "original_controlled" (if any exist)
UPDATE iso_documents
SET status = 'original_controlled'
WHERE status = 'approved';

