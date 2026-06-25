-- Backfill product_assignments for accounts opened before auto-assignment was added
-- HELLO product: id = 005b12cb-d54f-400a-b218-89b5155940df
-- max_customers = 2

INSERT INTO product_assignments (product_id, customer_id, account_id, assigned_by, notes)
VALUES
  (
    '005b12cb-d54f-400a-b218-89b5155940df',
    'f62e0b00-8b92-4e65-83e1-4654242a5d29',
    '80f60236-6d2c-4815-9818-76db925a85e8',
    'Backfill',
    'Backfilled from existing account 10001616522'
  ),
  (
    '005b12cb-d54f-400a-b218-89b5155940df',
    '97f4646c-b82b-4e6b-a336-e07d5df0ba37',
    '5dbac787-9346-45da-8d1f-ea7eaac02c12',
    'Backfill',
    'Backfilled from existing account 10002849840'
  )
ON CONFLICT (product_id, customer_id) DO NOTHING;

-- Verify
SELECT p.name, COUNT(pa.id) as assigned, p.max_customers
FROM products p
LEFT JOIN product_assignments pa ON pa.product_id = p.id
GROUP BY p.id, p.name, p.max_customers;
