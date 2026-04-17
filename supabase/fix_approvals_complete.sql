-- ============================================================
-- COMPLETE APPROVALS FIX
-- Run this entire script in Supabase SQL Editor.
-- It is safe to run multiple times (idempotent).
-- ============================================================

-- ── 1. Ensure pending_approvals table exists with correct schema ──────────────
create table if not exists pending_approvals (
  id             uuid primary key default uuid_generate_v4(),
  type           text not null,          -- 'customer','account','collection','transaction','loan'
  payload        jsonb not null default '{}',
  submitted_by   uuid,                   -- no FK — can be user OR collector UUID
  submitter_name text,
  submitted_at   timestamptz default now(),
  status         text not null default 'pending'
                   check (status in ('pending','approved','rejected')),
  approved_by    uuid,
  approver_name  text,
  approved_at    timestamptz,
  rejected_by    uuid,
  rejector_name  text,
  rejected_at    timestamptz,
  reject_reason  text
);

-- ── 2. Add any missing columns (safe if already exist) ───────────────────────
alter table pending_approvals
  add column if not exists approved_by    uuid,
  add column if not exists approver_name  text,
  add column if not exists approved_at    timestamptz,
  add column if not exists rejected_by    uuid,
  add column if not exists rejector_name  text,
  add column if not exists rejected_at    timestamptz,
  add column if not exists reject_reason  text;

-- ── 3. Drop any FK on submitted_by that blocks collector UUIDs ───────────────
alter table pending_approvals
  drop constraint if exists pending_approvals_submitted_by_fkey;
alter table pending_approvals
  drop constraint if exists pending_approvals_submitted_by_fkey1;
alter table pending_approvals
  alter column submitted_by drop not null;

-- ── 4. Ensure pending_transactions has all needed columns ────────────────────
alter table pending_transactions
  add column if not exists approved_by   uuid,
  add column if not exists approver_name text,
  add column if not exists approved_at   timestamptz,
  add column if not exists rejected_by   uuid,
  add column if not exists rejector_name text,
  add column if not exists rejected_at   timestamptz,
  add column if not exists reject_reason text;

-- Drop FK on submitted_by if it references users (teller UUID may not be in users)
alter table pending_transactions
  drop constraint if exists pending_transactions_submitted_by_fkey;
alter table pending_transactions
  drop constraint if exists pending_transactions_approved_by_fkey;
alter table pending_transactions
  drop constraint if exists pending_transactions_rejected_by_fkey;

-- ── 5. Enable RLS on both tables ─────────────────────────────────────────────
alter table pending_approvals    enable row level security;
alter table pending_transactions enable row level security;
alter table system_settings      enable row level security;

-- ── 6. Drop old policies and create open anon+authenticated policies ──────────

-- pending_approvals
drop policy if exists "allow_all_authenticated"              on pending_approvals;
drop policy if exists "allow_anon_select_pending_approvals"  on pending_approvals;
drop policy if exists "allow_anon_insert_pending_approvals"  on pending_approvals;
drop policy if exists "allow_anon_update_pending_approvals"  on pending_approvals;

create policy "pending_approvals_all"
  on pending_approvals for all
  using (true) with check (true);

-- pending_transactions
drop policy if exists "allow_all_authenticated"                  on pending_transactions;
drop policy if exists "allow_anon_select_pending_transactions"   on pending_transactions;
drop policy if exists "allow_anon_insert_pending_transactions"   on pending_transactions;
drop policy if exists "allow_anon_update_pending_transactions"   on pending_transactions;

create policy "pending_transactions_all"
  on pending_transactions for all
  using (true) with check (true);

-- system_settings
drop policy if exists "allow_all_authenticated"            on system_settings;
drop policy if exists "allow_anon_select_system_settings"  on system_settings;

create policy "system_settings_all"
  on system_settings for all
  using (true) with check (true);

-- ── 7. Ensure system_settings has approval_rules with collector role ──────────
insert into system_settings (key, value) values (
  'approval_rules',
  '{
    "credit_threshold":   {"enabled":true,  "amount":500,  "roles":["teller","collector"]},
    "debit_threshold":    {"enabled":true,  "amount":500,  "roles":["teller","collector"]},
    "transfer_threshold": {"enabled":true,  "amount":1000, "roles":["teller","manager"]},
    "account_opening":    {"enabled":true,  "roles":["teller","collector"]},
    "loan_creation":      {"enabled":true,  "roles":["teller"]},
    "gl_entry":           {"enabled":true,  "roles":["teller","manager"]},
    "customer_creation":  {"enabled":false, "roles":["teller"]},
    "user_creation":      {"enabled":false, "roles":[]}
  }'::jsonb
)
on conflict (key) do update
  set value = jsonb_set(
                jsonb_set(
                  system_settings.value,
                  '{credit_threshold,roles}',  '["teller","collector"]'::jsonb
                ),
                '{debit_threshold,roles}',     '["teller","collector"]'::jsonb
              ),
      updated_at = now();

-- ── 8. Add to realtime publication ───────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'pending_approvals'
  ) then
    alter publication supabase_realtime add table pending_approvals;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'pending_transactions'
  ) then
    alter publication supabase_realtime add table pending_transactions;
  end if;
end $$;

alter table pending_approvals    replica identity full;
alter table pending_transactions replica identity full;

-- ── 9. Verify — shows current data counts ────────────────────────────────────
select 'pending_transactions' as tbl, status, count(*) from pending_transactions group by status
union all
select 'pending_approvals'    as tbl, status, count(*) from pending_approvals    group by status
order by tbl, status;
