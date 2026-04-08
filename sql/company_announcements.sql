CREATE TABLE IF NOT EXISTS company_announcements (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	title VARCHAR(255) NOT NULL,
	content TEXT NOT NULL,
	image_url VARCHAR(500) NULL,
	attachment_name VARCHAR(255) NULL,
	attachment_url VARCHAR(500) NULL,
	is_active TINYINT(1) NOT NULL DEFAULT 1,
	is_pinned TINYINT(1) NOT NULL DEFAULT 0,
	start_at DATETIME NULL,
	end_at DATETIME NULL,
	created_by BIGINT UNSIGNED NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_company_announcements_active (is_active),
	KEY idx_company_announcements_pin_date (is_pinned, created_at),
	CONSTRAINT fk_company_announcements_created_by
		FOREIGN KEY (created_by) REFERENCES users(id)
		ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_announcement_images (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	announcement_id BIGINT UNSIGNED NOT NULL,
	image_url VARCHAR(500) NOT NULL,
	sort_order INT NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_company_announcement_images_announcement (announcement_id, sort_order),
	CONSTRAINT fk_company_announcement_images_announcement
		FOREIGN KEY (announcement_id) REFERENCES company_announcements(id)
		ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_announcement_attachments (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	announcement_id BIGINT UNSIGNED NOT NULL,
	file_name VARCHAR(255) NOT NULL,
	file_url VARCHAR(500) NOT NULL,
	sort_order INT NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_company_announcement_attachments_announcement (announcement_id, sort_order),
	CONSTRAINT fk_company_announcement_attachments_announcement
		FOREIGN KEY (announcement_id) REFERENCES company_announcements(id)
		ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = (
	SELECT IF(
		EXISTS (
			SELECT 1
			FROM information_schema.COLUMNS
			WHERE TABLE_SCHEMA = DATABASE()
			  AND TABLE_NAME = 'company_announcements'
			  AND COLUMN_NAME = 'image_url'
		),
		'SELECT 1',
		'ALTER TABLE company_announcements ADD COLUMN image_url VARCHAR(500) NULL AFTER content'
	)
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill old single-file columns into new multi-file tables (idempotent-ish)
INSERT INTO company_announcement_images (announcement_id, image_url, sort_order)
SELECT c.id, c.image_url, 0
FROM company_announcements c
WHERE c.image_url IS NOT NULL
  AND c.image_url <> ''
  AND NOT EXISTS (
  	SELECT 1
  	FROM company_announcement_images i
  	WHERE i.announcement_id = c.id AND i.image_url = c.image_url
  );

INSERT INTO company_announcement_attachments (announcement_id, file_name, file_url, sort_order)
SELECT c.id, COALESCE(NULLIF(c.attachment_name, ''), 'Attachment'), c.attachment_url, 0
FROM company_announcements c
WHERE c.attachment_url IS NOT NULL
  AND c.attachment_url <> ''
  AND NOT EXISTS (
  	SELECT 1
  	FROM company_announcement_attachments a
  	WHERE a.announcement_id = c.id AND a.file_url = c.attachment_url
  );

SET @sql = (
	SELECT IF(
		EXISTS (
			SELECT 1
			FROM information_schema.COLUMNS
			WHERE TABLE_SCHEMA = DATABASE()
			  AND TABLE_NAME = 'company_announcements'
			  AND COLUMN_NAME = 'attachment_name'
		),
		'SELECT 1',
		'ALTER TABLE company_announcements ADD COLUMN attachment_name VARCHAR(255) NULL AFTER image_url'
	)
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
	SELECT IF(
		EXISTS (
			SELECT 1
			FROM information_schema.COLUMNS
			WHERE TABLE_SCHEMA = DATABASE()
			  AND TABLE_NAME = 'company_announcements'
			  AND COLUMN_NAME = 'attachment_url'
		),
		'SELECT 1',
		'ALTER TABLE company_announcements ADD COLUMN attachment_url VARCHAR(500) NULL AFTER attachment_name'
	)
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
