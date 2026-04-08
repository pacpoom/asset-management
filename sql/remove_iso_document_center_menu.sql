-- Remove legacy "ISO Document Center" sidebar branch (often a duplicate of IsoDocs Control).
-- Safe on MySQL 8+ / MariaDB 10.2+ (recursive CTE). Idempotent: second run deletes 0 rows.

WITH RECURSIVE branch AS (
	SELECT id
	FROM menus
	WHERE LOWER(TRIM(title)) = 'iso document center'
	UNION ALL
	SELECT m.id
	FROM menus m
	INNER JOIN branch b ON m.parent_id = b.id
)
DELETE FROM menus
WHERE id IN (SELECT id FROM branch);
