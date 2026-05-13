-- Additional permissions for the products module
-- (view/create/edit/delete products already exist)

INSERT INTO permissions (name, guard_name)
SELECT 'import products', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'import products');

INSERT INTO permissions (name, guard_name)
SELECT 'adjust product stock', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'adjust product stock');

INSERT INTO permissions (name, guard_name)
SELECT 'view product stock history', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'view product stock history');
