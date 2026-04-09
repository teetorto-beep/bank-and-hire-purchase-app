-- ============================================
-- DELETE DATA FROM SPECIFIC TABLES
-- Use this if you only want to delete certain data
-- ============================================

-- Option 1: Delete only transaction-related data (keeps customers, accounts, products)
-- Uncomment the section you want to use:

/*
DELETE FROM collections;
DELETE FROM general_ledger;
DELETE FROM transactions;
DELETE FROM pending_approvals;
SELECT 'Transaction data deleted' as status;
*/

-- Option 2: Delete only loan data
/*
DELETE FROM loans;
SELECT 'Loan data deleted' as status;
*/

-- Option 3: Delete only hire purchase data
/*
DELETE FROM hire_purchase_agreements;
DELETE FROM hire_purchase_items;
SELECT 'Hire purchase data deleted' as status;
*/

-- Option 4: Delete only notifications
/*
DELETE FROM notifications;
SELECT 'Notifications deleted' as status;
*/

-- Option 5: Delete everything except users and system settings
/*
SET session_replication_role = 'replica';

DELETE FROM notifications;
DELETE FROM collections;
DELETE FROM general_ledger;
DELETE FROM transactions;
DELETE FROM pending_approvals;
DELETE FROM hire_purchase_agreements;
DELETE FROM hire_purchase_items;
DELETE FROM loans;
DELETE FROM accounts;
DELETE FROM customers;
DELETE FROM collectors;
DELETE FROM bank_products;

SET session_replication_role = 'origin';

SELECT 'All data deleted except users and system settings' as status;
*/
