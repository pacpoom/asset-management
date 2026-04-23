-- Run on existing DBs: store request time on DAR header (was DATE only).
ALTER TABLE dar_requests
	MODIFY COLUMN request_date DATETIME NOT NULL;
