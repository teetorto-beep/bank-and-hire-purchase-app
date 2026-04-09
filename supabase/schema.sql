-- ============================================================
-- MAJUPAT LOVE ENTERPRISE — Complete Database Schema
-- Developed by Maxbraynn Technology & Systems
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Users (system staff) ─────────────────────────────────────────────────────
create table if not exists users (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  email       text unique not null,
  password    text not null,  -- hashed in production; plain for demo
  role        text not null default 'teller' check (role in ('admin','manager','teller','collector','viewer')),
  phone       text,
  status      text not null default 'active' check (status in ('active','inactive')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── Customers ─────────────────────────────────────────────────────────────────
create table if not exists customers (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  email           text,
  phone           text not null,
  ghana_card      text,
  dob             date,
  address         text,
  occupation      text,
  employer        text,
  monthly_income  numeric(15,2) default 0,
  kyc_status      text not null default 'pending' check (kyc_status in ('pending','verified','rejected')),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Accounts ──────────────────────────────────────────────────────────────────
create table if not exists accounts (
  id              uuid primary key default uuid_generate_v4(),
  customer_id     uuid not null references customers(id) on delete restrict,
  account_number  text unique not null,
  type            text not null check (type in ('savings','current','hire_purchase','joint','fixed_deposit')),
  balance         numeric(15,2) not null default 0,
  status          text not null default 'active' check (status in ('active','dormant','frozen','closed')),
  interest_rate   numeric(5,2) default 0,
  opened_by       uuid references users(id),
  opened_at       timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Transactions ──────────────────────────────────────────────────────────────
create table if not exists transactions (
  id              uuid primary key default uuid_generate_v4(),
  account_id      uuid not null references accounts(id) on delete restrict,
  type            text not null check (type in ('credit','debit')),
  amount          numeric(15,2) not null check (amount > 0),
  narration       text not null,
  reference       text unique not null,
  balance_after   numeric(15,2) not null,
  channel         text default 'teller',
  created_by      uuid references users(id),
  poster_name     text,
  approved_by     uuid references users(id),
  approver_name   text,
  reversal_of     uuid references transactions(id),
  reversed        boolean default false,
  reversed_by     uuid references users(id),
  reversed_at     timestamptz,
  hp_agreement_id uuid,
  loan_id         uuid,
  rule_id         uuid,
  status          text default 'completed',
  created_at      timestamptz default now()
);

-- ── Pending Transactions (Authoriser Queue) ───────────────────────────────────
create table if not exists pending_transactions (
  id              uuid primary key default uuid_generate_v4(),
  account_id      uuid not null references accounts(id),
  type            text not null check (type in ('credit','debit')),
  amount          numeric(15,2) not null,
  narration       text not null,
  channel         text default 'teller',
  submitted_by    uuid references users(id),
  submitter_name  text,
  submitted_at    timestamptz default now(),
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by     uuid references users(id),
  approver_name   text,
  approved_at     timestamptz,
  rejected_by     uuid references users(id),
  rejector_name   text,
  rejected_at     timestamptz,
  reject_reason   text
);

-- ── Loans ─────────────────────────────────────────────────────────────────────
create table if not exists loans (
  id                uuid primary key default uuid_generate_v4(),
  customer_id       uuid not null references customers(id),
  account_id        uuid not null references accounts(id),
  type              text not null check (type in ('personal','hire_purchase','micro','mortgage','emergency','group')),
  amount            numeric(15,2) not null,
  outstanding       numeric(15,2) not null,
  interest_rate     numeric(5,2) not null,
  tenure            int not null,
  monthly_payment   numeric(15,2),
  status            text not null default 'pending' check (status in ('pending','active','overdue','completed','rejected')),
  purpose           text,
  hp_agreement_id   uuid,
  item_name         text,
  disbursed_at      timestamptz,
  next_due_date     timestamptz,
  last_payment_date timestamptz,
  created_by        uuid references users(id),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ── Bank Products ─────────────────────────────────────────────────────────────
create table if not exists products (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  category        text not null,
  description     text,
  interest_rate   numeric(5,2) default 0,
  min_balance     numeric(15,2) default 0,
  max_balance     numeric(15,2),
  monthly_fee     numeric(10,2) default 0,
  tenure_months   int,
  benefits        text[] default '{}',
  status          text default 'active' check (status in ('active','inactive')),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── HP Items (physical goods catalogue) ──────────────────────────────────────
create table if not exists hp_items (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  category        text not null,
  description     text,
  price           numeric(15,2) not null,
  stock           int default 0,
  image           text,
  daily_payment   numeric(10,2) default 0,
  weekly_payment  numeric(10,2) default 0,
  status          text default 'available' check (status in ('available','out_of_stock','discontinued')),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── HP Agreements ─────────────────────────────────────────────────────────────
create table if not exists hp_agreements (
  id                  uuid primary key default uuid_generate_v4(),
  customer_id         uuid not null references customers(id),
  item_id             uuid references hp_items(id),
  item_name           text not null,
  loan_id             uuid references loans(id),
  total_price         numeric(15,2) not null,
  down_payment        numeric(15,2) default 0,
  total_paid          numeric(15,2) default 0,
  remaining           numeric(15,2) not null,
  payment_frequency   text not null check (payment_frequency in ('daily','weekly','monthly')),
  suggested_payment   numeric(10,2),
  notes               text,
  status              text default 'active' check (status in ('active','completed','cancelled')),
  last_payment_date   timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ── HP Payments ───────────────────────────────────────────────────────────────
create table if not exists hp_payments (
  id              uuid primary key default uuid_generate_v4(),
  agreement_id    uuid not null references hp_agreements(id),
  amount          numeric(15,2) not null,
  remaining       numeric(15,2) not null,
  note            text,
  collected_by    text,
  created_at      timestamptz default now()
);

-- ── Collectors ────────────────────────────────────────────────────────────────
create table if not exists collectors (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,
  phone               text not null,
  zone                text,
  username            text unique,
  password            text,
  push_token          text,
  status              text default 'active' check (status in ('active','inactive')),
  total_collected     numeric(15,2) default 0,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ── Collector ↔ Customer assignments ─────────────────────────────────────────
create table if not exists collector_assignments (
  collector_id  uuid not null references collectors(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  assigned_at   timestamptz default now(),
  primary key (collector_id, customer_id)
);

-- ── Collections ───────────────────────────────────────────────────────────────
create table if not exists collections (
  id              uuid primary key default uuid_generate_v4(),
  collector_id    uuid references collectors(id),
  collector_name  text,
  customer_id     uuid references customers(id),
  customer_name   text,
  account_id      uuid references accounts(id),
  amount          numeric(15,2) not null,
  notes           text,
  payment_type    text default 'savings',
  loan_id         uuid references loans(id),
  hp_agreement_id uuid references hp_agreements(id),
  status          text default 'completed',
  created_at      timestamptz default now()
);

-- ── Deduction Rules (auto-debit on credit) ────────────────────────────────────
create table if not exists deduction_rules (
  id              uuid primary key default uuid_generate_v4(),
  account_id      uuid not null references accounts(id),
  label           text not null,
  amount          numeric(15,2) not null,
  narration       text,
  loan_id         uuid references loans(id),
  hp_agreement_id uuid references hp_agreements(id),
  active          boolean default true,
  created_at      timestamptz default now()
);

-- ── Audit Log ─────────────────────────────────────────────────────────────────
create table if not exists audit_log (
  id          uuid primary key default uuid_generate_v4(),
  action      text not null,
  entity      text,
  entity_id   text,
  user_id     uuid references users(id),
  user_name   text,
  detail      text,
  timestamp   timestamptz default now()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
create index if not exists idx_accounts_customer on accounts(customer_id);
create index if not exists idx_accounts_number on accounts(account_number);
create index if not exists idx_transactions_account on transactions(account_id);
create index if not exists idx_transactions_created on transactions(created_at desc);
create index if not exists idx_transactions_reference on transactions(reference);
create index if not exists idx_loans_customer on loans(customer_id);
create index if not exists idx_hp_agreements_customer on hp_agreements(customer_id);
create index if not exists idx_hp_payments_agreement on hp_payments(agreement_id);
create index if not exists idx_pending_status on pending_transactions(status);
create index if not exists idx_audit_timestamp on audit_log(timestamp desc);
create index if not exists idx_customers_phone on customers(phone);
create index if not exists idx_customers_ghana_card on customers(ghana_card);

-- ============================================================
-- ROW LEVEL SECURITY (enable but allow all for now — tighten per role later)
-- ============================================================
alter table users enable row level security;
alter table customers enable row level security;
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table pending_transactions enable row level security;
alter table loans enable row level security;
alter table products enable row level security;
alter table hp_items enable row level security;
alter table hp_agreements enable row level security;
alter table hp_payments enable row level security;
alter table collectors enable row level security;
alter table collector_assignments enable row level security;
alter table collections enable row level security;
alter table deduction_rules enable row level security;
alter table audit_log enable row level security;

-- Allow all operations for authenticated users (service role bypasses RLS)
create policy "allow_all_authenticated" on users for all using (true) with check (true);
create policy "allow_all_authenticated" on customers for all using (true) with check (true);
create policy "allow_all_authenticated" on accounts for all using (true) with check (true);
create policy "allow_all_authenticated" on transactions for all using (true) with check (true);
create policy "allow_all_authenticated" on pending_transactions for all using (true) with check (true);
create policy "allow_all_authenticated" on loans for all using (true) with check (true);
create policy "allow_all_authenticated" on products for all using (true) with check (true);
create policy "allow_all_authenticated" on hp_items for all using (true) with check (true);
create policy "allow_all_authenticated" on hp_agreements for all using (true) with check (true);
create policy "allow_all_authenticated" on hp_payments for all using (true) with check (true);
create policy "allow_all_authenticated" on collectors for all using (true) with check (true);
create policy "allow_all_authenticated" on collector_assignments for all using (true) with check (true);
create policy "allow_all_authenticated" on collections for all using (true) with check (true);
create policy "allow_all_authenticated" on deduction_rules for all using (true) with check (true);
create policy "allow_all_authenticated" on audit_log for all using (true) with check (true);

-- ============================================================
-- SEED DATA — Default admin users
-- ============================================================
insert into users (id, name, email, password, role) values
  ('00000000-0000-0000-0000-000000000001', 'Admin User', 'admin@majupat.com', 'admin123', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'Teller One', 'teller@majupat.com', 'teller123', 'teller')
on conflict (email) do nothing;

-- ============================================================
-- HELPER FUNCTION: generate account number
-- ============================================================
create or replace function generate_account_number()
returns text language plpgsql as $$
declare
  num text;
  exists_check int;
begin
  loop
    num := '1000' || lpad(floor(random() * 9000000 + 1000000)::text, 7, '0');
    select count(*) into exists_check from accounts where account_number = num;
    exit when exists_check = 0;
  end loop;
  return num;
end;
$$;

-- ============================================================
-- GL LEDGER — General Ledger System
-- ============================================================

-- ── Chart of Accounts ─────────────────────────────────────────────────────────
-- Standard double-entry account types:
--   1xxx = Assets       (debit increases)
--   2xxx = Liabilities  (credit increases)
--   3xxx = Equity       (credit increases)
--   4xxx = Revenue/Income (credit increases)
--   5xxx = Expenses     (debit increases)
create table if not exists gl_accounts (
  id            uuid primary key default uuid_generate_v4(),
  code          text unique not null,          -- e.g. "1001"
  name          text not null,                 -- e.g. "Cash & Deposits"
  type          text not null check (type in ('asset','liability','equity','revenue','expense')),
  category      text not null,                 -- e.g. "current_asset", "income", "operating_expense"
  description   text,
  parent_code   text,                          -- for sub-accounts
  is_system     boolean default false,         -- system accounts cannot be deleted
  balance       numeric(15,2) default 0,       -- running balance
  status        text default 'active' check (status in ('active','inactive')),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── GL Journal Entries ────────────────────────────────────────────────────────
-- Every financial event creates a balanced journal entry (debits = credits)
create table if not exists gl_entries (
  id              uuid primary key default uuid_generate_v4(),
  journal_ref     text not null,               -- groups debit+credit lines together
  gl_account_id   uuid not null references gl_accounts(id),
  gl_account_code text not null,
  gl_account_name text not null,
  entry_type      text not null check (entry_type in ('debit','credit')),
  amount          numeric(15,2) not null check (amount > 0),
  narration       text not null,
  source_type     text,                        -- 'transaction','loan','collection','hp_payment'
  source_id       text,                        -- UUID of the source record
  transaction_ref text,                        -- links to transactions.reference
  posted_by       text,
  period_month    int,                         -- 1-12
  period_year     int,
  created_at      timestamptz default now()
);

create index if not exists idx_gl_entries_journal on gl_entries(journal_ref);
create index if not exists idx_gl_entries_account on gl_entries(gl_account_id);
create index if not exists idx_gl_entries_period on gl_entries(period_year, period_month);
create index if not exists idx_gl_entries_source on gl_entries(source_type, source_id);

-- ── Full Chart of Accounts ────────────────────────────────────────────────────
insert into gl_accounts (code, name, type, category, description, is_system) values
  -- ── ASSETS: Cash & Bank ──────────────────────────────────────────────────
  ('1000', 'Cash in Hand',                    'asset', 'current_asset',  'Physical cash in vault',                    true),
  ('1010', 'Main Operating Account',          'asset', 'current_asset',  'Primary bank account',                      true),
  ('1020', 'Customer Deposits Account',       'asset', 'current_asset',  'Held customer deposits',                    true),
  ('1030', 'Savings Pool Account',            'asset', 'current_asset',  'Pooled savings funds',                      true),
  ('1040', 'Escrow Account',                  'asset', 'current_asset',  'Held for specific purposes',                true),
  ('1050', 'Reserve Account',                 'asset', 'current_asset',  'Mandatory reserves',                        true),
  -- ── ASSETS: Receivables ──────────────────────────────────────────────────
  ('1100', 'Loan Receivables',                'asset', 'current_asset',  'Outstanding loans',                         true),
  ('1110', 'Interest Receivable',             'asset', 'current_asset',  'Accrued interest from loans',               true),
  ('1120', 'Fees Receivable',                 'asset', 'current_asset',  'Unpaid fees',                               true),
  ('1130', 'Defaulted Loans',                 'asset', 'current_asset',  'Non-performing loans',                      true),
  -- ── ASSETS: Investments ──────────────────────────────────────────────────
  ('1200', 'Investment Securities',           'asset', 'fixed_asset',    'Stocks, bonds, etc.',                       true),
  ('1210', 'Treasury Bills',                  'asset', 'fixed_asset',    'Government securities',                     true),
  ('1220', 'Fixed Deposits with Banks',       'asset', 'fixed_asset',    'Interbank placements',                      true),
  -- ── LIABILITIES: Customer Deposits ───────────────────────────────────────
  ('2000', 'Current Accounts',                'liability', 'current_liability', 'Customer demand deposits',           true),
  ('2010', 'Savings Accounts',                'liability', 'current_liability', 'Interest-bearing deposits',          true),
  ('2020', 'Fixed Deposits',                  'liability', 'current_liability', 'Time-bound deposits',                true),
  ('2030', 'Dormant Accounts',                'liability', 'current_liability', 'Inactive customer funds',            true),
  -- ── LIABILITIES: Interest & Fees ─────────────────────────────────────────
  ('2100', 'Interest Payable',                'liability', 'current_liability', 'Interest owed to customers',         true),
  ('2110', 'Fees Collected in Advance',       'liability', 'current_liability', 'Prepaid fees',                       true),
  -- ── LIABILITIES: Borrowings ───────────────────────────────────────────────
  ('2200', 'Bank Borrowings',                 'liability', 'long_term_liability', 'Loans from other banks',           true),
  ('2210', 'Inter-bank Liabilities',          'liability', 'long_term_liability', 'Due to other banks',               true),
  -- ── LIABILITIES: Other ───────────────────────────────────────────────────
  ('2300', 'Accrued Expenses',                'liability', 'current_liability', 'Unpaid operating expenses',          true),
  ('2310', 'Tax Payable',                     'liability', 'current_liability', 'Due to tax authorities',             true),
  ('2320', 'Salary Payable',                  'liability', 'current_liability', 'Unpaid employee wages',              true),
  -- ── EQUITY ───────────────────────────────────────────────────────────────
  ('3000', 'Share Capital',                   'equity', 'equity', 'Owner investments',                                true),
  ('3010', 'Retained Earnings',               'equity', 'equity', 'Accumulated profits',                             true),
  ('3020', 'Current Year Profit',             'equity', 'equity', 'This period''s earnings',                         true),
  ('3030', 'General Reserve',                 'equity', 'equity', 'Reserved for contingencies',                      true),
  ('3040', 'Statutory Reserve',               'equity', 'equity', 'Regulatory requirement',                          true),
  -- ── REVENUE: Interest Income ──────────────────────────────────────────────
  ('4000', 'Loan Interest Income',            'revenue', 'interest_income', 'Interest from loans',                    true),
  ('4010', 'Overdraft Interest',              'revenue', 'interest_income', 'Overdraft fees',                         true),
  -- ── REVENUE: Fee Income ───────────────────────────────────────────────────
  ('4100', 'Account Maintenance Fees',        'revenue', 'fee_income', 'Monthly account fees',                        true),
  ('4110', 'Transaction Fees',                'revenue', 'fee_income', 'Per-transaction charges',                     true),
  ('4120', 'ATM Withdrawal Fees',             'revenue', 'fee_income', 'ATM usage fees',                              true),
  ('4130', 'Transfer Fees',                   'revenue', 'fee_income', 'Inter-account transfers',                     true),
  ('4140', 'Late Payment Fees',               'revenue', 'fee_income', 'Penalty fees',                                true),
  -- ── REVENUE: Other Income ─────────────────────────────────────────────────
  ('4200', 'Investment Income',               'revenue', 'other_income', 'Returns on investments',                    true),
  ('4210', 'Foreign Exchange Gain',           'revenue', 'other_income', 'Currency conversion profit',                true),
  ('4220', 'Commission Income',               'revenue', 'other_income', 'Third-party services',                      true),
  -- ── EXPENSES: Interest ───────────────────────────────────────────────────
  ('5000', 'Interest on Savings',             'expense', 'interest_expense', 'Paid to savings customers',             true),
  ('5010', 'Interest on Deposits',            'expense', 'interest_expense', 'Paid on fixed deposits',                true),
  ('5020', 'Borrowing Interest',              'expense', 'interest_expense', 'Interest on bank loans',                true),
  -- ── EXPENSES: Operating ──────────────────────────────────────────────────
  ('5100', 'Employee Salaries',               'expense', 'operating_expense', 'Staff compensation',                   true),
  ('5110', 'Rent Expense',                    'expense', 'operating_expense', 'Office rent',                          true),
  ('5120', 'Utilities',                       'expense', 'operating_expense', 'Electricity, water, internet',         true),
  ('5130', 'Software Maintenance',            'expense', 'operating_expense', 'App upkeep costs',                     true),
  ('5140', 'Marketing Expense',               'expense', 'operating_expense', 'Advertising and promotions',           true),
  ('5150', 'Transaction Processing',          'expense', 'operating_expense', 'Payment gateway fees',                 true),
  -- ── EXPENSES: Provisions ─────────────────────────────────────────────────
  ('5200', 'Loan Loss Provision',             'expense', 'provision', 'Expected loan defaults',                       true),
  ('5210', 'Bad Debt Write-off',              'expense', 'provision', 'Actual loan losses',                           true),
  -- ── EXPENSES: Other ──────────────────────────────────────────────────────
  ('5300', 'Depreciation',                    'expense', 'other_expense', 'Asset value reduction',                    true),
  ('5310', 'Insurance Expense',               'expense', 'other_expense', 'Coverage costs',                           true),
  ('5320', 'Professional Fees',               'expense', 'other_expense', 'Legal, audit services',                    true)
on conflict (code) do nothing;

-- RLS
alter table gl_accounts enable row level security;
alter table gl_entries enable row level security;
create policy "allow_all_authenticated" on gl_accounts for all using (true) with check (true);
create policy "allow_all_authenticated" on gl_entries for all using (true) with check (true);
