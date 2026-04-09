-- ============================================
-- DELETE ALL DATA FROM DATABASE
-- WARNING: This will remove ALL data but keep the schema
-- ============================================

-- Disable triggers temporarily to avoid cascading issues
SET session_replication_role = 'replica';

-- Delete data from all tables in reverse dependency order
-- (child tables first, then parent tables)

-- 1. Delete notifications
DELETE FROM notifications;

-- 2. Delete collections
DELETE FROM collections;

-- 3. Delete general ledger entries
DELETE FROM general_ledger;

-- 4. Delete transactions
DELETE FROM transactions;

-- 5. Delete pending approvals
DELETE FROM pending_approvals;

-- 6. Delete hire purchase agreements
DELETE FROM hire_purchase_agreements;

-- 7. Delete hire purchase items
DELETE FROM hire_purchase_items;

-- 8. Delete loans
DELETE FROM loans;

-- 9. Delete accounts
DELETE FROM accounts;

-- 10. Delete customers
DELETE FROM customers;

-- 11. Delete collectors
DELETE FROM collectors;

-- 12. Delete bank products
DELETE FROM bank_products;

-- 13. Delete users (be careful with this!)
DELETE FROM users;

-- 14. Delete system settings (optional - you may want to keep these)
-- DELETE FROM system_settings;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Reset sequences to start from 1 again
ALTER SEQUENCE IF EXISTS customers_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS accounts_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS transactions_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS loans_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS collections_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS general_ledger_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS hire_purchase_items_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS hire_purchase_agreements_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS bank_products_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS collectors_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS pending_approvals_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS notifications_id_seq RESTART WITH 1;

-- Verify deletion
SELECT 'customers' as table_name, COUNT(*) as remaining_rows FROM customers
UNION ALL
SELECT 'accounts', COUNT(*) FROM accounts
UNION ALL
SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'loans', COUNT(*) FROM loans
UNION ALL
SELECT 'collections', COUNT(*) FROM collections
UNION ALL
SELECT 'general_ledger', COUNT(*) FROM general_ledger
UNION ALL
SELECT 'hire_purchase_items', COUNT(*) FROM hire_purchase_items
UNION ALL
SELECT 'hire_purchase_agreements', COUNT(*) FROM hire_purchase_agreements
UNION ALL
SELECT 'bank_products', COUNT(*) FROM bank_products
UNION ALL
SELECT 'collectors', COUNT(*) FROM collectors
UNION ALL
SELECT 'pending_approvals', COUNT(*) FROM pending_approvals
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'users', COUNT(*) FROM users;

-- Success message
SELECT 'All data deleted successfully! Database is now empty but schema is intact.' as status;
