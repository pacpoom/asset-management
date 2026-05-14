-- Purchase documents: document currency (THB / USD / CNY)
-- Run once on each environment before deploying app code that reads/writes `currency`.

ALTER TABLE purchase_documents
	ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'THB'
		COMMENT 'ISO-like code: THB, USD, CNY';
