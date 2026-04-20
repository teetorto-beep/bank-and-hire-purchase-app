-- ============================================================
-- MAJUPAT LOVE ENTERPRISE — MASTER SETUP SCRIPT
-- Run this SINGLE file in your new Supabase SQL Editor.
-- It includes everything in the correct order.
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Users ─────────────────────────────────────────────────────────────────────
create table if not exists users (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  email       text unique not null,
  password    text not null,
  role        text not null default 'teller' check (role in ('admin','manager','teller','collector','viewer')),
  phone       text,
  status      text not null default 'active' check (status in ('active','inactive')),
  permissions jsonb default null,
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
  app_username    text unique,
  app_password    text,
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
  teller_phone    text,
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

-- ── Pending Transactions ──────────────────────────────────────────────────────
create table if not exists pending_transactions (
  id              uuid primary key default uuid_generate_v4(),
  account_id      uuid not null references accounts(id),
  type            text not null check (type in ('credit','debit')),
  amount          numeric(15,2) not null,
  narration       text not null,
  channel         text default 'teller',
  submitted_by    uuid,
  submitter_name  text,
  submitted_at    timestamptz default now(),
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by     uuid,
  approver_name   text,
  approved_at     timestamptz,
  rejected_by     uuid,
  rejector_name   text,
  rejected_at     timestamptz,
  reject_reason   text
);

-- ── Pending Approvals (collector account opening requests) ────────────────────
create table if not exists pending_approvals (
  id                     uuid primary key default uuid_generate_v4(),
  type                   text not null,
  payload                jsonb not null default '{}',
  submitted_by           uuid,
  submitter_name         text,
  submitted_at           timestamptz default now(),
  status                 text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by            uuid,
  approver_name          text,
  approved_at            timestamptz,
  rejected_by            uuid,
  rejector_name          text,
  rejected_at            timestamptz,
  reject_reason          text,
  account_number_created text
);

-- ── Products ──────────────────────────────────────────────────────────────────
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

-- ── HP Items ──────────────────────────────────────────────────────────────────
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
  loan_id             uuid,
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

-- ── Loans ─────────────────────────────────────────────────────────────────────
create table if not exists loans (
  id                uuid primary key default uuid_generate_v4(),
  customer_id       uuid not null references customers(id),
  account_id        uuid not null references accounts(id),
  type              text not null check (type in ('personal','hire_purchase','micro','mortgage','emergency','group')),
  amount            numeric(15,2) not null,
  outstanding       numeric(15,2) not null,
  total_repayment   numeric(15,2),
  interest_rate     numeric(5,2) not null,
  tenure            int not null,
  monthly_payment   numeric(15,2),
  status            text not null default 'pending' check (status in ('pending','active','overdue','completed','rejected')),
  purpose           text,
  hp_agreement_id   uuid references hp_agreements(id),
  item_name         text,
  disbursed_at      timestamptz,
  next_due_date     timestamptz,
  last_payment_date timestamptz,
  created_by        uuid references users(id),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Add FK from hp_agreements.loan_id to loans
alter table hp_agreements
  drop constraint if exists hp_agreements_loan_id_fkey;
alter table hp_agreements
  add constraint hp_agreements_loan_id_fkey
  foreign key (loan_id) references loans(id)
  deferrable initially deferred;

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

-- ── Collector Assignments ─────────────────────────────────────────────────────
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

-- ── Deduction Rules ───────────────────────────────────────────────────────────
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

-- ── Notifications ─────────────────────────────────────────────────────────────
create table if not exists notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null,
  title       text not null,
  message     text not null,
  type        text not null default 'info' check (type in ('info','success','warning','error')),
  entity      text,
  entity_id   text,
  read        boolean not null default false,
  created_at  timestamptz default now()
);

-- ── System Settings ───────────────────────────────────────────────────────────
create table if not exists system_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz default now(),
  updated_by  text
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

-- ── GL Accounts ───────────────────────────────────────────────────────────────
create table if not exists gl_accounts (
  id            uuid primary key default uuid_generate_v4(),
  code          text unique not null,
  name          text not null,
  type          text not null check (type in ('asset','liability','equity','revenue','expense')),
  category      text not null,
  description   text,
  parent_code   text,
  is_system     boolean default false,
  balance       numeric(15,2) default 0,
  status        text default 'active' check (status in ('active','inactive')),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── GL Entries ────────────────────────────────────────────────────────────────
create table if not exists gl_entries (
  id              uuid primary key default uuid_generate_v4(),
  journal_ref     text not null,
  gl_account_id   uuid not null references gl_accounts(id),
  gl_account_code text not null,
  gl_account_name text not null,
  entry_type      text not null check (entry_type in ('debit','credit')),
  amount          numeric(15,2) not null check (amount > 0),
  narration       text not null,
  source_type     text,
  source_id       text,
  transaction_ref text,
  posted_by       text,
  period_month    int,
  period_year     int,
  created_at      timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_accounts_customer    on accounts(customer_id);
create index if not exists idx_accounts_number      on accounts(account_number);
create index if not exists idx_transactions_account on transactions(account_id);
create index if not exists idx_transactions_created on transactions(created_at desc);
create index if not exists idx_transactions_reference on transactions(reference);
create index if not exists idx_loans_customer       on loans(customer_id);
create index if not exists idx_hp_agreements_customer on hp_agreements(customer_id);
create index if not exists idx_hp_payments_agreement  on hp_payments(agreement_id);
create index if not exists idx_pending_status       on pending_transactions(status);
create index if not exists idx_audit_timestamp      on audit_log(timestamp desc);
create index if not exists idx_customers_phone      on customers(phone);
create index if not exists idx_customers_ghana_card on customers(ghana_card);
create index if not exists idx_notifications_user   on notifications(user_id);
create index if not exists idx_notifications_unread on notifications(user_id, read) where read = false;
create index if not exists idx_gl_entries_journal   on gl_entries(journal_ref);
create index if not exists idx_gl_entries_account   on gl_entries(gl_account_id);
create index if not exists idx_gl_entries_period    on gl_entries(period_year, period_month);

-- ============================================================
-- ROW LEVEL SECURITY — allow all (open policies)
-- ============================================================
alter table users                enable row level security;
alter table customers            enable row level security;
alter table accounts             enable row level security;
alter table transactions         enable row level security;
alter table pending_transactions enable row level security;
alter table pending_approvals    enable row level security;
alter table loans                enable row level security;
alter table products             enable row level security;
alter table hp_items             enable row level security;
alter table hp_agreements        enable row level security;
alter table hp_payments          enable row level security;
alter table collectors           enable row level security;
alter table collector_assignments enable row level security;
alter table collections          enable row level security;
alter table deduction_rules      enable row level security;
alter table audit_log            enable row level security;
alter table notifications        enable row level security;
alter table system_settings      enable row level security;
alter table gl_accounts          enable row level security;
alter table gl_entries           enable row level security;

-- Open policies for all tables (anon + authenticated)
do $$
declare t text;
begin
  foreach t in array array[
    'users','customers','accounts','transactions','pending_transactions',
    'pending_approvals','loans','products','hp_items','hp_agreements',
    'hp_payments','collectors','collector_assignments','collections',
    'deduction_rules','audit_log','notifications','system_settings',
    'gl_accounts','gl_entries'
  ] loop
    execute format('drop policy if exists "open_all" on %I', t);
    execute format('create policy "open_all" on %I for all using (true) with check (true)', t);
  end loop;
end $$;

-- ============================================================
-- REALTIME
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='transactions') then
    alter publication supabase_realtime add table transactions; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='accounts') then
    alter publication supabase_realtime add table accounts; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='loans') then
    alter publication supabase_realtime add table loans; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='collections') then
    alter publication supabase_realtime add table collections; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='customers') then
    alter publication supabase_realtime add table customers; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='notifications') then
    alter publication supabase_realtime add table notifications; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='pending_transactions') then
    alter publication supabase_realtime add table pending_transactions; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='pending_approvals') then
    alter publication supabase_realtime add table pending_approvals; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='hp_agreements') then
    alter publication supabase_realtime add table hp_agreements; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='hp_payments') then
    alter publication supabase_realtime add table hp_payments; end if;
end $$;

alter table transactions         replica identity full;
alter table loans                replica identity full;
alter table hp_agreements        replica identity full;
alter table accounts             replica identity full;
alter table collections          replica identity full;
alter table notifications        replica identity full;
alter table pending_approvals    replica identity full;
alter table customers            replica identity full;
alter table pending_transactions replica identity full;
alter table hp_payments          replica identity full;

-- ============================================================
-- SEED DATA
-- ============================================================
insert into users (id, name, email, password, role) values
  ('00000000-0000-0000-0000-000000000001', 'Admin User',  'admin@majupat.com',  'admin123',  'admin'),
  ('00000000-0000-0000-0000-000000000002', 'Teller One',  'teller@majupat.com', 'teller123', 'teller')
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

-- ============================================================
-- GL CHART OF ACCOUNTS
-- ============================================================
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
-- DONE ✅
-- ============================================================
select 'Setup complete! Tables created: ' || count(*)::text as result
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';
