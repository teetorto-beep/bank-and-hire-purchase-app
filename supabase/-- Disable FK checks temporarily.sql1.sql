-- Disable FK checks temporarily
set session_replication_role = replica;

-- Wipe all data
truncate table gl_entries, gl_accounts, audit_log, deduction_rules,
  collections, collector_assignments, collectors, hp_payments,
  hp_agreements, loans, hp_items, products, pending_approvals,
  pending_transactions, transactions, notifications, accounts,
  customers, users, system_settings
restart identity cascade;

-- Re-enable FK checks
set session_replication_role = default;

-- Re-insert default admin + teller
insert into users (id, name, email, password, role) values
  ('00000000-0000-0000-0000-000000000001', 'Admin User', 'admin@majupat.com',  'admin123',  'admin'),
  ('00000000-0000-0000-0000-000000000002', 'Teller One', 'teller@majupat.com', 'teller123', 'teller')
on conflict (email) do nothing;

-- Re-insert system settings
insert into system_settings (key, value) values (
  'approval_rules',
  '{"credit_threshold":{"enabled":true,"amount":10000,"roles":["teller","collector"]},"debit_threshold":{"enabled":true,"amount":5000,"roles":["teller","collector"]},"transfer_threshold":{"enabled":true,"amount":5000,"roles":["teller","manager"]},"account_opening":{"enabled":false,"roles":["teller"]},"loan_creation":{"enabled":true,"roles":["teller"]},"gl_entry":{"enabled":true,"roles":["teller","manager"]},"customer_creation":{"enabled":false,"roles":["teller"]},"user_creation":{"enabled":false,"roles":[]}}'::jsonb
) on conflict (key) do nothing;

-- Verify
select 'customers' as tbl, count(*) from customers
union all select 'accounts',     count(*) from accounts
union all select 'transactions',  count(*) from transactions
union all select 'loans',         count(*) from loans
union all select 'collections',   count(*) from collections
union all select 'users',         count(*) from users
order by tbl;
