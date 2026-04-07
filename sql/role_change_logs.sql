-- Role Change Audit Log Table
-- Tracks all role changes for users with full audit trail

CREATE TABLE IF NOT EXISTS role_change_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL COMMENT 'User whose role was changed',
    old_role_id BIGINT UNSIGNED NULL COMMENT 'Previous role ID (NULL if first assignment)',
    new_role_id BIGINT UNSIGNED NOT NULL COMMENT 'New role ID',
    changed_by_user_id BIGINT UNSIGNED NOT NULL COMMENT 'Admin who made the change',
    change_reason VARCHAR(255) NULL COMMENT 'Optional reason for change',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user_id (user_id),
    INDEX idx_changed_by (changed_by_user_id),
    INDEX idx_created_at (created_at),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (old_role_id) REFERENCES roles(id) ON DELETE SET NULL,
    FOREIGN KEY (new_role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Audit log for user role changes';
