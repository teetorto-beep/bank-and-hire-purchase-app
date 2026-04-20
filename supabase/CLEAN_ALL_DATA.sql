-- ============================================================
-- CLEAN ALL DATA — keeps tables, wipes all rows
-- Run in Supabase SQL Editor
-- ============================================================

-- Disable triggers temporarily to avoid FK issues during truncate
set session_replication_role = replica;

truncate table
  gl_entries,
  gl_accounts,
  audit_log,
  deduction_rules,
  collections,
  collector_assignments,
  collectors,
  hp_payments,
  hp_agreements,
  loans,
  hp_items,
  products,
  pending_approvals,
  pending_transactions,
  transactions,
  notifications,
  accounts,
  customers,
  users,
  system_settings
restart identity cascade;

-- Re-enable triggers
set session_replication_role = default;

-- Re-insert seed data
insert into users (id, name, email, password, role) values
  ('00000000-0000-0000-0000-000000000001', 'Admin User', 'admin@majupat.com',  'admin123',  'admin'),
  ('00000000-0000-0000-0000-000000000002', 'Teller One', 'teller@majupat.com', 'teller123', 'teller')
on conflict (email) do nothing;

insert into system_settings (key, value) values (
  'approval_rules',
  '{
    "credit_threshold":   {"enabled":true,  "amount":10000, "roles":["teller","collector"]},
    "debit_threshold":    {"enabled":true,  "amount":5000,  "roles":["teller","collector"]},
    "transfer_threshold": {"enabled":true,  "amount":5000,  "roles":["teller","manager"]},
    "account_opening":    {"enabled":false, "roles":["teller"]},
    "loan_creation":      {"enabled":true,  "roles":["teller"]},
    "gl_entry":           {"enabled":true,  "roles":["teller","manager"]},
    "customer_creation":  {"enabled":false, "roles":["teller"]},
    "user_creation":      {"enabled":false, "roles":[]}
  }'::jsonb
) on conflict (key) do nothing;

insert into gl_accounts (code, name, type, category, description, is_system) values
  ('1000','Cash in Hand','asset','current_asset','Physical cash in vault',true),
  ('1010','Main Operating Account','asset','current_asset','Primary bank account',true),
  ('1020','Customer Deposits Account','asset','current_asset','Held customer deposits',true),
  ('1030','Savings Pool Account','asset','current_asset','Pooled savings funds',true),
  ('1100','Loan Receivables','asset','current_asset','Outstanding loans',true),
  ('1110','Interest Receivable','asset','current_asset','Accrued interest from loans',true),
  ('2000','Current Accounts','liability','current_liability','Customer demand deposits',true),
  ('2010','Savings Accounts','liability','current_liability','Interest-bearing deposits',true),
  ('2020','Fixed Deposits','liability','current_liability','Time-bound deposits',true),
  ('2100','Interest Payable','liability','current_liability','Interest owed to customers',true),
  ('3000','Share Capital','equity','equity','Owner investments',true),
  ('3010','Retained Earnings','equity','equity','Accumulated profits',true),
  ('4000','Loan Interest Income','revenue','interest_income','Interest from loans',true),
  ('4100','Account Maintenance Fees','revenue','fee_income','Monthly account fees',true),
  ('4110','Transaction Fees','revenue','fee_income','Per-transaction charges',true),
  ('5000','Interest on Savings','expense','interest_expense','Paid to savings customers',true),
  ('5100','Employee Salaries','expense','operating_expense','Staff compensation',true),
  ('5110','Rent Expense','expense','operating_expense','Office rent',true),
  ('5200','Loan Loss Provision','expense','provision','Expected loan defaults',true)
on conflict (code) do nothing;

-- Verify
select 'users' as tbl, count(*) from users
union all select 'customers', count(*) from customers
union all select 'accounts', count(*) from accounts
union all select 'transactions', count(*) from transactions
union all select 'loans', count(*) from loans
union all select 'collections', count(*) from collections
order by tbl;
