-- 1. Check exact product categories
SELECT name, category, status FROM products ORDER BY category;

-- 2. Check existing HP accounts
SELECT a.account_number, a.type, a.status, c.name as customer_name
FROM accounts a
JOIN customers c ON c.id = a.customer_id
WHERE a.type = 'hire_purchase' OR a.type ILIKE '%hire%'
ORDER BY c.name;

-- 3. Check the current type constraint on accounts table
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'accounts_type_check';
