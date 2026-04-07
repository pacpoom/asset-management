-- Store approval step timestamps with time (Manager / VP / QMR).
-- Run once, then new approvals use NOW() in application code.

ALTER TABLE dar_requests
	MODIFY COLUMN reviewer_date DATETIME NULL,
	MODIFY COLUMN approver_date DATETIME NULL,
	MODIFY COLUMN register_date DATETIME NULL;
