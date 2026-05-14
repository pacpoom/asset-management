-- Per-document Ship To receiver (overrides delivery_addresses.contact_* when set)
-- Run on each DB environment before using the feature.

ALTER TABLE purchase_documents
	ADD COLUMN delivery_receiver_name VARCHAR(255) NULL
		COMMENT 'Receiver name for this document only; blank = use delivery_addresses.contact_name',
	ADD COLUMN delivery_receiver_phone VARCHAR(100) NULL
		COMMENT 'Receiver phone for this document only; blank = use delivery_addresses.contact_phone';
